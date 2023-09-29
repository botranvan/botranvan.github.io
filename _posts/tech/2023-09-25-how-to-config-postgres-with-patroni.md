---
layout: post
title: High Availability Postgres with Patroni/ Spilo (Part 1)
category: tech
---


Bất kỳ một hệ thống nào, cho dù là Application, Websites, Workers/ Consumers, Database, ... khi được xem là quan trọng thì việc cần đảm bảo tính sẵn sàng cao (High Availability) vẫn luôn là tiêu chí được đưa ra mỗi khi triển khai.
Ngày hôm nay, mình muốn nói về High Availability cho Postgres bởi vì:
- Postgres chưa hỗ trợ chính thức cho việc High Availability
- Có rất nhiều công cụ 3-party hỗ trợ cho việc xây dựng một hệ thống High Availability cho Postgres

Trong khoảng thời gian gần đây, mình có gặp một bài toán liên quan đến Postgres và yêu cầu của bài toán là xây dựng phương án, giải pháp cho việc Postgres có thể lăn ra dừng hoạt động bất cứ lúc nào. Sau khi tham khảo các ý kiến của anh em System/ Cloud Engineer hay Devops thì mình thấy việc sử dụng Patroni (Spilo) là một giải pháp khá hoàn chỉnh cho việc xây dựng hệ thống High Availability cho Postgres.

Vậy thì cách triển khai và kết nối ở đây như thế nào?


### 1. Patroni/ Spilo là gì?

Theo như docs thì Patroni được mô tả như sau:

> Patroni is a template for high availability (HA) PostgreSQL solutions using Python. Patroni originated as a fork of [Governor](https://github.com/compose/governor), the project from Compose. It includes plenty of new features

và Spilo được mô tả như sau:

> For an example of a Docker-based deployment with Patroni, see [Spilo](https://github.com/zalando/spilo), currently in use at Zalando.

Tóm lại, Patroni được sử dụng để triển khai HA cho Postgres. Tuy nhiên, theo đánh giá của mình thì Spilo nên được lựa chọn là phương án triển khai mà chúng ta ưu tiên dùng.

### 2. Mô hình triển khai

Dưới đây là mô hình mà mình sẽ thực hiện triển khai:

![2023-09-25-how-to-config-postgres-with-patroni/arch.png](/images/2023-09-25-how-to-config-postgres-with-patroni/arch.png)

trong đó:
- ETCD là thành phần distributed lock sử dụng cho Patroni và được cấu hình kết nối với nhau như một ETCD cluster

Các thành phần Postgres, Patroni & ETCD được cài cùng với nhau trên một servers nhằm mục đích cho việc phức tạp hóa mô hình hệ thống và tiết kiệm chi phí, giảm thiểu rủi ro phát sinh trong tương lai.


### 2. Cách cấu hình

#### 2.1 Khởi tạo ban đầu

- Sau khi chúng ta đã cài đặt ETCD cluster và Postgres thành công. Chúng ta có thể cài đặt patroni như sau:
  ```bash
  apt -y install python3 python3-pip python3-dev libpq-dev

  pip3 install setuptools psycopg2>=3.0.0 patroni[etcd3,raft]
  ```

- Tạo file service `/lib/systemd/system/patroni.service` cho patroni
  ```bash
  [Unit]
  Description=Runners to orchestrate a high-availability PostgreSQL
  After=network.target
  ConditionPathExists=/etc/patroni/config.yml

  [Service]
  Type=simple

  User=postgres
  Group=postgres

  # Read in configuration file if it exists, otherwise proceed
  EnvironmentFile=-/etc/patroni_env.conf

  WorkingDirectory=~

  # Pre-commands to start watchdog device
  # Uncomment if watchdog is part of your patroni setup
  #ExecStartPre=-/usr/bin/sudo /sbin/modprobe softdog
  #ExecStartPre=-/usr/bin/sudo /bin/chown postgres /dev/watchdog

  # Start the patroni process
  ExecStart=/usr/bin/patroni /etc/patroni/config.yml

  # Send HUP to reload from patroni.yml
  ExecReload=/bin/kill -s HUP $MAINPID

  # only kill the patroni process, not it's children, so it will gracefully stop postgres
  KillMode=process

  # Give a reasonable amount of time for the server to start up/shut down
  TimeoutSec=30

  # Do not restart the service if it crashes, we want to manually inspect database on failure
  Restart=no

  [Install]
  WantedBy=multi-user.target
  ```

- Tạo file config `/etc/patroni/config.yml` cho patroni như sau:
   ```yaml
   bootstrap:
     dcs:
       failsafe_mode: true
       loop_wait: 15
       maximum_lag_on_failover: 33554432
       postgresql:
         parameters:
           archive_command: test ! -f /var/lib/postgresql/data/wal_archive/%f && cp %p
             /var/lib/postgresql/data/wal_archive/%f
           archive_mode: 'on'
           archive_timeout: 1800s
           datestyle: iso, mdy
           default_text_search_config: pg_catalog.english
           effective_cache_size: 512MB
           hot_standby: 'on'
           lc_messages: en_US.UTF-8
           lc_monetary: en_US.UTF-8
           lc_numeric: en_US.UTF-8
           lc_time: en_US.UTF-8
           log_destination: stderr
           log_directory: /var/log/postgresql
           log_file_mode: 384
           log_filename: postgresql.log
           log_line_prefix: '%t [%p]: [%l-1] %c %x %d %u %a %h '
           log_rotation_age: 1d
           log_rotation_size: 100MB
           log_timezone: Etc/UTC
           log_truncate_on_rotation: 'on'
           logging_collector: 'on'
           max_connections: 200
           max_wal_size: 1GB
           min_wal_size: 80MB
           timezone: Etc/UTC
           update_process_title: 'off'
           wal_keep_size: 1600MB
           wal_log_hints: 'on'
         use_pg_rewind: true
         use_slots: true
       retry_timeout: 15
       ttl: 45
     initdb:
     - encoding: UTF8
     - locale: en_US.UTF-8
     - data-checksums
   etcd3:
     hosts:
     - ETCD_IPAddress1:2379
     - ETCD_IPAddress2:2379
     - ETCD_IPAddress3:2379
   log:
     dir: /var/log/postgresql
   postgresql:
     authentication:
       replication:
         password: <password>
         username: replicator
       rewind:
         password: <password>
         username: replicator
       superuser:
         password: <password>
         username: superuser
     connect_address: <IPAddress>:5432
     bin_dir: /usr/lib/postgresql/15/bin
     config_dir: /etc/postgresql/15/main
     data_dir: /var/lib/postgresql/15/main
     listen: '*:5432'
     name: <node_name>
     parameters:
       listen_addresses: '*'
       log_autovacuum_min_duration: 0
       log_checkpoints: false
       log_connections: false
       log_disconnections: false
       max_stack_depth: 7MB
       port: 5432
       shared_buffers: 102MB
       unix_socket_directories: /var/run/postgresql
       wal_buffers: -1
       wal_sync_method: fsync
     pg_hba:
     - local  all  postgres  trust
     - local  replication  postgres  trust
     - local  all  all  trust
     - local  replication  replicator  trust
     - host  all  all  ::1/128  md5
     - host  all  postgres  127.0.0.1/32  trust
     - host  all  postgres  ::1/128  trust
     - host  all  postgres  all  reject
     - host  replication  replicator  0.0.0.0/0  md5
     - hostnossl  all  postgres  all  reject
     - hostssl  all  +cloud  127.0.0.1/32  pam
     - hostssl  all  +cloud  ::1/128  pam
     - hostssl  all  +cloud  all  pam
     - hostssl  all  all  all  md5
     - hostssl  replication  replicator  0.0.0.0/0  md5
     pgpass: /run/postgresql/pgpass
     use_unix_socket: true
     use_unix_socket_repl: true
   restapi:
     authentication:
       password: <pasword>
       username: postgres
     connect_address: <IPAddress>:8008
     listen: :8008
   scope: postgres-patroni
   ```

   **Lưu ý**:
    - bạn cần phải tạo các users/ roles tương ứng trong database với thông tin khai báo ở: `postgresql.authentication`. Chi tiết về các config options có thể tìm thấy [ở đây](https://patroni.readthedocs.io/en/latest/patroni_configuration.html). Thông tin về users/ roles trên các node phải giống nhau
    - cần phải khai báo đúng giá trị của `postgresql.bin_dir`, `postgresql.data_dir` & `postgresql.config_dir` đang có trên server thực hiện
    - Cần thay địa chỉ IP tương ứng của các nodes `IPAddress`

- Thực hiện start patroni
   ```bash
   systemctl daemon-reload
   systemctl start patroni
   systemctl enable patroni
   ```

- Lúc này, chúng ta khởi tạo được một leader của cluster
   ```bash
   patronictl --config-file /etc/patroni/config.yml list

   + Cluster: postgres-patroni ------------------+---------+---------+----+-----------+
   | Member                      | Host          | Role    | State   | TL | Lag in MB |
   +-----------------------------+---------------+---------+---------+----+-----------+
   | postgres-patroni-cb5o3izc   | 10.20.161.208 | Leader  | running |  1 |           |
   +-----------------------------+---------------+---------+---------+----+-----------+
   ```

#### 2.2 Khởi tạo Postgres Cluster

Trên các node còn lại thực hiện tương tự như bước 2.1 ở trên nhưng lưu ý, chúng ta cần phải cấu hình giống nhau về `postgresql.authentication` và `scope`. Tuy nhiên, để có thể khởi tạo cluster và connect các node với nhau, chúng ta cần phải đảm bảo thư mục `data_dir` giống nhau.
Chúng ta có thể thực hiện xóa thư mục này đi hoặc copy từ node leader sang. Ví dụ:

```bash
rm -rf /var/lib/postgresql/15/main
```
Khi start patroni, patroni sẽ thực hiện backup và sync thư mục này với node leader thông qua command `pg_basebackup`.


Để kiểm tra qua trình cài đặt thành công hay không, chúng ta có thể sử dụng command sau:
```bash
patronictl --config-file /etc/patroni/config.yml list

+ Cluster: postgres-patroni ------------------+---------+---------+----+-----------+
| Member                      | Host          | Role    | State   | TL | Lag in MB |
+-----------------------------+---------------+---------+---------+----+-----------+
| postgres-patroni-cb5o3izc   | 10.20.161.208 | Leader  | running |  1 |           |
| postgres-patroni-jubx88ye-1 | 10.20.161.253 | Replica | running |  1 |         0 |
| postgres-patroni-jubx88ye-2 | 10.20.161.174 | Replica | running |  1 |         0 |
+-----------------------------+---------------+---------+---------+----+-----------+
```

như vậy, cơ bản, chúng ta đã cấu hình xong High Availability cho Postgres.


### 2.3 Kiểm tra Failover

Khi chúng ta stop một databaser server bất kỳ đang làm leader, ngay lập tức sẽ có một database node khác được tự động promote lên làm leader mới.
Lúc này, chúng ta cần phải update lại config của application để thay đổi địa chỉ config cho DB.

Như vậy, chúng ta đã thay High Availability được cho Database nhưng chưa sử dụng được cho ứng dụng. Làm thế nào để có thể làm được điều này? Chúng ta sẽ theo dõi ở phần tiếp theo [High Availability Postgres with Patroni/ Spilo (Part 2)](https://botranvan.github.io/2023-09-26-how-to-config-postgres-with-patroni.html)
