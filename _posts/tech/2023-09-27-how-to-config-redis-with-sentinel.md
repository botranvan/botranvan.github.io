---
layout: post
title: High Availability Redis with Sentinel
category: tech
---

Redis là một phần mềm open source cung cấp việc lưu các dữ liệu trong RAM thường được sử dụng để cache, message broker, and streaming engine.
Redis được sử dụng bởi các công ty khá nổi như:
- Twitter
- GitHub
- Snapchat
- Craigslist
- StackOverflow

Tùy vào từng use case mà Redis được sử dụng với các vai trò khác nhau trong một hệ thống. Và công ty mình cũng vậy, Redis được sử dụng khá phổ biến trong hầu hết các ứng dụng. Vào một ngày đẹp trời, server Redis tự nhiên lăn ra sập, không thể truy cập và restore lại được. Vậy là toàn bộ các dữ liệu đang có trong Redis cứ thế không cánh mà bay.

Mất dữ liệu, app dừng hoạt động là những gì mình phải đối mặt. Server bị sập thì có vô vàn lý do: loại trừ lý do chủ quan là code cùi, code lỗi, thì còn các lý do khách quan mà không ai muốn nó xảy ra cả: các phần cứng bị lỗi, ... Ở đây, mình bị lỗi cả ram lẫn disk chạy trên server vật lý, không hề có ánh sáng nào cho hy vọng nào ở đây cả.

Sau vụ việc lần này, mình lại hì hục tìm cách làm thế nào để có thể cấu hình High Availability cho Redis để mà nhỡ có đen thì cũng vẫn sẽ lấy lại được phần nào dữ liệu đã mất. Mình đã nghĩ đến `Redis Replication` để có thể sync data sang nhiều servers khác, để mà có đen servers sập thì cũng vẫn còn lại dữ liệu. Tuy nhiên thì mình lại cần phải có `Auto-Failover` nữa, vậy là mình đã tìm đến `Redis Sentinel`. Vậy thì mình đã làm như thế nào và ứng dụng được gì?


### 1. Redis Sentinel là gì?

Redis Sentinel là một tính năng sử dụng cho việc triển khai High Availability cho Redis without setup cluster. Theo như mô tả thì đây là các tính năng của Sentinel:

- *Monitoring*. Sentinel constantly checks if your master and replica instances are working as expected.
- *Notification*. Sentinel can notify the system administrator, or other computer programs, via an API, that something is wrong with one of the monitored Redis instances.
- *Automatic failover*. If a master is not working as expected, Sentinel can start a failover process where a replica is promoted to master, the other additional replicas are reconfigured to use the new master, and the applications using the Redis server are informed about the new address to use - when connecting.
- *Configuration provider*. Sentinel acts as a source of authority for clients service discovery: clients connect to Sentinels in order to ask for the address of the current Redis master responsible for a given service. If a failover occurs, Sentinels will report the new address.


### 2. Mô hình triển khai

Về cơ bản thì để triển khai Sentinel cũng tương đối khá dễ dàng. Mình đã và đang triển khai Redis Sentinel với 3 servers và Redis thì chạy trong Docker(cái này thì có nhiều lý do, và dựa vào các ưu điểm của containerzed nên mình thường xuyên cố gắng đưa mọi thứ vào container, miễn là nó phù hợp).

![2023-09-27-how-to-config-redis-with-sentinel/arch.png](/images/2023-09-27-how-to-config-redis-with-sentinel/arch.png)

trong đó, các nodes có địa chỉ IP tương ứng như sau:

Node Name | IP Address |
----------|------------
redis-xpg72e62 | 10.20.161.181 |
redis5-repl-1 | 10.20.161.80 |
redis5-repl-2 | 10.20.161.111 |

### 3. Cách cấu hình

1. Trên các nodes tạo các thư mục sau
    ```bash
    mkdir -p /var/log/redis /var/run/redis /var/lib/redis /etc/redis
    ```

    Tạo file config `/etc/redis/redis.conf` để cấu hình redis replication như sau:
    - Trên node 1
        ```bash
        activerehashing yes
        always-show-logo yes
        aof-load-truncated yes
        aof-rewrite-incremental-fsync yes
        aof-use-rdb-preamble yes
        appendfilename appendonly.aof
        appendfsync everysec
        appendonly no
        auto-aof-rewrite-min-size 64mb
        auto-aof-rewrite-percentage 100
        client-output-buffer-limit normal 0 0 0
        client-output-buffer-limit pubsub 32mb 8mb 60
        daemonize no
        databases 16
        dbfilename dump.rdb
        dir /var/lib/redis/data
        dynamic-hz yes
        hash-max-ziplist-entries 512
        hash-max-ziplist-value 64
        hll-sparse-max-bytes 3000
        hz 10
        latency-monitor-threshold 0
        lazyfree-lazy-eviction no
        lazyfree-lazy-expire no
        lazyfree-lazy-server-del no
        list-compress-depth 0
        list-max-ziplist-size -2
        logfile /var/log/redis/redis.log
        loglevel notice
        lua-time-limit 5000
        maxmemory 870mb
        no-appendfsync-on-rewrite no
        notify-keyspace-events ''
        pidfile /var/run/redis/redis.pid
        port 6379
        protected-mode no
        rdb-save-incremental-fsync yes
        rdbchecksum yes
        rdbcompression yes
        repl-disable-tcp-nodelay no
        repl-diskless-sync yes
        repl-diskless-sync-delay 10
        save 300 10
        save 60 10000
        save 900 1
        set-max-intset-entries 512
        slowlog-log-slower-than 10000
        slowlog-max-len 128
        stop-writes-on-bgsave-error yes
        stream-node-max-bytes 4096
        stream-node-max-entries 100
        supervised no
        tcp-backlog 511
        tcp-keepalive 300
        timeout 0
        unixsocket /var/run/redis/redis.sock
        unixsocketperm 700
        zset-max-ziplist-entries 128
        zset-max-ziplist-value 64
        requirepass <password>
        masterauth <password>
        ```
    - Trên node 2
        ```bash
        activerehashing yes
        always-show-logo yes
        aof-load-truncated yes
        aof-rewrite-incremental-fsync yes
        aof-use-rdb-preamble yes
        appendfilename "appendonly.aof"
        appendfsync everysec
        appendonly no
        auto-aof-rewrite-min-size 64mb
        auto-aof-rewrite-percentage 100
        client-output-buffer-limit normal 0 0 0
        daemonize no
        databases 16
        dbfilename "dump.rdb"
        dir "/var/lib/redis/data"
        dynamic-hz yes
        hash-max-ziplist-entries 512
        hash-max-ziplist-value 64
        hll-sparse-max-bytes 3000
        hz 10
        latency-monitor-threshold 0
        lazyfree-lazy-eviction no
        lazyfree-lazy-expire no
        lazyfree-lazy-server-del no
        list-compress-depth 0
        list-max-ziplist-size -2
        logfile "/var/log/redis/redis.log"
        loglevel notice
        lua-time-limit 5000
        maxmemory 870mb
        no-appendfsync-on-rewrite no
        notify-keyspace-events ""
        pidfile "/var/run/redis/redis.pid"
        port 6379
        protected-mode no
        rdb-save-incremental-fsync yes
        rdbchecksum yes
        rdbcompression yes
        repl-disable-tcp-nodelay no
        repl-diskless-sync no
        repl-diskless-sync-delay 5
        save 300 10
        save 60 10000
        save 900 1
        set-max-intset-entries 512
        slowlog-log-slower-than 10000
        slowlog-max-len 128
        stop-writes-on-bgsave-error yes
        stream-node-max-bytes 4096
        stream-node-max-entries 100
        supervised no
        tcp-backlog 511
        tcp-keepalive 300
        timeout 0
        unixsocket "/var/run/redis/redis.sock"
        unixsocketperm 700
        zset-max-ziplist-entries 128
        zset-max-ziplist-value 64
        requirepass <password>
        masterauth <password>
        min-replicas-max-lag 10
        min-replicas-to-write 1
        replica-lazy-flush no
        replica-priority 100
        replica-read-only yes
        replica-serve-stale-data yes
        replicaof 10.20.161.181 6379
        ```
    - Trên node 3
        ```bash
        activerehashing yes
        always-show-logo yes
        aof-load-truncated yes
        aof-rewrite-incremental-fsync yes
        aof-use-rdb-preamble yes
        appendfilename "appendonly.aof"
        appendfsync everysec
        appendonly no
        auto-aof-rewrite-min-size 64mb
        auto-aof-rewrite-percentage 100
        client-output-buffer-limit normal 0 0 0
        daemonize no
        databases 16
        dbfilename "dump.rdb"
        dir "/var/lib/redis/data"
        dynamic-hz yes
        hash-max-ziplist-entries 512
        hash-max-ziplist-value 64
        hll-sparse-max-bytes 3000
        hz 10
        latency-monitor-threshold 0
        lazyfree-lazy-eviction no
        lazyfree-lazy-expire no
        lazyfree-lazy-server-del no
        list-compress-depth 0
        list-max-ziplist-size -2
        logfile "/var/log/redis/redis.log"
        loglevel notice
        lua-time-limit 5000
        maxmemory 870mb
        no-appendfsync-on-rewrite no
        notify-keyspace-events ""
        pidfile "/var/run/redis/redis.pid"
        port 6379
        protected-mode no
        rdb-save-incremental-fsync yes
        rdbchecksum yes
        rdbcompression yes
        repl-disable-tcp-nodelay no
        repl-diskless-sync no
        repl-diskless-sync-delay 5
        save 300 10
        save 60 10000
        save 900 1
        set-max-intset-entries 512
        slowlog-log-slower-than 10000
        slowlog-max-len 128
        stop-writes-on-bgsave-error yes
        stream-node-max-bytes 4096
        stream-node-max-entries 100
        supervised no
        tcp-backlog 511
        tcp-keepalive 300
        timeout 0
        unixsocket "/var/run/redis/redis.sock"
        unixsocketperm 700
        zset-max-ziplist-entries 128
        zset-max-ziplist-value 64
        requirepass <password>
        masterauth <password>
        min-replicas-max-lag 10
        min-replicas-to-write 1
        replica-lazy-flush no
        replica-priority 100
        replica-read-only yes
        replica-serve-stale-data yes
        replicaof 10.20.161.181 6379
        ```
    Lưu ý: Cần thay địa chỉ IP tương ứng của bạn vào

    Tạo file config `/etc/redis/sentinel.conf` để cấu hình sentinel như sau:
    - Trên node 1
        ```bash
        daemonize no
        dir /var/lib/redis/data
        logfile /var/log/redis/sentinel.log
        pidfile /var/run/redis/sentinel.pid
        port 26379
        protected-mode no
        unixsocket /var/run/redis/sentinel.sock
        unixsocketperm 700
        requirepass <password>
        sentinel myid b16319cdc0783a0bf3b49e3f60759c3a173cbe7b
        sentinel deny-scripts-reconfig no
        sentinel monitor s6l 10.20.161.181 6379 2
        sentinel down-after-milliseconds s6l 10000
        sentinel failover-timeout s6l 10000
        sentinel auth-pass s6l <password>
        sentinel config-epoch s6l 0
        sentinel leader-epoch s6l 0
        sentinel known-replica s6l 10.20.161.111 6379
        sentinel known-replica s6l 10.20.161.80 6379
        sentinel current-epoch 0
        ```
    - Trên node 2
        ```bash
        daemonize no
        dir "/var/lib/redis/data"
        logfile "/var/log/redis/sentinel.log"
        pidfile "/var/run/redis/sentinel.pid"
        port 26379
        protected-mode no
        unixsocket "/var/run/redis/sentinel.sock"
        unixsocketperm 700
        requirepass <password>
        sentinel myid 2a88d7cbe2c3ae42505b7ced061b84e53cd353ce
        sentinel deny-scripts-reconfig no
        sentinel monitor s6l 10.20.161.181 6379 2
        sentinel down-after-milliseconds s6l 10000
        sentinel failover-timeout s6l 10000
        sentinel auth-pass s6l <password>
        sentinel leader-epoch s6l 0
        sentinel known-replica s6l 10.20.161.80 6379
        sentinel known-replica s6l 10.20.161.111 6379
        sentinel current-epoch 0
        ```
    - Trên node 3
        ```bash
        daemonize no
        dir "/var/lib/redis/data"
        logfile "/var/log/redis/sentinel.log"
        pidfile "/var/run/redis/sentinel.pid"
        port 26379
        protected-mode no
        unixsocket "/var/run/redis/sentinel.sock"
        unixsocketperm 700
        requirepass <password>
        sentinel myid e3e9b126a9a6b17bbf1ccadda0d05315abe1dc28
        sentinel deny-scripts-reconfig no
        sentinel monitor s6l 10.20.161.181 6379 2
        sentinel down-after-milliseconds s6l 10000
        sentinel failover-timeout s6l 10000
        sentinel auth-pass s6l <password>
        sentinel config-epoch s6l 0
        sentinel leader-epoch s6l 0
        sentinel known-replica s6l 10.20.161.111 6379
        sentinel known-replica s6l 10.20.161.80 6379
        sentinel current-epoch 0
        ```
    Lưu ý: Cần thay địa chỉ IP tương ứng của bạn vào

2. Tạo container database trên các nodes

    Trên các nodes tiến hành tạo các containers như sau:

- Tạo container chạy Redis

    ```bash
        docker create --name database --network host \
        -v /dev/shm:/dev/shm \
        -v /etc/redis/etc/redis \
        -v /var/lib/redis:/var/lib/redis \
        -v /var/log/redis:/var/log/redis \
        -v /var/run/redis:/var/run/redis \
        redis:5.0.14 /etc/redis/sentinel.conf
        ```
- Tạo container chạy Sentinel

    ```bash
        docker create --name sentinel --network host \
        -v /dev/shm:/dev/shm \
        -v /etc/redis/etc/redis \
        -v /var/lib/redis:/var/lib/redis \
        -v /var/log/redis:/var/log/redis \
        -v /var/run/redis:/var/run/redis \
        redis:5.0.14 --sentinel /etc/redis/sentinel.conf
        ```

### 4. Kiểm tra kết quả

Thực hiện kết nối vào một redis server bất kỳ trên port 26379 

```bash
redis-cli -h <ip_address> - p 26379
auth <password>

info sentinel
sentinel_masters:1
sentinel_tilt:0
sentinel_running_scripts:0
sentinel_scripts_queue_length:0
sentinel_simulate_failure_flags:0
master0:name=s6l,status=ok,address=10.20.161.181:6379,slaves=2,sentinels=4
```

Lúc này, chúng ta có thể tắt node master đi để kiểm tra quá trình tự động failover.

Example code in python
```python
import redis

def connect_to_redis_sentinel():
  """
  Connects to Redis Sentinel.

  Returns:
    A Redis connection object.
  """

  sentinel = redis.sentinel.Sentinel([
    ('localhost', 26379),
    ('localhost', 26380),
    ('localhost', 26381),
  ])

  master = sentinel.master_for('s6l')

  return redis.Redis(connection_pool=master)

# Example usage:

redis = connect_to_redis_sentinel()

# Set a value in Redis:
redis.set('my_key', 'my_value')

# Get a value from Redis:
value = redis.get('my_key')

print(value)
```
