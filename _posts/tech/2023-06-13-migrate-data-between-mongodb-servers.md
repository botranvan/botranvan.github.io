---
layout: post
title: Migrate data giữa các MongoDB servers
category: tech
---


Migrate data giữa các MongoDB servers luôn là một vấn đề được nhiều thực hiện và quan tâm mỗi khi chuyển giao các môi trường hoặc upgrade hạ tầng vật lý.

MongoDB cung cấp cho chúng ta 2 công cụ để có thể thực hiện quá trình migrate data đó là:
- mongodump: Thực hiện export data của database
- mongorestore: Thực hiện import data của database

Một cách đơn giản, chúng ta có thể thực hiện migrate data với 5 bước sau:
1. Sử dụng mongodump command để export data của MongoDB database ra files
2. Compress files trên với gzip để thành single file
3. Copy single file trên với scp sang server mới
4. Un-compress single file trên
5. Sử dụng mongorestore command để thực hiện import data với dữ liệu đã un-compress

Với mỗi một cách thì sẽ có những ưu và nhược điểm khác nhau. Thông thường thì chúng ta sẽ không chỉ chạy single MongoDB server mà thường chạy dưới dạng cluster hay replicaset.

Đối với các hệ thống chạy ở Replica Set, chúng ta có thể làm một cách đơn giản hơn và không cần phải lo lắng về việc làm thế nào để update toàn bộ dữ liệu mới phát sinh ra trong quá trình mà chúng ta thực hiện export dữ liệu, hay phải bị downtime do tạm dừng servers để export.

Trong quá trình làm việc, mình nhận ra, việc add thêm một node mới (node muốn migrata data sang) vào trong Replica Set đang tồn tại là phù hợp và giải quyết cũng như đáp ứng được nhiều vấn đề nhất, tiêu biểu như:
- Không cần phải lo lắng, hay tìm cách giải quyết cho vấn đề thiếu xót data trong quá trình export data
- Applications vẫn có thể hoạt động bình thường và connect đến MongoDB database đang tồn tại
- Việc sync dữ liệu sang node mới thêm được thực hiện tự động mà không cần phải lo lắng gì


Dưới đây là các thông tin về các yêu cầu & cách thực hiện:

### Yêu cầu

Để tận dụng việc thêm một node mới vào Replica Set cho quá trình migrate dữ liệu cũng có những yêu cầu nhất định như sau:
1. Một bản backup gần nhất của Replica Set - có thể thực hiện theo 5 bước ở trên đã mô tả. Backup này cần thỏa mãn Oplog size theo mô tả [ở đây](https://www.mongodb.com/docs/manual/core/replica-set-oplog/#std-label-replica-set-oplog-sizing)
2. Bản backup gần nhất đã được restore vào node mới (node cần migrate data sang)
3. Node cần thực hiện migrate data sang có thể được truy cập thông qua network bởi các node trong Replica Set đang tồn tại
4. Replica Set tồn tại đang active - có thể truy cập và hoạt động bình thường


### Cách thực hiện

Trên 1 node bất kỳ của Replica Set, thực hiện lấy replica set name như sau:
```bash
rs0:PRIMARY> rs.status().set
rs0
```
ở đây `rs0` chính là replica set name.


Trên node cần migrate data chạy MongoDB với mode replica set và replica set name là rs0. Có thể thực hiện bằng cách thêm vào file cấu hình nội dung như sau:
```bash
replication:
  replSetName: rs0
```

Thực hiện copy File Key trên 1 node bất kỳ của MongoDB sang node mới và khai báo cấu hình như sau:
```bash
security:
  clusterAuthMode: keyFile
  keyFile: /etc/mongodb/mongo_key
```
ở đây `/etc/mongodb/mongo_key` là file mà chúng ta thực hiện copy sang. Nội dung của file này bao gồm một đoạn secret sử dụng để giao tiếp giữa các node trong Replica Set.


Thực hiện start MongoDB trên node mới với command sau:
```bash
systemctl start mongod
```
sau khi MongoDB đã chạy ổn định, chúng ta sẽ tiến hành bước tiếp theo.


Thực hiện connect đến node primary trong Replica Set và thực hiện add node mới vào với command như sau:
```bash
rs0:PRIMARY> rs.add( { host: "<ip_address>:27017" } )
```
trong đó `ip_address` là địa chỉ IP của node mới (node cần migrate data sang) - mà các node trong Replica Set có thể connect đến.


Tiếp đó, kiểm tra rạng thái của node trong Replica Set như sau:
```bash
rs0:PRIMARY> rs.status()
```

chờ cho đến khi node có trạng thái `"stateStr" : "SECONDARY",` thì chúng ta đã thực hiện đồng bộ và migrate data thành công.

Lưu ý:
Đối với các phiên bản MongoDB nhỏ hơn 5.0, chúng ta cần thêm: `priority:0` & `votes:0` khi add node để tránh trường hợp khi re-vote sẽ không có node primary nào được chọn. Sau khi các node đều có state là `SECONDARY` chúng ta sử dụng `rs.reconfig()` để update lại priority và votes.


Với cách làm trên, mình đã có thể nhanh chóng thực hiện migrate data giữa các MongoDB server mà không cần phải lo lắng quá nhiều về việc thiếu sót dữ liệu trong quá trình migrate.
