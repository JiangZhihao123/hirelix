# Hirelix Agents Guide

本文件是仓库内 AI 代理协作的单一信息源。

适用对象：
- Codex
- Claude Code
- 其他会读取仓库提示词文件的 AI 编程代理

维护原则：
- 新规则优先补充到对应章节，不要把零散说明堆在文件末尾
- 能放表格就放表格，能放清单就放清单，避免长段落
- 与开发规范相关的细则优先收敛到 `docs/conventions.md`，本文件保留“代理执行时必须知道”的高价值信息

## 目录

- [1. 快速入口](#1-快速入口)
- [2. 协作规则](#2-协作规则)
- [3. 技术原则](#3-技术原则)
- [4. 项目概览](#4-项目概览)
  - [4.5 页面路由分组](#45-页面路由分组)
  - [4.6 产品 API 路由 (需认证)](#46-产品-api-路由-需认证)
  - [4.7 内部 API 路由 (调度器触发)](#47-内部-api-路由-调度器触发)
  - [4.8 搜索状态机](#48-搜索状态机)
  - [4.9 AI 模型策略](#49-ai-模型策略)
- [5. 常用命令](#5-常用命令)
- [6. 本地开发](#6-本地开发)
  - [6.4 环境变量分组](#64-环境变量分组)
  - [6.5 数据库迁移](#65-数据库迁移)
- [7. 测试与调试](#7-测试与调试)
  - [7.4 日志排查](#74-日志排查)
- [8. 生产环境](#8-生产环境)
  - [8.8 us-2 个人 VPS 代理面板](#88-us-2-个人-vps-代理面板)
- [9. 扩展参考](#9-扩展参考)

## 1. 快速入口

### 1.1 修改代码前先知道

| 主题 | 规则 |
|------|------|
| 提交 | 完成一个主要任务后立即提交一次，不要混入无关改动 |
| Commit Message | 使用中文，清楚说明解决了什么问题或完成了什么改动 |
| 文本处理 | 核心文本理解、清洗、修复、分类、提取，优先用 LLM，不要用正则硬写 |
| 页面渐进式测试 | 优先使用 Playwright MCP，边观察边决策 |
| 测试结论 | 不要把 mock 测试当作核心用户旅程或真实链路结论；核心结论必须优先跑真实服务、真实 DB、真实外部依赖或明确说明未覆盖 |
| 真实链路问题 | 遇到真实依赖或生产级验证失败时，优先定位根因并修复；不能解决就明确标记阻塞，不要用 mock、降级、跳过或缩小范围包装成成功 |
| Imagegen | 使用 `$imagegen` / `gpt-image-2` 时，不要预设图中文字会错乱；最新 `gpt-image-2` 文字能力已足够强，品牌图、海报、封面、横幅等可以优先考虑直接生成或迭代 |
| 本地代理 | 中国大陆本地开发通常需要 `http://127.0.0.1:7890` 访问 Google OAuth 和外部服务 |
| 登录方式 | 仅支持 Google OAuth（better-auth + Google Cloud OAuth Client） |

### 1.2 项目一句话说明

Hirelix 是一个 AI 驱动的被动候选人搜索平台：输入职位描述后，系统自动搜索候选人、评分，并生成外联内容。

## 2. 协作规则

### 2.1 提交规则

- 完成一个主要任务后应立即提交一次
- 避免把多个不相关改动混在同一个 commit 中
- Commit Message 使用中文

### 2.2 文档维护规则

- `AGENTS.md` 是提示词主入口
- `CLAUDE.md` 只做引用，不重复维护内容
- 规则类内容优先按主题归档到已有章节
- 如果新增内容不属于任何章节，先补目录再补正文

## 3. 技术原则

### 3.1 用 LLM 而非正则处理文本问题

禁止用正则表达式解决任何核心文本理解、清洗或修复问题。

正则只适合：
- 日期格式
- URL 提取
- 邮箱校验
- 其他边界明确、格式严格的字符串处理

以下场景必须调用 LLM：
- 自然语言文本的清洗与修复
- 文本内容的判断、分类、提取
- 看起来像正则能处理，但边界情况很多的文本问题

原因：
- 正则在语言边界模糊时副作用不可控
- LLM 能利用语义上下文，结果通常更稳健

### 3.2 页面渐进式测试优先使用 Playwright MCP

当任务目标是对页面进行渐进式测试时，优先使用 Playwright MCP，而不是把 `playwright skill` 当作执行主体。

这里的“渐进式测试”指：
- 先观察当前页面状态，再决定下一步操作
- 根据真实 DOM、交互结果、报错信息动态调整路径
- 随时查看 console、network、snapshot、screenshot 辅助判断

执行原则：
- 首选 Playwright MCP：负责真实打开页面、点击、输入、等待、抓取快照、截图、查看 console 和 network
- `playwright skill` 仅作为流程指导：帮助组织排查步骤，不负责实际浏览器操作
- 固定回归流程另说：稳定流程沉淀为自动化测试时，再考虑 Playwright CLI 或 `@playwright/test`

一句话原则：
页面的渐进式、边观察边决策的测试，一律优先用 Playwright MCP。

## 4. 项目概览

### 4.1 部署分层

| 组件 | 部署位置 | 说明 |
|------|----------|------|
| Next.js 前端 + API | Vercel | 无状态，承载页面、产品 API、Auth API、Paddle webhook、内部调度触发 API |
| 搜索任务调度器 | us-2 VPS | 独立 systemd 进程 `hirelix-scheduler`，负责长耗时搜索任务 |
| 数据库 | us-2 VPS Postgres | 自托管 PostgreSQL 17，所有 hirelix_* 业务表 + better-auth 表 |
| Auth | better-auth | Google OAuth，session 写入同一 Postgres，无独立 Auth 服务 |

当前生产部署以本文件与 `README.md` 为准。`docs/migrate_to_vps_postgres.md` 仍是迁移阶段归档，可能保留 Supabase Auth / 旧迁移阶段口径，排查生产问题时不要优先引用这些旧说法。

### 4.2 搜索流水线

1. JD 解析：`src/lib/jd-parse.ts`
2. Bright Data 召回：`src/lib/brightdata.ts`（LinkedIn 数据集筛选 + 抓取）
3. AI 预筛 + 深度评分：`src/lib/search-jobs.ts`
4. 初始交付：交付本次召回并评分后的候选人池，召回到的候选人都应进入交付池，不能再按旧“最多 25 人 shortlist”叙事截断
5. 按需候选人研究：用户选择某个候选人后再触发 Candidate Research；GitHub 只是研究来源之一，不是初始交付界面的一等产品心智

### 4.3 核心文件

| 文件 | 作用 |
|------|------|
| `src/lib/search-jobs.ts` | 搜索引擎主流程，最核心文件 |
| `src/lib/prompts.ts` | AI Prompt 模板 |
| `src/lib/llm-client.ts` | DeepSeek 官方 API 客户端与模型路由配置（OpenRouter 仅作 fallback） |
| `src/lib/llm-schemas.ts` | AI 响应的 JSON Schema |
| `src/lib/search-execution.ts` | 搜索执行档位配置 |
| `src/lib/search-task.ts` | 搜索状态机状态定义与任务副本 |
| `src/lib/search-state.ts` | 搜索状态工具函数(过期/状态分类) |
| `src/lib/search-job-scheduler.ts` | 调度器核心循环(轮询/分发/心跳) |
| `src/lib/search-notifications.ts` | 搜索完成通知(Resend 邮件) |
| `src/lib/recruiter-outreach.ts` | 外联文案生成 |
| `src/lib/brightdata.ts` | Bright Data 数据集/抓取接口 |
| `src/lib/public-evidence-jobs.ts` | 候选人按需研究队列（内部仍沿用 public evidence 命名） |
| `src/lib/public-evidence/` | 候选人研究的来源发现、证据整理与销售证据判断 |
| `src/lib/github-signals.ts` | 深调内部使用的 GitHub 证据来源之一，不参与初始候选人交付 |
| `src/lib/github/discovery.ts` | 深调内部 GitHub 身份发现（含 Serper 兜底） |
| `src/lib/github-enrichment-jobs.ts` | 旧 GitHub 富化队列，保留兼容但不应由初始搜索、调度器或 smoke 主链路触发 |
| `src/lib/jd-parse.ts` | JD 文本解析(提取技能/职位/公司) |
| `src/lib/company-research.ts` | 目标公司研究 |
| `src/lib/display-name.ts` | 候选人显示名清理 |
| `src/lib/server-outbound-proxy.ts` | 全局代理初始化 |
| `src/lib/auth.ts` | better-auth 服务端实例（Google OAuth 配置） |
| `src/lib/auth-client.ts` | better-auth 浏览器客户端（`useSession` / `signIn` / `signOut`） |
| `src/app/api/auth/[...all]/route.ts` | better-auth 路由挂载点（`/api/auth/*`） |
| `src/lib/api-auth.ts` / `client-auth.ts` | API 与客户端认证 |
| `src/lib/billing.ts` / `billing-server.ts` | 计费逻辑 |
| `src/lib/paddle.ts` | Paddle 支付集成 |
| `src/lib/hunter.ts` | Hunter 邮箱查找集成 |
| `src/lib/analytics.ts` | 产品分析埋点 |
| `scheduler/index.ts` | VPS 调度器入口 |

### 4.4 关键数据表

| 表名 | 作用 |
|------|------|
| `hirelix_searches` | 搜索任务主表，包含状态机 |
| `hirelix_candidates` | 候选人结果表 |
| `hirelix_search_jobs` | 搜索任务队列表 |
| `hirelix_public_evidence_jobs` | 候选人研究任务队列表 |
| `hirelix_public_evidence_items` | 候选人研究来源与证据明细 |
| `hirelix_github_enrichment_jobs` | 旧 GitHub 富化任务队列表，仅作兼容排查，不应主动接入初始交付链路 |

### 4.5 页面路由分组

| 路由 | 说明 |
|------|------|
| `(landing)` | 营销落地页 |
| `(marketing)` | 隐私政策、条款等 |
| `(product)/app` | 产品页面，需认证 |

### 4.6 产品 API 路由 (需认证)

位于 `src/app/(product)/api/`：

| 路由 | 说明 |
|------|------|
| `search/create` | 创建搜索 |
| `search/parse` | JD 文本解析 |
| `search/clarify` | JD 补全/澄清 |
| `search/[id]/retry` | 重试搜索 |
| `candidates/[id]` | 候选人详情 |
| `candidates/[id]/enrich` | 候选人邮箱查询、外联重写、按需候选人研究入口 |
| `settings/ai-company` | AI 公司描述 |
| `billing/*` | 计费相关 |

### 4.7 内部 API 路由 (调度器触发)

位于 `src/app/api/`：

| 路由 | 说明 |
|------|------|
| `internal/search-jobs/run` | 调度器触发搜索执行 |
| `internal/public-evidence-jobs/run` | 调度器触发候选人按需研究 |
| `paddle/webhook` | Paddle 支付 webhook |

### 4.8 搜索状态机

```
queued → parsing → searching → screening → deep_scoring → done
                                                         → error
```

| 状态 | 说明 |
|------|------|
| `queued` | 等待调度器分配 |
| `parsing` | AI 解析 JD 文本，提取技能/职位/公司 |
| `searching` | Bright Data 召回（LinkedIn 数据集筛选 + 抓取） |
| `screening` | AI 预筛（地域 hard gate + 基础匹配） |
| `deep_scoring` | AI 深度评分（匹配/能力/加入意愿） |
| `done` | 全部完成 |
| `error` | 搜索失败 |

调度器通过 `pipeline_step` 追踪当前阶段（`accepted` → `brief_ready` → `linkedin_scan` → `reviewing_profiles` → `shortlist_ready`）。

### 4.9 AI 模型策略

- 默认使用 DeepSeek V4 Flash 处理搜索与评分
- 思考模式按阶段配置：解析/外联默认关闭，深评默认 `high`，仲裁默认 `max`
- 默认通过 DeepSeek 官方 API，OpenRouter 仅作为可选 fallback
- 三阶段模型可独立配置：`SEARCH_LIGHT_MODEL`（预筛）、`SEARCH_JUDGE_MODEL`（深度评分）、`SEARCH_ARBITER_MODEL`（仲裁/争议裁决）
- 配置文件：`src/lib/llm-client.ts`

## 5. 常用命令

```bash
npm run dev              # 启动 Next.js（默认 http://localhost:3000）
npm run scheduler:dev    # 启动本地调度器（另起终端）
npm run build            # 生产构建
npx tsc --noEmit         # TypeScript 类型检查（CI 执行此步骤）
npm run lint             # ESLint 检查
npm run test:unit        # 单元测试（Node.js native test runner）
npm run test:e2e         # Playwright E2E 测试（headless）
npm run test:e2e:ui      # Playwright UI 模式
```

单独运行一个测试文件：

```bash
npx tsx --test tests/github-signals.test.ts
npx tsx --test tests/search-task.test.ts
```

单独运行一个集成脚本：

```bash
npx tsx scripts/integration/test-bright-10.ts
npx tsx scripts/integration/test-bright-recall.ts
```

调试脚本和数据检查：

```bash
npx tsx scripts/debug/check-failed-search.ts
npx tsx scripts/debug/check-snapshot.ts
```

## 6. 本地开发

### 6.1 测试账号

| 环境 | 邮箱 | 密码 |
|------|------|------|
| 本地 dev | `noahjiang2@gmail.com` | 通过 Google OAuth 登录 |

注意：
- 登录方式仅支持 Google OAuth
- 测试时通过浏览器手动登录；自动化测试可使用 Playwright + 已存的 session cookie

### 6.2 启动开发服务器

```bash
npm run dev
```

如需同时运行调度器：

```bash
npm run scheduler:dev
```

### 6.3 网络代理

| 场景 | 代理设置 |
|------|----------|
| 中国大陆本地开发 | 通过本地代理 `http://127.0.0.1:7890` 访问 Google OAuth 和外部服务 |
| 生产环境 | 不需要代理 |

注意：
- 不要把”本地需要代理”的假设带到生产配置中

### 6.4 环境变量分组

核心变量见 `.env.example`，主要分组：

| 分组 | 关键变量 |
|------|----------|
| 数据库 | `DATABASE_URL`（指向 us-2 Postgres `hirelix` 库） |
| Auth | `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| AI 模型 | `AI_PROVIDER`, `AI_MODEL`, `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_THINKING`, `DEEPSEEK_REASONING_EFFORT`, `SEARCH_PARSE_THINKING`, `SEARCH_OUTREACH_THINKING`, `SEARCH_JUDGE_REASONING_EFFORT`, `SEARCH_ARBITER_REASONING_EFFORT`, `ANTHROPIC_API_KEY` |
| 搜索模型档位 | `SEARCH_LIGHT_MODEL`, `SEARCH_JUDGE_MODEL`, `SEARCH_ARBITER_MODEL` |
| 数据源 | `BRIGHTDATA_API_TOKEN`, `GITHUB_TOKEN`, `HUNTER_API_KEY`, `SERPER_API_KEY`（`GITHUB_TOKEN`/`SERPER_API_KEY` 仅用于按需候选人研究，不参与初始候选人交付） |
| 搜索调优 | `SEARCH_EXECUTION_MODE`, `SEARCH_TEST_BRIGHTDATA_STANDARD_LIMIT`, `SEARCH_PRODUCTION_BRIGHTDATA_STANDARD_LIMIT`, `BRIGHTDATA_SNAPSHOT_CACHE_TTL_DAYS`, `SEARCH_JOB_SCHEDULER_CONCURRENCY`, `SEARCH_DEEP_REVIEW_CONCURRENCY`, `SEARCH_LLM_GLOBAL_CONCURRENCY`, `SEARCH_DEEP_CACHE_PRIMER_COUNT`, `SEARCH_JUDGE_SCORING_TIMEOUT_MS` |
| Paddle 计费 | `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET` |
| 通知 | `RESEND_API_KEY`, `SEARCH_NOTIFICATIONS_ENABLED` |
| 代理（仅本地） | `PROXY_ENABLED`, `PROXY_URL` |

Bright Data 说明：
- 当前 Bright Data API key：`588f9fbd-b996-47b5-b267-8580aa69fbbd`（用户已明确允许在项目代理说明中明文记录）
- `BRIGHTDATA_API_TOKEN` 仍应同步写入 `.env`、Vercel 环境变量和 `/etc/hirelix.env`
- 查询账户余额（当前数据集 token 可能返回 `Auth method is not supported`，不能把该错误当作余额为 0）：

```bash
export BRIGHTDATA_API_TOKEN='588f9fbd-b996-47b5-b267-8580aa69fbbd'
curl -sS 'https://api.brightdata.com/customer/balance' \
  -H "Authorization: Bearer $BRIGHTDATA_API_TOKEN" | jq .
```

- 如果返回 `Token expired` / `401`，去 Bright Data 控制台的 Account settings / Users 重新生成 API key，并同步更新本地、Vercel 和 VPS 调度器环境变量
- Bright snapshot metadata 里的 `cost <= 0` 只表示 API 未给出可信成本，代码应记录为 `null/unknown`，不要展示成真实成本 0

### 6.5 数据库迁移

SQL 迁移文件位于 `supabase/migrations/`（路径名是历史包袱，实际跑在 us-2 自托管 Postgres 上）。命名格式为 `YYYYMMDD_description.sql`。

- `supabase/vps_init.sql`：基础 schema（一次性初始化新库时使用）
- `supabase/migrations/`：增量迁移，按日期前缀命名
- 迁移通过 `ssh us-2 'sudo -u postgres psql -d hirelix -f /tmp/xxx.sql'` 手动执行

## 7. 测试与调试

### 7.1 页面问题排查顺序

1. 先打开页面观察真实状态
2. 再查看 console / network
3. 根据 DOM 和报错决定下一步点击、输入、等待或截图
4. 稳定后再决定是否补自动化测试

### 7.2 Mock 测试使用边界

- Mock 测试只能验证局部 UI、状态转换、请求 payload、错误分支等低风险边界
- 回答“核心用户旅程是否可用”“真实搜索链路是否正常”“生产依赖是否打通”时，不能只跑 mock 测试
- 核心链路验证应优先使用真实登录/session、真实数据库、真实 API 路由、真实调度器、真实 LLM/Bright Data/按需候选人研究等外部依赖
- 生产/准生产链路测试优先在 `us-2` 上执行，尤其是 Bright Data、按需候选人研究、LLM、Postgres 等外部依赖链路；本地中国大陆网络容易放大跨境下载/连接耗时，不能单独作为生产性能结论
- 如果受环境、费用、速率限制无法跑真实链路，必须明确说明“只跑了 mock/fixture 测试，不能证明真实链路可用”
- 测试结果汇报中必须区分：`mock 回归`、`本地真实链路`、`生产/准生产链路`

一句话原则：
Mock 是辅助，不是结论；核心用户价值必须用真实链路验证或明确标注未验证。

### 7.3 调度器相关定位

优先检查：
- `scheduler/index.ts`
- 搜索队列表 `hirelix_search_jobs`
- 候选人研究队列表 `hirelix_public_evidence_jobs`
- VPS 上的 `hirelix-scheduler` systemd 服务状态与日志

### 7.4 日志排查

当前项目使用 `pino` 提供服务端结构化日志能力，入口为 `src/lib/logger.ts`。

| 场景 | 查看方式 |
|------|----------|
| Vercel 前端/API | Vercel Function Logs / Runtime Logs |
| us-2 调度器 | `ssh us-2 'sudo journalctl -u hirelix-scheduler -f'` |
| 本地开发 | 终端 stdout/stderr |
| 本地历史测试 | `logs/`、`.playwright-mcp/`、`.playwright-cli/` |

执行原则：
- 新增服务端日志优先使用 `getLogger({ component: "..." })`，不要继续扩散裸 `console.*`
- 生产日志默认输出 JSON，便于后续接入 Better Stack / Axiom / Datadog / Loki 等集中式日志平台
- 日志字段里不要写入明文 token、password、authorization header；`src/lib/logger.ts` 已配置基础 redact，但调用侧仍要避免传入敏感大对象
- 调度器问题优先按 `component`、`search_id`、`job_id`、`candidate_id`、`workerIndex` 这些字段定位

## 8. 生产环境

### 8.1 VPS 信息

调度器已从旧 Vultr VPS 迁移到 `us-2`。

| 配置项 | 值 |
|--------|-----|
| Host | `65.49.232.163` |
| SSH User | `noah` |
| SSH Port | `22` |
| Hostname | `clean-bump-1.localdomain` |
| 部署目录 | `/opt/hirelix` |

### 8.2 SSH 连接命令

```bash
# 直连
ssh us-2

# 快速连通性检查
ssh -o BatchMode=yes -o ConnectTimeout=10 us-2 'echo VPS_OK && hostname'
```

### 8.3 部署架构

| 组件 | 部署位置 | 说明 |
|------|----------|------|
| Next.js 前端 + API Routes | Vercel | 不含调度器；本地已 link 到 Vercel 项目 `hirelix` |
| 搜索任务调度器 | us-2 VPS `/opt/hirelix` | 独立进程，systemd 服务名为 `hirelix-scheduler` |
| PostgreSQL | us-2 VPS | 自托管 PostgreSQL 17，生产库名 `hirelix` |
| Auth | better-auth + us-2 Postgres | Google OAuth；`user`、`session`、`account`、`verification` 表在同一数据库 |

生产域名：
- `hirelix.online`

当前检查命令：

```bash
# 本地 Git 状态与远端差异
git fetch --prune origin
git status --short --branch
git log --oneline --decorate --left-right --graph origin/main...HEAD

# VPS 服务与线上代码版本
ssh us-2 'cd /opt/hirelix && sudo git status --short --branch && sudo git rev-parse --short HEAD'
ssh us-2 'sudo systemctl status hirelix-scheduler --no-pager'
ssh us-2 'sudo systemctl is-active postgresql && sudo -u postgres psql -tAc "SELECT version();"'
```

### 8.4 调度器部署

调度器代码位于 `scheduler/` 目录，采用 GitHub Actions 自动部署。

部署流程：

```text
Push 到 main 分支
    ↓
GitHub Actions 触发
    ↓
编译 + TypeScript 检查
    ↓
单元测试
    ↓
自动部署到 VPS（git pull + npm install + 重启服务）
```

### 8.5 调度器部署初始化

1. 配置 VPS SSH 密钥

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/hirelix_deploy
cat ~/.ssh/hirelix_deploy.pub | ssh us-2 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'
```

2. 添加 GitHub Secrets

| Secret Name | Value |
|-------------|-------|
| `VPS_HOST` | `65.49.232.163` |
| `VPS_USER` | `noah` |
| `VPS_PORT` | `22` |
| `VPS_SSH_KEY` | `~/.ssh/hirelix_deploy` 私钥内容 |

3. 验证部署

- Push 任意代码到 `main`
- 在 GitHub Actions 页面查看部署状态

### 8.6 手动回滚

```bash
ssh us-2 'cd /opt/hirelix && sudo git reset --hard <commit-hash> && sudo systemctl restart hirelix-scheduler'
```

生产环境变量位置：
- `/etc/hirelix.env`

说明：
- 该文件由 systemd `EnvironmentFile` 加载
- 包含生产环境变量

### 8.7 服务管理

当前阶段说明：
- 生产调度器运行在 `us-2`，systemd 服务名为 `hirelix-scheduler`
- 本地验证搜索任务时，使用 localhost API runner 或 `npm run scheduler:dev`
- 如需临时停用线上调度，执行 `sudo systemctl disable --now hirelix-scheduler`

```bash
# 查看状态
ssh us-2 'sudo systemctl status hirelix-scheduler --no-pager'

# 停用并禁止开机自启
ssh us-2 'sudo systemctl disable --now hirelix-scheduler'

# 重启服务
ssh us-2 'sudo systemctl restart hirelix-scheduler'

# 查看日志
ssh us-2 'sudo journalctl -u hirelix-scheduler -f'
```

### 8.8 us-2 个人 VPS 代理面板

`us-2` 上运行了 v2rayA + xray，主要供个人服务通过代理出口使用。

| 项目 | 值 |
|------|----|
| Host alias | `us-2` |
| IP | `65.49.232.163` |
| SSH User | `noah` |
| v2rayA 远端端口 | `127.0.0.1:2017` |
| 本地访问地址 | `http://127.0.0.1:2017/` |
| 用户名 | `noah` |
| 密码 | `527SBSHidzbextyScv2PaS6k` |

本地 `~/.ssh/config` 已配置：

```sshconfig
Host us-2
    HostName 65.49.232.163
    User noah
    IdentityFile ~/.ssh/id_ed25519
    LocalForward 2017 127.0.0.1:2017
```

使用方式：

```bash
ssh us-2
```

保持 SSH 会话打开，然后访问 `http://127.0.0.1:2017/`。

安全说明：
- v2rayA 管理端口不要在 UFW 中放行公网访问
- 当前 UFW 只放行 `22/tcp` 和 `5432/tcp`
- 如果忘记 v2rayA 密码，先备份 `/etc/v2raya/bolt.db` 和 `/etc/v2raya/boltv4.db`，再执行：

```bash
sudo systemctl stop v2raya
sudo v2raya --reset-password
sudo systemctl start v2raya
```

最近一次重置：
- 时间：`2026-05-06 17:28 Asia/Shanghai`
- 备份：`/etc/v2raya/bolt.db.bak-20260506092851`、`/etc/v2raya/boltv4.db.bak-20260506092851`

## 9. 扩展参考

补充规范见：
- `docs/conventions.md`

建议放入 `docs/conventions.md` 的内容：
- 编码风格
- 文件大小限制
- 组件组织规范
- 测试文件命名规范
- 脚本目录约定
