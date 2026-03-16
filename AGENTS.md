# AGENTS.md — AI Agent 开发经验

## 网络代理配置

本地网络无法直连国外服务，代理运行在 `127.0.0.1:7890`。

### HTTP/HTTPS 请求（curl、Node.js fetch 等）

直接设置环境变量即可：

```bash
export https_proxy=http://127.0.0.1:7890
export http_proxy=http://127.0.0.1:7890
```

### PostgreSQL 连接（psql、Supabase CLI db push 等）

**PostgreSQL 协议不支持 HTTP 代理！** 以下方式全部无效：
- `HTTP_PROXY` / `HTTPS_PROXY` 环境变量
- `proxychains`（macOS arm64e 架构不兼容）
- Node.js `pg` 客户端 + 代理环境变量

### ✅ 最佳方案：Supabase Management API + curl

通过 HTTPS 协议调用 Supabase Management API 执行 SQL，绕过 PostgreSQL 直连限制。

**步骤：**

1. **登录 Supabase CLI（仅首次需要）：**
```bash
export HTTPS_PROXY=http://127.0.0.1:7890
supabase login --no-browser
# 浏览器打开链接完成验证
```

2. **获取 access token（从 macOS Keychain）：**
```bash
TOKEN=$(security find-generic-password -s supabase -w 2>/dev/null | sed 's/go-keyring-base64://' | base64 -d)
echo $TOKEN
```

3. **执行 SQL：**
```bash
export https_proxy=http://127.0.0.1:7890

curl -s -X POST "https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT 1"}'
```

4. **执行多条 SQL 语句（用分号分隔）：**
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"CREATE TABLE ...; ALTER TABLE ...; CREATE POLICY ..."}'
```

### ✅ 备选方案：Supabase Pooler + psql（本项目已验证可用）

当满足下面任一条件时，优先考虑这条路：

- 不想依赖 macOS Keychain 读取 Supabase token
- Management API 不方便使用，或 SQL 太长不想做 JSON 转义
- `db.{PROJECT_REF}.supabase.co` 解析失败，但 Supabase pooler 可连通

**要点：**

- Supabase pooler 走的是 PostgreSQL 协议，不是 HTTP
- **不需要** `HTTP_PROXY` / `HTTPS_PROXY`
- 建议显式加上 `sslmode=require`
- macOS 上优先使用 Homebrew 的 `psql`：`/opt/homebrew/opt/libpq/bin/psql`

**本项目可用连接信息：**

| 参数 | 值 |
|------|-----|
| Pooler Host | `aws-1-us-west-1.pooler.supabase.com` |
| Pooler User | `postgres.orftlxqgxsezreyzsnot` |
| Database | `postgres` |
| Port | `5432` |

**连接测试：**

```bash
PGPASSWORD='<DB_PASSWORD>' /opt/homebrew/opt/libpq/bin/psql \
  'postgresql://postgres.orftlxqgxsezreyzsnot@aws-1-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require' \
  -Atqc 'select 1'
```

**执行 migration：**

```bash
PGPASSWORD='<DB_PASSWORD>' /opt/homebrew/opt/libpq/bin/psql \
  'postgresql://postgres.orftlxqgxsezreyzsnot@aws-1-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require' \
  -v ON_ERROR_STOP=1 \
  -f supabase/migrations/<migration_file>.sql
```

**执行单条 SQL：**

```bash
PGPASSWORD='<DB_PASSWORD>' /opt/homebrew/opt/libpq/bin/psql \
  'postgresql://postgres.orftlxqgxsezreyzsnot@aws-1-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require' \
  -Atqc "SELECT now();"
```

**密码来源建议：**

- 优先使用项目已有的安全存放位置，例如本地 `.env`、团队密码管理器、一次性 shell 环境变量
- 如果仓库里已经有明确的本地运维脚本或连接文件，可先从这些地方确认当前项目实际在用的连接参数
- 不要把明文密码再次写入 `AGENTS.md`

### 项目参数

| 参数 | 值 |
|------|-----|
| PROJECT_REF | `orftlxqgxsezreyzsnot` |
| SUPABASE_URL | `https://orftlxqgxsezreyzsnot.supabase.co` |
| 代理地址 | `http://127.0.0.1:7890` |

### 注意事项

- Management API 的 access token 有效期有限，过期后需重新 `supabase login`
- 单条 SQL 语句中的单引号用 `'\''` 转义（bash）或 `''`（SQL 内部）
- 复杂的 SQL 建议拆成多条请求，避免 JSON 转义问题
- `supabase link --project-ref {REF}` 也走 HTTPS，代理下可用
