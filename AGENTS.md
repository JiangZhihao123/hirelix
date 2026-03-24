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

## 产品早期原则

- 不要过度设计，优先保证主链路的用户体验和可用性
- 在产品早期，先解决高频、真实会影响用户的核心问题
- 对于发生概率很低的 1% 边缘情况，不必一开始就设计得过度完美、过度复杂
- 优先选择简单、可维护、可迭代的方案，等真实问题出现后再逐步增强

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

### 测试账号

**Web 登录测试账号（Supabase Auth）：**

| 类型 | 值 |
|------|-----|
| 邮箱 | `jzh_spring@163.com` |
| 密码 | `88888888` |

说明：
- 这组账号用于站点登录测试，不是数据库连接账号
- 如密码失效，优先到 Supabase Auth 后台确认是否被修改

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

### Bright Data 召回成本

当前项目搜索召回实际使用的是 **Bright Data Dataset Filter API**，不是 Web Scraper API。

已确认的价格口径：

- 数据集：`dataset Linkedin people profiles`
- 产品线：`Datasets / Marketplace Dataset API`
- 单价：`$250 / 100,000 records`
- 折算：`$2.5 / 1000 records`
- 再折算：`$0.0025 / record`

常用召回成本速查：

- `10` 条：约 `$0.025`（后台可能显示为 `$0.02`，存在四舍五入）
- `100` 条：`$0.25`
- `150` 条：`$0.375`
- `200` 条：`$0.50`
- `300` 条：`$0.75`
- `400` 条：`$1.00`

说明：
- 当前代码中的召回结构已下调为：`standard 100 + hidden_gem 50 + company_target 50`
- 当前满配召回成本：`200 × 0.0025 = $0.50`
- 历史旧配额曾是：`standard 200 + hidden_gem 100 + company_target 100`
- 历史旧配额满配召回成本：`400 × 0.0025 = $1.00`
- 实际返回条数可能因去重少于请求条数，但 Bright Data 计费按 records 单价理解和估算
- `snapshot metadata.cost` 在实际运行中可能返回 `0`，不能当作最终账单真相；最终账单优先以 Bright Data Cost Explorer 为准
- 不要把 `Web Scraper API` 的 `$1.5 / 1000 records` 价格套用到当前搜索召回链路上；当前链路用的是 `Dataset Filter API`

### LLM 成本

当前搜索链路的 LLM 调用：

- Provider 通道：OpenRouter
- 主模型：`deepseek/deepseek-chat`
- judge / arbiter：也使用 `deepseek/deepseek-chat`
- 实际调用成本参考 OpenRouter 历史日志估算，而不是只按理论单价拍脑袋推断

已验证的经验口径：

- 单次 DeepSeek V3 调用常见成本约：`$0.00040 ~ $0.00059`
- 经验均值可按：`$0.00048 / request` 估算

单任务 LLM 成本估算：

- 当前新配额 `100 + 50 + 50`：
  - 约 `440 ~ 450` 次模型调用
  - LLM 成本约：`$0.21 ~ $0.22 / task`
- 历史旧配额 `200 + 100 + 100`：
  - 约 `870 ~ 880` 次模型调用
  - LLM 成本约：`$0.42 / task`

单任务总成本速查：

- 当前新配额：
  - Bright 约：`$0.50`
  - LLM 约：`$0.21 ~ $0.22`
  - 总计约：`$0.71 ~ $0.72 / task`
- 历史旧配额：
  - Bright 约：`$1.00`
  - LLM 约：`$0.42`
  - 总计约：`$1.42 / task`

说明：

- 上述 LLM 成本是按当前链路结构估算：`parse + 全量候选人双 judge + 部分 arbiter + 少量收尾/outreach`
- 如果 judge 数量、arbiter 比例、召回人数发生变化，LLM 成本会同步变化
- 当前链路的 LLM 成本大头来自“请求次数”，不只是单次 token 多少

### 注意事项

- Management API 的 access token 有效期有限，过期后需重新 `supabase login`
- 单条 SQL 语句中的单引号用 `'\''` 转义（bash）或 `''`（SQL 内部）
- 复杂的 SQL 建议拆成多条请求，避免 JSON 转义问题
- `supabase link --project-ref {REF}` 也走 HTTPS，代理下可用
