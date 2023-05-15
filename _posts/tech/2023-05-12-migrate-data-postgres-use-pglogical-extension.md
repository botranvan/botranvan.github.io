---
layout: post
title: Migrate data giữa các postgresql server sử dụng pglogical
category: tech
---


# Vấn đề

Ngày nay, với sự phát triển của các công nghệ, việc sử dụng đơn thuần các server vật lý để cung cấp
và phát triển các tính năng, dịch vụ đã không có phổ biến so với trước kia. Thay vào đó, việc triển
khai và sử dụng các máy chủ ảo (Cloud Server) trên môi trường điện toán đám mây (Cloud Computing)
đã ngày càng trở nên phổ biến và đa dạng bởi các lợi ích đem lại là vô cùng khác biệt so với cách
triển khai truyền thống.

Khi tiếp cận và bắt đầu sử dụng môi trường Cloud Computing, chúng ta sẽ không thể nào tránh khỏi việc
cần phải làm đó là thực hiện chuyển đổi môi trường và di chuyển dữ liệu của ứng dụng trong các database
lên môi trường Cloud Computing với Cloud Servers hay Database Instances (trong dịch vụ DBaaS - Database as a Service) là điều
luôn cần phải làm đầu tiên.

Trong bài viết này, mình sẽ nói về việc làm thế nào để thực hiện di chuyển dữ liệu (migrate data) từ môi
trường truyền thống sang môi trường Cloud Computing hay từ Cloud Provider này sang Cloud Provider khác.

Sau khi xem qua một vài lựa chọn để migrate data thì mình quyết định sử dụng replication với pglogical
extension. Tuy nhiên, để có thể giảm downtime và cho phép có thể dễ dàng rollback thì bidirectional
replication là một lựa chọn xem chừng là tối ưu nhất. Việc sử dụng bidirectional replication sẽ cho phép
dữ liệu được đồng bộ lẫn nhau giữa các postgresql server.

# Replication là gì?

Replication là một process làm nhiệm vụ tạo và duy trì một hay nhiều bản sao (backup) của database được chỉ định.
Các backup này được đồng bộ với nhau về việc thay đổi dữ liệu. Thông thường thì replication được sử dụng
để tăng tính sẵn sàng, cải thiện hiệu năng và cung cấp các bản backup dữ liệu được sử dụng để khôi phục
khi có sự cố xảy ra, ...

Replication dữ liệu thì có nhiều kiểu, trong đó có thể bao gồm:
- Logical Replication: Chỉ replicate table được chỉ định và data thay đổi
- Physical Replication: Replicate mọi thứ có trong database bao gồm data, schema, ...
- Synchronous Replication: Việc replicate được thực hiện ngay lập tức tới các node khác. Một transaction được tính
    là thành công khi và chỉ khi dữ liệu đã được đồng bộ trên tất cả các node.
- Snapshot Replication: Sau một khoảng thời gian thì một bản snapshot data sẽ được export và đồng bộ
    tới các node

# Tại sao lại sử dụng bidirectional replication?

Trước khi chúng ta có câu trả lời tại mình lại lựa chọn bidirectional replication để migrate data thì hãy đọc
qua về sự khác nhau giữa bidirectional và uni-directional replication

### Bidirectional Replication

Với bidirectional replication, việc replication dữ liệu sẽ được đồng bộ 2 chiều và đồng bộ giữa các node với nhau.
Việc này có thể sẽ dẫn đến xung đột nếu xuất hiện một hay nhiều node bị lỗi hoặc replicate lag. Tuy nhiên, việc sử
dụng này lại cực kỳ hữu ích trong trường hợp bạn muốn sử dụng để tối ưu hiệu năng đọc/ ghi dữ liệu với
distributing queries hoặc migrate data khi chúng ta có thể thực hiện rollback lại

![](/images/2023-05-12-migrate-data-postgres-use-pglogical-extension/bidirectional-replication.png)

### Uni-directional Replication

Với uni-directional replication, việc replication dữ liệu sẽ được đồng bộ 1 chiều từ node primary tới node replica.
Các node replica này chỉ có thể sử dụng như read-only server và được sử dụng để promote thành primary trong trường
hợp có lỗi xảy ra. Đây là cách sử dụng phổ biến trong hầu hết tất cả các trường hợp.

![](/images/2023-05-12-migrate-data-postgres-use-pglogical-extension/unidirectional-replication.png)

Theo tài liệu được tìm thấy tại `https://github.com/2ndQuadrant/pglogical` thì pglogical extension khá hữu ích khi
có thể support cả Uni-directional & Bidirectional và có thể làm việc được giữa các version postgresql khác nhau.
Đây là một lý do khá tuyệt vời khi sử dụng postgresql để migrate dữ liệu

# Yêu cầu cần có trước khi thực hiện cấu hình

Để có thể thực hiện cấu hình thì các database node cần được cài đặt và hỗ trợ extension pglogical.
Thông thường, đối với việc sử dụng DBaaS trên các Cloud Provider, chúng ta không cần phải thực hiện việc này.
Tuy nhiên, chúng ta cần phải thực hiện như sau khi không sử dụng DBaaS.
Các command sau đây, mình đã thực hiện trên hệ điều hành Ubuntu 22.04 & Postges version 14.6 cùng mô hình sau đây:

![](/images/2023-05-12-migrate-data-postgres-use-pglogical-extension/struct.svg)

# Thực hiện cấu hình

### 1. Cài đặt extension pglogical
Để có thể sử dụng pglogical thì cả provider và subscriber cần được cài đặt pglogical extension. [Xem thêm](https://github.com/2ndQuadrant/pglogical#requirements)

```bash
apt-get install -y postgresql-14-pglogical
```

Sau khi cài đặt xong, chúng ta cần phải khai báo để postgres có thể hiểu và đọc được extension này. Thực hiện chỉnh sửa file
cấu hình của postgres `postgresql.conf` như sau:

```bash
wal_level = 'logical'
max_worker_processes = 10
max_replication_slots = 10
max_wal_senders = 10
shared_preload_libraries = 'pglogical'
```

Cho phép các database node connect tới nhau bằng cách chỉnh sửa file `pg_hba.conf` như sau:

    `host all all all scram-sha-256`

**Lưu ý: config allow trên chỉ là một ví dụ, bạn có thể sửa cho phù hợp hệ thống**

Thực hiện restart lại Postgres trên tất cả các node


### 2. Thực hiện load extension pglogical vào database

Để có thể dùng extension pglogical, chúng ta cần phải load nó vào trong database mà chúng ta muốn cấu hình replica.
Ví dụ ở đây, mình có database tên là `gi_servers` - đây là database cần tồn tại trên cả node provider & subscriber.
Trên các node, chúng ta thực hiện load extension vào database như sau:

```bash
postgres=# \c gi_servers;
You are now connected to database "gi_servers" as user "postgres".
gi_servers=# create extension pglogical;
CREATE EXTENSION
```

Khi thực hiện load extension, chúng ta sẽ có các replication set như sau:

```bash
gi_servers=# select * from pglogical.replication_set;
   set_id   | set_nodeid |      set_name       | replicate_insert | replicate_update | replicate_delete | replicate_truncate
------------+------------+---------------------+------------------+------------------+------------------+--------------------
   16632611 |  992022492 | default             | t                | t                | t                | t
 1575599506 |  992022492 | default_insert_only | t                | f                | f                | t
 4097350585 |  992022492 | ddl_sql             | t                | f                | f                | f
(3 rows)
```

Bạn có thể tìm kiếm thêm thông tin [ở đây](https://github.com/2ndQuadrant/pglogical#replication-sets)

### 3. Thực hiện công việc chuẩn bị cho cấu hình

Muốn pglogical extension thực hiện được replication chúng ta cần phải tạo ra một user sử dụng để đọc ghi dữ liệu replica
như sau trên tất cả các node:

```bash
gi_servers=# CREATE USER cloudsqlrep WITH REPLICATION SUPERUSER LOGIN PASSWORD '<passowrd>';
```

trong đó:
- `cloudsqlrep` là user được tạo ra
- `<password>` là mật khẩu của user cloudsqlrep sử dụng để connect đến database


### 4. Tiến hành cài đặt cho pglogical

Trước khi thực hiện cấu hình Bidirectional, chúng ta hãy bắt đầu với việc cấu hình Uni-directional trước tiên.
Trên node provider thực hiện tạo ra pglogical node như sau:

```bash
gi_servers=# SELECT pglogical.create_node(
    node_name := 'provider.169',
    dsn := 'host=10.26.235.169 port=5432 dbname=gi_servers user=cloudsqlrep password=<password>'
);
 create_node
-------------
   2492936548
```

Chỉ định việc replication được thực hiện với tất cả các dữ liệu

```bash
SELECT pglogical.replication_set_add_all_tables('default', ARRAY['public']);
```

Thực hiện dump schema từ node provider để import vào node subscriber:

```bash
pg_dump --schema-only gi_servers > schema.sql
```

Sao chép file schema.sql sang node subscriber. Trên node subscriber thực hiện import schema với command:

```bash
psql gi_servers < schema.sql
```

Tiếp theo, trên node subscriber thực hiện tạo pglogical node cho subscriber như sau:

```bash
gi_servers=# SELECT pglogical.create_node(
    node_name := 'subscriber.67',
    dsn := 'host=10.26.235.67 port=5432 dbname=gi_servers user=cloudsqlrep password=<password>');
 create_node
-------------
  1297490749
```

Lúc này, chúng ta không cần tạo hay cấu hình cho replication. Tuy nhiên, chúng ta cần tạo thêm pglogical subscription như sau:

```bash
SELECT pglogical.create_subscription(
        subscription_name := 'provider_10_26_235_169',
        provider_dsn := 'host=10.26.235.169 port=5432 dbname=gi_servers user=cloudsqlrep password=<password>',
        forward_origins := '{}',
        synchronize_data := true );
 create_subscription
---------------------
           764467833
```

Chúng ta sử dụng `forward_origins` với empty string là vì muốn replicate bất kỳ thay đổi data nào nếu việc thay đổi đó không bắt
nguồn từ node provider. Có thể xem thêm [ở đây](https://github.com/2ndQuadrant/pglogical#subscription-management)

Khi chúng ta thực hiện show các node trên subscriber, chúng ta sẽ thấy có cả id của node provider:

```bash
select * from pglogical.node;
  node_id   |        node_name
------------+-------------------------
 1297490749 | subscriber_10.26.235.67
 2492936548 | provider_10.26.235.169
```

Kiểm tra trạng thái của subscription như sau:

```bash
gi_servers=# select * from pglogical.show_subscription_status('provider_10_26_235_169');
   subscription_name    |   status    |     provider_node      |                                    provider_dsn                                     |                   slot_name                    |           replication_sets            | forward_origins
------------------------+-------------+------------------------+-------------------------------------------------------------------------------------+------------------------------------------------+---------------------------------------+-----------------
 provider_10_26_235_169 | replicating | provider_10.26.235.169 | host=10.26.235.169 port=5432 dbname=gi_servers user=cloudsqlrep password=<password> | pgl_gi_servers_provider9497316_provider2d90da7 | {default,default_insert_only,ddl_sql} |
(1 row)
```

trong trường hợp nếu status khác `replicating`, bạn có thể kiểm tra log của postgres để có thể biết lý do tại sao.

Với các bước làm trên, chúng ta đã cấu hình thành công cho Uni-directional. Việc cấu hình Bidirectional sẽ được thực hiện tương tự và làm ngược lại.

### 5. Cấu hình Bidirectional để phục vụ quá trình migrate data

Trên node subscriber thực hiện chỉ định việc replication được thực hiện với tất cả các dữ liệu

```bash
SELECT pglogical.replication_set_add_all_tables('default', ARRAY['public']);
```

Trên node provider thực hiện tạo thêm subscription là node subscriber với câu lệnh như sau:

```bash
SELECT pglogical.create_subscription(
        subscription_name := 'provider_10_26_235_67',
        provider_dsn := 'host=10.26.235.67 port=5432 dbname=gi_servers user=cloudsqlrep password=<password>',
        forward_origins := '{}',
        synchronize_data := true );
```


Như vậy, chúng ta đã cấu hình xong cho việc Bidirectional và đã sẵn sàng cho việc migrate data.

# Kiểm tra tính đúng

Lần lượt trên các node, chúng ta thực hiện CRUD dữ liệu và kiểm tra ở các node còn lại sẽ thấy
dữ liệu cũng sẽ được CRUD tương ứng trên các node còn lại.

![query_result.png](/images/2023-05-12-migrate-data-postgres-use-pglogical-extension/query_result.png)

Điều này sẽ giúp việc migrate data và môi trường sẽ không bị ảnh hưởng do mất hay sai lệch dữ liệu trong quá trình
thử nghiệm ở môi trường mới

