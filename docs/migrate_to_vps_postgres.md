# 从 Supabase Postgres 迁移到 VPS Postgres

本文档说明如何把 Hirelix 的业务数据从 Supabase 托管 Postgres 迁移到自有 VPS
Postgres。Auth 继续留在 Supabase（免费额度足够），仅迁移数据存储以解决 egress
配额问题。

## 架构变更

| 组件 | 之前 | 之后 |
|------|------|------|
| 业务表读写 | `supabase-js` → Supabase PostgREST | Drizzle ORM → VPS Postgres |
| Auth 登录 | Supabase Auth | **不变** |
| JWT 验证 | 调 `${SUPABASE_URL}/auth/v1/user` | 本地 `jsonwebtoken` 验签 |
| 用户列表（管理面板） | Supabase Auth Admin API | **不变** |
| 调度器 | Supabase + Supabase 客户端 | VPS Postgres + Drizzle |

## 一次性切换流程（30 分钟停服窗口）

### 1. 在 VPS 上准备 Postgres

```bash
ssh us-2  # 或其他 VPS 别名
sudo -u postgres createdb hirelix
sudo -u postgres createuser --pwprompt hirelix_app   # 设强密码
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE hirelix TO hirelix_app;"
sudo -u postgres psql -d hirelix -c "GRANT ALL ON SCHEMA public TO hirelix_app;"
```

启用 SSL + 公网监听：

- 编辑 `/etc/postgresql/17/main/postgresql.conf`：
  - `listen_addresses = '*'`
  - `ssl = on`
- 编辑 `/etc/postgresql/17/main/pg_hba.conf`，加一行：
  - `hostssl  hirelix  hirelix_app  0.0.0.0/0  scram-sha-256`
- `sudo systemctl restart postgresql`
- 防火墙开 5432：`sudo ufw allow 5432/tcp`

### 2. 在 VPS Postgres 上跑业务表 schema

把 `supabase/vps_init.sql` 拷到 VPS 后：

```bash
PGPASSWORD='STRONG_PASSWORD' psql -h localhost -U hirelix_app -d hirelix \
  -f vps_init.sql
```

或直接从本地推：

```bash
PGPASSWORD='STRONG_PASSWORD' psql \
  -h VPS_HOST -U hirelix_app -d hirelix -p 5432 \
  -f supabase/vps_init.sql
```

`vps_init.sql` 已经去掉了 `auth.users` 外键和 RLS 策略。

### 3. 从 Supabase 导出业务数据

```bash
# 仅导出 public schema 的业务表数据，不导 auth.* / storage.*
pg_dump \
  "postgresql://postgres:SUPABASE_PASS@db.YOUR_PROJECT.supabase.co:5432/postgres" \
  --schema=public \
  --data-only \
  --column-inserts \
  -t 'public.hirelix_*' \
  -f /tmp/hirelix-data.sql
```

注意：业务表里的 `user_id` 字段直接保留 Supabase Auth 颁发的 UUID，不需要转换。

### 4. 导入到 VPS Postgres

```bash
PGPASSWORD='STRONG_PASSWORD' psql \
  -h VPS_HOST -U hirelix_app -d hirelix \
  -f /tmp/hirelix-data.sql
```

数据校验：

```bash
PGPASSWORD='STRONG_PASSWORD' psql -h VPS_HOST -U hirelix_app -d hirelix -c "
SELECT 'hirelix_searches' AS t, count(*) FROM hirelix_searches
UNION ALL SELECT 'hirelix_candidates', count(*) FROM hirelix_candidates
UNION ALL SELECT 'hirelix_user_settings', count(*) FROM hirelix_user_settings;
"
```

把行数和 Supabase Dashboard 上的对比一致。

### 5. 切换环境变量

把以下变量加进 Vercel + VPS 调度器：

```bash
# 必须新增
DATABASE_URL=postgresql://hirelix_app:STRONG_PASSWORD@VPS_HOST:5432/hirelix?sslmode=require
SUPABASE_JWT_SECRET=...   # Supabase Dashboard → Project Settings → API → JWT Settings

# 保留（Auth 仍走 Supabase）
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### 6. 部署

- **Vercel**：触发一次新部署。
- **VPS 调度器**：`pm2 restart` / `systemctl restart` 等。

### 7. 冒烟测试

1. 登录测试账号 `jzh_spring@163.com`
2. 在 dashboard 看到旧搜索列表（确认数据完整迁移）
3. 创建一次新搜索，等待调度器执行完毕
4. 打开候选人详情，触发 enrich
5. 监控 1 小时无异常即视为成功

### 8. 回滚预案

迁移后保留 Supabase 数据库 7 天不删。回滚步骤：

1. 在 Vercel + VPS 把 `DATABASE_URL` 切回 Supabase 连接字符串。
2. （需要补一个临时分支把代码改回 supabase-js）—— 或保留迁移前的 git commit
   `cd8aba8` 之前的版本作为回滚版本。

> 鉴于改动量大（121 处调用），实际回滚成本不小，**最稳妥的做法是给自己 7 天
> 观察期 + 立刻部署修复 bug**，不要轻易整体回滚。

## 常用诊断命令

```bash
# VPS 上查看连接 & 慢查询
sudo -u postgres psql hirelix -c "
  SELECT pid, usename, application_name, state, query_start, substring(query, 1, 60) AS q
  FROM pg_stat_activity
  WHERE datname = 'hirelix'
  ORDER BY query_start DESC
  LIMIT 20;"

# 查看连接数限制
sudo -u postgres psql -c "SHOW max_connections;"

# 查看 SSL 状态
sudo -u postgres psql -c "SELECT pid, ssl, client_addr FROM pg_stat_ssl JOIN pg_stat_activity USING (pid) WHERE datname = 'hirelix';"
```

## 备注

- **不做备份**：用户明确放弃备份策略。VPS 磁盘挂了等于数据全丢，这是已知风
  险。后续可加 `pg_dump` + R2 上传作为兜底。
- **不装 PgBouncer**：用 postgres.js 的内置连接池，`DATABASE_POOL_MAX=10`
  默认即可。流量高峰再考虑加 PgBouncer transaction 模式。
- **没做 Asymmetric JWT**：HS256 + `SUPABASE_JWT_SECRET` 已经够用，简单可靠。
