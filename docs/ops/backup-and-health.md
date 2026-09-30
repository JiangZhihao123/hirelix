# Hirelix 数据备份、运行检查与恢复

`deploy/hirelix-backup.sh` 通过本机 PostgreSQL socket 备份 `hirelix`，文件仅 root 可读。daily 文件保留至少十四天；手动发布快照不自动清理。定时运行时间为每天 UTC 19:00（北京时间次日 03:00），随机延后不超过五分钟。

`deploy/hirelix-health.sh` 每分钟检查 PostgreSQL、scheduler 的运行和自启动、私人 worker 未被关闭、排队超过十分钟或租约过期超过三分钟的私人任务，以及最近二十六小时的成功备份。服务 active 不能代替队列检查。检查失败会让 `hirelix-health.service` 进入 failed，日志只记录计数，不包含私人材料。当前不对外发送提醒；查看 failed 状态和 journal。队列积压可能由高负载造成，需结合日志定位，不能直接删除任务。

## 安装与检查

确认 `/opt/hirelix` 已部署对应版本后：

```sh
sudo install -m 644 /opt/hirelix/deploy/systemd/hirelix-{backup,health}.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start hirelix-backup.service
sudo systemctl enable --now hirelix-backup.timer hirelix-health.timer
sudo systemctl start hirelix-health.service
sudo systemctl list-timers 'hirelix-*'
sudo systemctl --failed
sudo journalctl -u hirelix-health -u hirelix-backup --since today --no-pager
```

这些备份与应用在同一 VPS；可以恢复应用或数据库逻辑错误，不能恢复整个 VPS 或磁盘丢失。异地备份尚需独立存储目的地，不能宣称已有灾难恢复保障。

## 隔离恢复验收

选用一个实际备份，先用 `sudo pg_restore --list /var/backups/hirelix/<file>.dump` 检查目录。创建新的、仅 PostgreSQL 管理员可连接的 QA 数据库，确保该库未被应用或 worker 使用：

```sh
sudo -u postgres createdb hirelix_restore_qa_<unique_date>
sudo -u postgres psql -d postgres -c 'REVOKE CONNECT ON DATABASE hirelix_restore_qa_<unique_date> FROM PUBLIC;'
sudo bash -o pipefail -c 'pg_restore --no-owner --no-privileges --file=- /var/backups/hirelix/<file>.dump | runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d hirelix_restore_qa_<unique_date>'
```

恢复完成后对比表结构、关键表行数、文件 SHA-256 和关联完整性；只输出计数或通过/失败，不输出用户资料或认证信息。库名、备份文件、验证结果需写入发布验收记录。

恢复生产是另一项操作：先停住 Hirelix 写入，另存当前备份，确认事故期间新增的数据如何保留，再决定修复或恢复方式。不要直接清空生产库，也不要机械用旧备份覆盖新数据。

## 应用回滚

记录上一版 Git SHA 和 Vercel 部署 URL。Vercel 可提升已有成功部署；worker 在确认服务器工作区无用户改动后切换到上一版 SHA，执行 `npm ci` 并重启 `hirelix-scheduler`，随后核对队列和实际业务行为。数据库保持向前兼容；回滚代码前先确认该版本兼容当前 schema。恢复服务后的缺陷继续修复，不把回滚当成目标完成。
