---
layout: post
title: MongoDB ReplicaSet là gì? Sử dụng như nào?
category: tech
---

### 1. MongoDB ReplicaSet là gì?

MongoDB ReplicaSet là tập hợp nhiều servers/ process của mongod đang duy trì các dữ liệu giống nhau và được đồng bộ với nhau gọi là Replica Set. Replica Sets cung cấp và hỗ trợ cho phương án dự phòng, đảm bảo tính sẵn sàng cao, và là cơ sở cho tất cả các triển khai trên môi trường production.


#### 1.1 Redundancy and Data Availability

Replication cung cấp khả năng dự phòng và tăng tính khả dụng của dữ liệu. Với nhiều bản sao dữ liệu trên các máy chủ cơ sở dữ liệu khác nhau, replication cung cấp khả năng chịu lỗi trong trường hợp một database server bị lỗi.

Trong một số trường hợp, replication có thể tăng khả năng đọc data vì client có thể gửi các hoạt động đọc đến các database server khác nhau. Việc duy trì các bản sao dữ liệu trong các database khác nhau có thể tăng tính sẵn sàng/ khả dụng cho các ứng dụng phân tán. Bạn cũng có thể duy trì các bản sao bổ sung cho các mục đích riêng, chẳng hạn như khắc phục thảm họa(disaster recovery), báo cáo hoặc sao lưu.


#### 1.2 Auto Failover

Trong kiến trúc của MongoDB ReplicaSet có 3 thành phần: Primary, Secondary, Arbiter. Primary và Secondary là các node sẽ thực hiện lưu trữ dữ liệu của database, Arbiter là thành phần đóng vai trò như tham gia và quyết định Secondary nào sẽ trở thành Primary khi node Primary đang có bị lỗi

![](/images/2023-06-24-cach-cau-hinh-mongodb-replicaset/auto-failover.png)

Client sẽ không thể thực hiện ghi dữ liệu vào database cho đến khi có Primary mới.


### 2. Sử dụng như thế nào?
#### 2.1 Cách cấu hình

##### Yêu cầu
Để cấu hình một ReplicaSet, chúng ta nên bắt đầu với số server là số lẻ để tránh tình trạng Split Brain (điều này có thể có nhiều cách khắc phục khác nhau) và các node này được thông mạng với nhau. Ví dụ đáp ứng thông tin sau:

| Node   | IP Address    |
| ------ | ------------- |
| node 1 | 192.168.53.88 |
| node 2 | 192.168.53.89 |
| node 3 | 192.168.53.90 |

Trên các node cần chạy ở mode replica set bằng cách cấu hình như sau:
```bash
replication:
   replSetName: "rs0"
net:
   bindIp: localhost,<hostname(s)|ip address(es)>
```

Tạo keyfile để có thể auth giữa các node
```bash
openssl rand -base64 756 > <path-to-keyfile>
chmod 400 <path-to-keyfile>
```

Thực hiện copy nội dung của `<path-to-keyfile>` đến tất cả các node trong replica set và thực hiện cấu hình sử dụng như sau:
```bash
security:
  keyFile: <path-to-keyfile>
```
sau khi cấu hình, cần thực hiện restart lại MongoDB.

##### Cấu hình
Để cấu hình và khởi tạo ReplicaSet, thực hiện kết nối MongoDB trên một node bất kỳ, sau đó tiến hành khởi tạo ReplicaSet như sau:
```bash
rs.initiate(
  {
    _id : "rs0",
    members: [
      { _id : 0, host : "192.168.53.88:27017" },
      { _id : 1, host : "192.168.53.89:27017" },
      { _id : 2, host : "192.168.53.90:27017" }
    ]
  }
)
```

sau khi thực hiện khởi tạo, các node sẽ tiến hành kết nối với nhau và thực hiện "bình bầu" để lựa chọn ra đâu là node Primary, Secondary.

#### 2.2 Kết nối đến MongoDB ReplicaSet
Để thực hiện kết nối đến MongoDB ReplicaSet, chúng ta có thể sử dụng client của mongodb hoặc language programing lib và khai báo toàn bộ địa chỉ kết nối tới các node trong Replica Set hoặc SVR DNS record nếu có. Ví dụ:

```bash
mongosh mongodb://user_name:password@192.168.53.88:27017,192.168.53.89:27017,192.168.53.90:27017?replicaSet=rs0&writeConcern=majority
```

Chúng ta sẽ thực sự tận dụng được tính năng auto failover để giảm thiểu lỗi khi và chỉ khi chúng ta kết nối MongoDB với connection string tương tự như trên.

[Read more](https://www.mongodb.com/docs/manual/administration/replica-set-deployment/)
