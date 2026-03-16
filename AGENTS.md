# AGENTS.md — AI Agent 开发经验

## Git 提交原则

**每个任务完成后都要进行 Git 提交，提交信息使用中文说明。**

### 提交规范

```bash
# 功能开发
git add .
git commit -m "功能：添加 XXX 功能"

# Bug 修复
git commit -m "修复：解决 XXX 问题"

# 代码重构
git commit -m "重构：优化 XXX 模块"

# 文档更新
git commit -m "文档：更新 XXX 说明"

# 依赖更新
git commit -m "依赖：升级/添加 XXX 包"

# 配置变更
git commit -m "配置：调整 XXX 设置"
```

### 提交时机

- ✅ 完成一个独立功能
- ✅ 修复一个 Bug
- ✅ 完成一次重构
- ✅ 更新文档
- ✅ 调整配置
- ❌ 不要在代码无法运行时提交
- ❌ 不要把多个不相关的改动放在一个提交中

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

**密码配置：**

本项目数据库密码：`jiangzhihao123`

使用方式：
```bash
PGPASSWORD='jiangzhihao123' /opt/homebrew/opt/libpq/bin/psql \
  'postgresql://postgres.orftlxqgxsezreyzsnot@aws-1-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require' \
  -Atqc "SELECT 1;"
```

### 项目参数

| 参数 | 值 |
|------|-----|
| PROJECT_REF | `orftlxqgxsezreyzsnot` |
| SUPABASE_URL | `https://orftlxqgxsezreyzsnot.supabase.co` |
| 代理地址 | `http://127.0.0.1:7890` |

### OpenRouter AI 模型代理配置

**开发环境自动使用代理访问 OpenRouter**（绕过地域限制）

在 `.env` 文件中配置：

```bash
# AI Provider 配置
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=your_openrouter_api_key

# 开发环境代理（自动检测 NODE_ENV=development）
HTTP_PROXY=http://127.0.0.1:7890

# 可选：指定模型（默认使用 anthropic/claude-sonnet-4.6）
AI_MODEL=anthropic/claude-sonnet-4.6
SEARCH_JUDGE_MODEL=anthropic/claude-sonnet-4.6
SEARCH_ARBITER_MODEL=anthropic/claude-sonnet-4.6
```

**工作原理：**
- `src/lib/search-jobs.ts` 的 `createAIClient()` 函数会检测 `NODE_ENV === "development"` 和 `HTTP_PROXY`
- 如果两者都存在，自动使用 `https-proxy-agent` 通过代理访问 OpenRouter
- 生产环境不使用代理，直连 OpenRouter

**已删除的功能：**
- ❌ PDL (People Data Labs) 集成已移除
- ❌ 用户设置中的 PDL API Key 配置已移除
- ✅ 现在只使用 Serper.dev + Bright Data 作为数据源

### 注意事项

- Management API 的 access token 有效期有限，过期后需重新 `supabase login`
- 单条 SQL 语句中的单引号用 `'\''` 转义（bash）或 `''`（SQL 内部）
- 复杂的 SQL 建议拆成多条请求，避免 JSON 转义问题
- `supabase link --project-ref {REF}` 也走 HTTPS，代理下可用
