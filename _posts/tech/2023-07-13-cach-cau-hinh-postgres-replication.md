---
layout: post
title: Cách cài đặt PostgreSQL Database Replication
category: tech
---

Database replication là quá trình sao chép dữ liệu từ một primary server sang nhiều server được gọi là replicas. Primary server chấp nhận các hành động đọc/ ghi trong khi các replicas thực hiện các read-only transactions. Primary server và các replicas cùng nhau tạo thành một cụm cơ sở dữ liệu(database cluster).

Mục đích của database replication là để đảm bảo dự phòng(redundancy), (nhất quán)consistency, tính sẵn sàng cao(high availability) và khả năng truy cập dữ liệu(accessibility of data), đặc biệt là trong các ứng dụng quan trọng, có lưu lượng truy cập cao.

PostgreSQL cung cấp hai phương pháp replication: sao chép vật lý (streaming) và sao chép logic. Cả hai phương pháp này được sử dụng cho các trường hợp khác nhau và người dùng có thể chọn một trong hai tùy thuộc vào mục đích.


### 1. Physical PostgreSQL Replication
Đây là kiểu sao chép phổ biến nhất trong PostgreSQL. Physical replication duy trì một bản sao đầy đủ của toàn bộ dữ liệu của một cluster. Nó sử dụng chính xác các block data ở primary và thực hiện sao chép từng byte. Nói một cách đơn giản hơn, toàn bộ tập hợp dữ liệu trên primary server sẽ được sao chép sang replicas hoạt động như một nút dự phòng(standby node).

Physical replication không sao chép một đối tượng cụ thể của primary database cluster, chẳng hạn như một row dữ liệu trong một table. Thay vào đó, nó hoạt động ở cấp độ disk block và mirror all dữ liệu sang các replica nodes; bao gồm tất cả các tables trong mỗi cơ sở dữ liệu.

#### Use cases
- Hầu hết được sử dụng để thiết lập và disaster recovery vì tất cả replicas đều giống hệt nhau.
- Được đề xuất khi xử lý với database có dung lượng dữ liệu lớn

#### Pros
- Nó rất dễ thực hiện vì tất cả các cụm cơ sở dữ liệu đều giống hệt nhau.
- Nó đảm bảo tính nhất quán của dữ liệu và tính sẵn sàng cao tại bất kỳ thời điểm nào vì tất cả các replica nodes đều chứa các bản sao dữ liệu giống hệt nhau.
- Giải quyết các nhu cầu chỉ đọc(read-only) trên replica nodes
- Nó rất hiệu quả vì nó không yêu cầu bất kỳ xử lý đặc biệt nào.

#### Cons
- Tốn nhiều băng thông vì toàn bộ dữ liệu được sao chép chứ không chỉ các phần nhỏ dữ liệu trên primary server.
- Không cung cấp bản replication hỗ trợ multi-master (multi-primary)


### 2. Logical PostgreSQL Replication
Logical Replication lần đầu tiên được giới thiệu trong PostgreSQL 9.0. Nó hoạt động bằng cách sao chép các đối tượng dữ liệu và những thay đổi của chúng dựa trên một mã định danh duy nhất, chẳng hạn như khóa chính(primary key). Nói một cách đơn giản hơn, logical replication sao chép các đối tượng cơ sở dữ liệu theo mô hình dựa trên rows data và trái ngược với physical replication là gửi mọi thứ đến các replica nodes.

Do đó, logical replication cung cấp khả năng kiểm soát chi tiết đối với sao chép dữ liệu trái ngược với physical replication.

#### Use cases
Các trường hợp sử dụng điển hình của logical replication bao gồm:

- Sao chép giữa các major verions khác nhau của PostgreSQL.
- Sao chép giữa các phiên bản PostgreSQL được lưu trữ trên các nền tảng khác nhau, ví dụ: từ Linux sang Windows.
- Gửi các thay đổi trong cơ sở dữ liệu tới các replicas khi chúng diễn ra trong thời gian thực.
- Cấp quyền truy cập vào dữ liệu được sao chép cho các nhóm người dùng khác nhau.

#### Pros
- Lý tưởng để tạo ra backup incremental
- Thường được đề xuất cho các database cluster đòi hỏi tính sẵn sàng cao nhờ hiệu suất tốt hơn và ít mất dữ liệu.
- Tối ưu hóa băng thông vì chỉ những thay đổi row data mới được gửi đến các replica nodes thay vì toàn bộ dữ liệu.
- Được sử dụng trong multi-master replication mà không thể sử dụng physical replication.
- Hỗ trợ sao chép trên các nền tảng hệ điều hành khác nhau, ví dụ: Linux sang windows và ngược lại.

#### Cons
- Không thể truyền lượng lớn dữ liệu khi chúng diễn ra trong thời gian thực.
- Quá trình sao chép phức tạp hơn so với sao chép vật lý.
- Sử dụng tài nguyên cao trên các replica nodes.


### 3. Cài đặt Physical PostgreSQL Replication trên Ubuntu 22.04

Các bước cài đặt được thực hiện dựa trên mô hình sau:

![](/images/2023-07-13-cach-cau-hinh-postgres-replication/struct.png)

| Node's Role | IP Address    | OS Name      |
| ----------  | ----------    | Ubuntu 22.04 |
| Primary     | 10.26.235.75  | Ubuntu 22.04 |
| Replica     | 10.26.235.206 | Ubuntu 22.04 |

Các command được thực hiện với user root


#### Step 1: Install PostgreSQL Server

Đầu tiên, chúng ta cài đặt các packages yêu cầu như sau:
```bash
apt update && apt install postgresql postgresql-contrib -y
```
Khi cài đặt postgres, hệ thống sẽ tạo ra một user tên là `postgres` và sử dụng file cấu hình `postgresql.conf` được tìm thấy trong thư mục `/etc/postgresql/<postgre_version>/main/`

Sau khi quá trình cài đặt hoàn tất, postgres sẽ được tự động bật lên. Có thể kiểm tra bằng command sau:
```bash
root@nahida:~# systemctl status postgresql
● postgresql.service - PostgreSQL RDBMS
     Loaded: loaded (/lib/systemd/system/postgresql.service; enabled; vendor preset: enabled)
     Active: active (exited) since Sat 2023-07-13 10:35:47 +07; 1min 02s ago
   Main PID: 3422896 (code=exited, status=0/SUCCESS)
      Tasks: 0 (limit: 9507)
     Memory: 0B
     CGroup: /system.slice/postgresql.service

Jul 13 10:35:47 nahida systemd[1]: Starting PostgreSQL RDBMS...
Jul 13 10:35:47 nahida systemd[1]: Finished PostgreSQL RDBMS.
```

Cấu hình để service tự động start khi server khởi động lại
```bash
root@nahida:~# systemctl enable postgresql
Synchronizing state of postgresql.service with SysV service script with /lib/systemd/systemd-sysv-install.
Executing: /lib/systemd/systemd-sysv-install enable postgresql
```


#### Step 2: Configure Primary Node
Thực hiện truy cập đến node primary và login với user `postgres`
```bash
sudo -u postgres psql
```

Trước khi cấu hình replication, chúng ta cần phải tạo ra một user để sử dụng cho quá trình replication. Do đó, hãy chạy lệnh sau để tạo user `replicator` và gán đặc quyền `REPLICATION`.
```bash
postgres=# CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'P@ssword321';
CREATE ROLE
```
trong đó:
- `replicator` là tên user cần tạo
- `P@ssword321` là password sử dụng cho user `replicator`


Tiếp theo, chúng ta cần cấu hình để đảm bảo replica node có thể kết nối đến primary node bằng cách cấu hình như sau:
```bash
#------------------------------------------------------------------------------
# CONNECTIONS AND AUTHENTICATION
#------------------------------------------------------------------------------

# - Connection Settings -

listen_addresses = '10.26.235.75'               # what IP address(es) to listen on;
                                        # comma-separated list of addresses;
                                        # defaults to 'localhost'; use '*' for all
                                        # (change requires restart)
port = 5432                             # (change requires restart)
```

Tiếp theo, tìm đến config `wal_level`. Cài đặt này chỉ định lượng thông tin sẽ được ghi vào tệp Write Ahead Log (WAL).
```bash
#------------------------------------------------------------------------------
# WRITE-AHEAD LOG
#------------------------------------------------------------------------------

# - Settings -

wal_level = logical                     # minimal, replica, or logical
                                        # (change requires restart)
```

Tiếp theo, tìm đến config `wal_log_hints`. Cấu hình thành `on` để cho phép PostgreSQL ghi toàn bộ nội dung của mỗi disk page vào tệp WAL trong lần sửa đổi đầu tiên của page.
```bash
#wal_compression = off                  # enable compression of full-page writes
wal_log_hints = on                      # also do full page writes of non-critical updates
                                        # (change requires restart)
```

Tiếp theo truy cập vào file cấu hình `/etc/postgresql/<postgre_version>/main/pg_hba.conf`
Thêm vào cuối tệp cấu hình cho phép replica node ( 10.26.235.206 ) kết nối với primary node bằng cách sử dụng `replicator`.
```bash
host  replication   replicator  10.26.235.206/32   md5
```

Lưu các thay đổi. Sa đó restart lại service
```bash
systemctl restart postgresql
```


#### Step 3: Configure Replica Node
Trước khi replica node có thể bắt đầu sao chép dữ liệu từ primary node, bạn cần tạo một bản sao thư mục dữ liệu của primary node sang thư mục dữ liệu của replica node. Để đạt được điều này, trước tiên, hãy dừng dịch vụ PostgreSQL trên replica node.
```bash
systemctl stop postgresql
```

Tiếp theo, xóa tất cả các tệp trong thư mục dữ liệu của replica node để bắt đầu.
```bash
rm -rf /var/lib/postgresql/<postgre_version>/main/
```

Bây giờ hãy chạy command `pg_basebackup` như sau để sao chép dữ liệu từ primary node sang replica node
```bash
root@signora:~# pg_basebackup -h 10.26.235.75 -U replicator -X stream -C -S rep_10_26_235_75 -v -R -W -D /var/lib/postgresql/<postgre_version>/main/
Password:
pg_basebackup: initiating base backup, waiting for checkpoint to complete
pg_basebackup: checkpoint completed
pg_basebackup: write-ahead log start point: 0/2000028 on timeline 1
pg_basebackup: starting background WAL receiver
pg_basebackup: created replication slot "rep_10_26_235_75"
pg_basebackup: write-ahead log end point: 0/2000100
pg_basebackup: waiting for background process to finish streaming ...
pg_basebackup: syncing data to disk ...
pg_basebackup: base backup completed
```
trong đó:
- `-h`: Tùy chọn này chỉ định máy chủ, trong trường hợp này là địa chỉ IP của primary node.
- `-U`: Tùy chọn chỉ định người dùng sao chép. Đây là người dùng đã được định cấu hình trên primary node và sẽ được replica node sử dụng để kết nối với nó. Trong trường hợp của chúng ta, người dùng sao chép được gọi là replicator.
- bạn có thể xem thêm [ở đây](https://www.postgresql.org/docs/current/app-pgbasebackup.html)

Sau đó, thực hiện lệnh sau trên replica node để cấp quyền sở hữu thư mục dữ liệu cho người dùng `postgres`.
```bash
chown postgres -R /var/lib/postgresql/<postgre_version>/main/
```
và thực hiện start posgresql service trên node replica node
```bash
systemctl start postgresql
```

#### Step 4: Test The Replication Setup

Để kiểm tra trạng thái replication, kết nối đến primary node và thực hiện query như sau:
```bash
postgres=# select * from pg_stat_replication ;
   pid   | usesysid |  usename   | application_name |  client_addr  | client_hostname | client_port |         backend_start         | backend_xmin |   state   | sent_lsn  | write_lsn | flush_lsn | replay_lsn | write_lag | flush_lag | replay_lag | sync_priority | sync_state |          reply_time
---------+----------+------------+------------------+---------------+-----------------+-------------+-------------------------------+--------------+-----------+-----------+-----------+-----------+------------+-----------+-----------+------------+---------------+------------+-------------------------------
 3477655 |    16384 | replicator | 15/main          | 10.26.235.206 |                 |       58708 | 2023-07-13 11:33:01.406553+07 |              | streaming | 0/3000148 | 0/3000148 | 0/3000148 | 0/3000148  |           |           |            |             0 | async      | 2023-07-13 11:33:11.507075+07
(1 row)
```

nếu trạng thái là `streaming` có nghĩa là đã cấu hình thành công.
