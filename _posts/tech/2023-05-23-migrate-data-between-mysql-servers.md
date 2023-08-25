---
layout: post
title: Migrate data giữa các MariaDB/ MySQL server
category: tech
---


# Vấn đề

Trong [bài viết](https://botranvan.github.io/2023-05-12-migrate-data-postgres-use-pglogical-extension.html) mình đã thực hiện việc migrate data giữa các các server từ môi trường này đến môi trường khác vẫn luôn là vấn đề cần được quan tâm.

Để migrate data của MariaDB/ MySQL giữa các server mà thời gian downtime ít nhất, chúng ta có thể setup server cần migrate data
thành một replica server sau đó demote server ở môi trường không dùng đến thành replica server và ngược lại.
Thực hiện như này sẽ giúp chúng ta có thể rollback lại dễ dàng trong trường hợp cần thiết mà không cần phải lo lắng quá nhiều
về việc mất mát dữ liệu.


# Yêu cầu cần có trước khi thực hiện cấu hình

Để có thể thực hiện cấu hình thì các database node cần được cài đặt và bin log đã được enable:

```bash
[mysqld]
log_bin = /var/lib/mysql/data/mariadb-bin.log
binlog_format = MIXED
log_slave_updates = ON
```

trên node replica sẽ cần thêm cấu hình sau `read_only = true`.

Thông thường, đối với việc sử dụng DBaaS trên các Cloud Provider, chúng ta không cần phải thực hiện việc này.
Tuy nhiên, chúng ta cần phải thực hiện như sau khi không sử dụng DBaaS.
Các command sau đây, mình đã thực hiện trên hệ điều hành Ubuntu 22.04 & MariaDB version 10.4 cùng mô hình sau đây:

![](/images/2023-05-23-migrate-data-between-mysql-servers/struct.png)

trong đó:
- Node MariaDB (bên trái) là source node và đang có dữ liệu
- Node MariaDB (bên phải) là destination node và đang chưa có dữ liệu.

chúng ta sẽ thực hiện migrate data từ source node sang destination node.


# Thực hiện cấu hình

### 1. Thực hiện công việc chuẩn bị cho cấu hình

Trên source node, để có thể cấu hình replica giữa các node và đồng bộ dữ liệu, chúng ta cần phải tạo ra một user để cho phép thực hiện điều này như sau:

```bash
CREATE USER 'REPLICATION_USER'@'%' IDENTIFIED BY 'REPLICATION_PASSWORD';
GRANT REPLICATION SLAVE ON *.* TO 'REPLICATION_USER'@'%';
```

trong đó:
- `REPLICATION_USER` là username sẽ được tạo
- `REPLICATION_PASSWORD` là password của username bên trên

Thực hiện dump database để có thể import vào destination node:

```bash
mysqldump --databases <databasename> > <databasename>.sql
```

trong đó:
- databasename là tên database mà bạn muốn dữ liệu được di chuyển sang destination node. Tuy nhiên thì bạn cũng có thể thực hiện dump toàn bộ dữ liệu trên destination node nếu như muốn di chuyển toàn bộ database.

Trên destination node, thực hiện import data đã dump ở trên vào destination node:

```bash
mysql --user=root --password < <databasename>.sql
```

Tại thời điểm này, chúng ta cần thay đổi config server-id để destination node có thể là unique trong cluster

```bash
[mysqld]
binlog_format=ROW
expire_logs_days=1
log_bin=mysql-bin
log_slave_updates=ON
read_only=ON
server-id=[SERVER_ID]
```

Thực hiện restart lại database service để đọc cấu hình mới với command:

```bash
systemctl restart mysql
```

### 2. Thực hiện cấu hình

Tại thời điểm này, trên destination node chúng ta cần phải chỉ định source node là source data để có thể đồng bộ dữ liệu với nhau. Thực hiện kết nối vào database trên destination node, sau đó chỉ định với command sau:

```bash
CHANGE MASTER TO MASTER_HOST='MASTER_IP_ADDRESS', MASTER_USER='REPLICATION_USER', MASTER_PASSWORD='REPLICATION_PASSWORD';
```

trong đó:
- `REPLICATION_USER` là username đã được tạo ở source node
- `REPLICATION_PASSWORD` là password của username bên trên
- `MASTER_IP_ADDRESS` là IP của source node (10.26.235.156)

Bắt đầu replica dữ liệu với command:

```bash
START SLAVE;
```

Kiểm tra lại trạng thái replica với command:

```bash
SHOW SLAVE STATUS\G;
```

Nếu bạn nhìn thấy text `Waiting for master to send event` thì có nghĩa là đã cấu hình thành công.


# Thực hiện chuyển đổi destination node thành master node.

Trên source node, chúng ta thực hiện lock không cho ghi dữ liệu mới vào bằng cách kết nối đến source node và sử dụng command sau:

```bash
FLUSH TABLES WITH READ LOCK;
```

Kiểm tra current position binlog trên source node với command:

```bash
MariaDB [(none)]> show master status;
+------------------+----------+--------------+------------------+
| File             | Position | Binlog_Do_DB | Binlog_Ignore_DB |
+------------------+----------+--------------+------------------+
| mysql-bin.000001 |     1921 |              |                  |
+------------------+----------+--------------+------------------+
1 row in set (0.000 sec)

MariaDB [(none)]> SELECT @@global.gtid_binlog_pos;
+--------------------------+
| @@global.gtid_binlog_pos |
+--------------------------+
| 0-580468220-11           |
+--------------------------+
1 row in set (0.001 sec)
```

Sau khi chờ cho tất cả các dữ liệu đã được đồng bộ xong từ source node, chúng ta có thể thực hiện và kiểm tra với command:

```bash
MariaDB [(none)]> SHOW SLAVE STATUS \G
*************************** 1. row ***************************
                Slave_IO_State: Waiting for master to send event
                   Master_Host: 10.26.235.156
                   Master_User: REPLICATION_USER
                   Master_Port: 3306
                 Connect_Retry: 60
               Master_Log_File: mysql-bin.000001
           Read_Master_Log_Pos: 1921
                Relay_Log_File: mysqld-relay-bin.000003
                 Relay_Log_Pos: 1093
         Relay_Master_Log_File: mysql-bin.000001
              Slave_IO_Running: Yes
             Slave_SQL_Running: Yes
                           ...:
           Exec_Master_Log_Pos: 1921
               Relay_Log_Space: 2829
                 Parallel_Mode: conservative
                           ...:
                     SQL_Delay: 0
           SQL_Remaining_Delay: NULL
       Slave_SQL_Running_State: Slave has read all relay log; waiting for the slave I/O thread to update it
              Slave_DDL_Groups: 11
Slave_Non_Transactional_Groups: 0
    Slave_Transactional_Groups: 0
1 row in set (0.001 sec)
```

Ta đã thấy current position binlog ở cả source & destination node đã bằng nhau (1921) thông qua giá trị `Master_Log_File`, `Read_Master_Log_Pos` & `Exec_Master_Log_Pos`

Thực hiện shutdown trên source node với command:

```bash
MariaDB [(none)]> shutdown;
Query OK, 0 rows affected (0.001 sec)
```

Trên destination node, thực hiện bỏ config `read_only` đã thêm ban đầu và thực hiện reset master như sau:
```bash
MariaDB [(none)]> STOP ALL SLAVES;
Query OK, 0 rows affected, 1 warning (0.006 sec)

MariaDB [(none)]> RESET SLAVE ALL;
Query OK, 0 rows affected (0.001 sec)

MariaDB [(none)]> SHOW MASTER STATUS;
+------------------+----------+--------------+------------------+
| File             | Position | Binlog_Do_DB | Binlog_Ignore_DB |
+------------------+----------+--------------+------------------+
| mysql-bin.000001 |     2066 |              |                  |
+------------------+----------+--------------+------------------+
1 row in set (0.000 sec)

MariaDB [(none)]> SELECT @@global.gtid_binlog_pos;
+--------------------------+
| @@global.gtid_binlog_pos |
+--------------------------+
| 0-580468220-11           |
+--------------------------+
1 row in set (0.001 sec)

MariaDB [(none)]> SET @@global.read_only=0;
Query OK, 0 rows affected (0.000 sec)
```

Lúc này, chúng ta thực hiện reconect tất cả các kết nối cũ sang node destination để có thể tiếp tục đọc ghi dữ liệu.


### 3. Reconect source node

Để giảm thiếu rủi ro về dữ liệu xảy ra trong quá trình chuyển đổi, chúng ta có thể thực hiện reconect các replica của source node ban đầu tới destination node. Sau đó, thực hiện connect source node tiếp tục đồng bộ dữ liệu với destination node.

Thực hiện re-start MariaDB trên source node với config `read_only = true` & option sau:

```bash
mysqld --with-skip-slave-start <other options>
```

Config `read_only = true` sẽ đảm bảo khi source node được re-start sẽ không có bất kỳ sự cố nào xảy ra.
Connect đến source node và sử dụng command sau:

```bash
MariaDB [(none)]> set @@global.read_only=1;
Query OK, 0 rows affected (0.000 sec)

MariaDB [(none)]> STOP ALL SLAVES;
;Query OK, 0 rows affected (0.001 sec)

MariaDB [(none)]> RESET MASTER;
Query OK, 0 rows affected (0.024 sec)

MariaDB [(none)]> RESET SLAVE ALL;
Query OK, 0 rows affected (0.001 sec)
```

Thay đổi new master thành destination node với command:

```bash
MariaDB [(none)]> CHANGE MASTER TO MASTER_HOST='10.26.235.183', MASTER_USER='REPLICATION_USER', MASTER_PASSWORD='REPLICATION_PASSWORD',
    -> MASTER_PORT=3306, MASTER_USE_GTID=current_pos, MASTER_LOG_FILE="mysql-bin.000001", MASTER_LOG_POS=2066;
Query OK, 0 rows affected (0.054 sec)

MariaDB [(none)]> START SLAVE;
Query OK, 0 rows affected (0.019 sec)
```

Kiểm tra trạng thái đồng bộ với destination node với command:

```bash

MariaDB [(none)]> show slave status \G
*************************** 1. row ***************************
                Slave_IO_State: Waiting for master to send event
                   Master_Host: 10.26.235.183
                   Master_User: REPLICATION_USER
                   Master_Port: 3306
                 Connect_Retry: 60
               Master_Log_File: mysql-bin.000001
           Read_Master_Log_Pos: 2066
                Relay_Log_File: mysqld-relay-bin.000002
                 Relay_Log_Pos: 939
         Relay_Master_Log_File: mysql-bin.000001
              Slave_IO_Running: Yes
             Slave_SQL_Running: Yes
                           ...:
                    Last_Errno: 0
                    Last_Error:
                  Skip_Counter: 0
           Exec_Master_Log_Pos: 2066
               Relay_Log_Space: 1249
               Until_Condition: None
                           ...:
              Master_Server_Id: 377381538
                Master_SSL_Crl:
            Master_SSL_Crlpath:
                    Using_Gtid: Current_Pos
                   Gtid_IO_Pos: 0-377381538-12
       Replicate_Do_Domain_Ids:
   Replicate_Ignore_Domain_Ids:
                 Parallel_Mode: conservative
                     SQL_Delay: 0
           SQL_Remaining_Delay: NULL
       Slave_SQL_Running_State: Slave has read all relay log; waiting for the slave I/O thread to update it
              Slave_DDL_Groups: 2
Slave_Non_Transactional_Groups: 0
    Slave_Transactional_Groups: 0
1 row in set (0.000 sec)
```

Như vậy, chúng ta đã thành công trong việc migrate dữ liệu giữa 2 server database MariaDB.
