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

这些备份与应用在同一 VPS；可以恢复应用或数据库逻辑错误，不能恢复整个 VPS 或磁盘丢失。本版不配置自动异地备份，不能宣称已有灾难恢复保障。

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

队列检查使用同目录 `deploy/hirelix-health.sql`：已停止对话中的排队消息不算 worker 积压；超时运行租约仍算异常；启用且未完成的一次性提醒超过约定时间十分钟未送达也算异常，不要求提醒关联职位。此 SQL 由真实隔离 PostgreSQL 回归直接执行，避免测试另写一套规则。部署时须同步 `.sh` 和 `.sql`。

## 自动异地备份安排已取消

用户于2026-10-20明确决定不需要本次提出的自动异地备份。未安装自动拉取计划，移除本轮新增的拉取脚本，不再等待存储位置，也不将其列为1.0.0放行条件。既有VPS备份任务及已生成副本保留；上文恢复能力边界不变。

## 明确配置后才启用的故障告警

`deploy/hirelix-alert.mjs` 默认只预览，不发信：

```sh
node deploy/hirelix-alert.mjs test --preview
```

需用户先确认 `HIRELIX_ALERT_TO`，并在 `/etc/hirelix.env` 配置该值及已有 `RESEND_API_KEY`、`SEARCH_NOTIFICATIONS_FROM_EMAIL`。脚本只允许 health、backup 和手动 test 三类消息，不带日志正文、客户信息或凭证。同一检查每UTC小时最多一封；本地状态抑制重复，且使用 [Resend Idempotency-Key](https://resend.com/changelog/idempotency-keys) 处理响应丢失后的同请求重试。服务端接受不等于收件人实际收到。

确认接收地址和一次测试发送后，可安装模板并测试：

```sh
sudo install -m 644 /opt/hirelix/deploy/systemd/hirelix-alert@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start hirelix-alert@test.service
sudo systemctl status hirelix-alert@test.service --no-pager
```

收到测试信后再接入现有定时检查（模板本身不启用任何计划）：

```sh
for service in hirelix-health.service hirelix-backup.service; do
  sudo install -d -m 755 "/etc/systemd/system/$service.d"
  printf '%s\n' '[Unit]' 'OnFailure=hirelix-alert@%n.service' | sudo tee "/etc/systemd/system/$service.d/alert.conf" >/dev/null
done
sudo systemctl daemon-reload
```

本轮只完成代码、消息合同回归和不发信预览，没有配置收件人、发送测试邮件或安装告警服务。主机内告警也不能覆盖整台VPS断电/失联，后者需要外部监测与独立接收渠道；不得将本模板宣传成全故障覆盖。
