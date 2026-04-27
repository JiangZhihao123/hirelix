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
- [8. 生产环境](#8-生产环境)
- [9. 扩展参考](#9-扩展参考)

## 1. 快速入口

### 1.1 修改代码前先知道

| 主题 | 规则 |
|------|------|
| 提交 | 完成一个主要任务后立即提交一次，不要混入无关改动 |
| Commit Message | 使用中文，清楚说明解决了什么问题或完成了什么改动 |
| 文本处理 | 核心文本理解、清洗、修复、分类、提取，优先用 LLM，不要用正则硬写 |
| 页面渐进式测试 | 优先使用 Playwright MCP，边观察边决策 |
| 本地代理 | 中国大陆本地开发通常需要 `http://127.0.0.1:7890` 访问 Supabase 和外部服务 |
| 登录方式 | 测试账号使用邮箱 + 密码，不使用 Google OAuth |

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
| Next.js 前端 + API | Vercel | 无状态，承载页面与 API |
| 搜索任务调度器 | VPS | 独立进程，负责长耗时任务 |
| 数据库 / Auth | Supabase | PostgreSQL + Auth + 队列表 |

### 4.2 搜索流水线

1. JD 解析：`src/lib/jd-parse.ts`
2. Bright Data 召回：`src/lib/brightdata.ts`（LinkedIn 数据集筛选 + 抓取）
3. AI 预筛 + 深度评分：`src/lib/search-jobs.ts`
4. GitHub 富化：`src/lib/github-signals.ts`（身份发现兜底使用 Serper，见 `src/lib/github/discovery.ts`）

### 4.3 核心文件

| 文件 | 作用 |
|------|------|
| `src/lib/search-jobs.ts` | 搜索引擎主流程，最核心文件 |
| `src/lib/prompts.ts` | AI Prompt 模板 |
| `src/lib/openrouter.ts` | OpenRouter / DeepSeek 模型路由配置 |
| `src/lib/openrouter-schemas.ts` | AI 响应的 Zod Schema |
| `src/lib/search-execution.ts` | 搜索执行档位配置 |
| `src/lib/search-task.ts` | 搜索状态机状态定义与任务副本 |
| `src/lib/search-state.ts` | 搜索状态工具函数(过期/状态分类) |
| `src/lib/search-job-scheduler.ts` | 调度器核心循环(轮询/分发/心跳) |
| `src/lib/search-notifications.ts` | 搜索完成通知(Resend 邮件) |
| `src/lib/recruiter-outreach.ts` | 外联文案生成 |
| `src/lib/brightdata.ts` | Bright Data 数据集/抓取接口 |
| `src/lib/github-signals.ts` | GitHub 档案富化 |
| `src/lib/github/discovery.ts` | GitHub 身份发现（含 Serper 兜底） |
| `src/lib/github-enrichment-jobs.ts` | GitHub 富化任务队列管理 |
| `src/lib/jd-parse.ts` | JD 文本解析(提取技能/职位/公司) |
| `src/lib/company-research.ts` | 目标公司研究 |
| `src/lib/display-name.ts` | 候选人显示名清理 |
| `src/lib/server-outbound-proxy.ts` | 全局代理初始化 |
| `src/lib/supabase.ts` / `supabase-server.ts` | Supabase 客户端(浏览器/服务端) |
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
| `hirelix_github_enrichment_jobs` | GitHub 富化任务队列表 |

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
| `candidates/[id]/enrich` | 手动 GitHub 富化 |
| `settings/ai-company` | AI 公司描述 |
| `billing/*` | 计费相关 |
| `admin/users` | 用户管理 |
| `admin/route` | 管理面板数据 |

### 4.7 内部 API 路由 (调度器触发)

位于 `src/app/api/`：

| 路由 | 说明 |
|------|------|
| `internal/search-jobs/run` | 调度器触发搜索执行 |
| `paddle/webhook` | Paddle 支付 webhook |

### 4.8 搜索状态机

```
queued → parsing → searching → screening → deep_scoring → done
                                                         → degraded (部分成功)
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
| `degraded` | 部分完成（如部分候选人深度评分失败但仍有可用结果） |
| `error` | 搜索失败 |

调度器通过 `pipeline_step` 追踪当前阶段（`accepted` → `brief_ready` → `linkedin_scan` → `reviewing_profiles` → `shortlist_ready`）。

### 4.9 AI 模型策略

- 默认使用 DeepSeek 处理大多数低成本场景
- 复杂仲裁使用 Claude Sonnet
- 统一通过 OpenRouter 路由
- 三阶段模型可独立配置：`SEARCH_LIGHT_MODEL`（预筛）、`SEARCH_JUDGE_MODEL`（深度评分）、`SEARCH_ARBITER_MODEL`（仲裁/争议裁决）
- 配置文件：`src/lib/openrouter.ts`

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
| 本地 dev / Supabase | `jzh_spring@163.com` | `88888888` |

注意：
- 登录方式使用邮箱 + 密码
- 不要改用 Google OAuth

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
| 中国大陆本地开发 | 通过本地代理 `http://127.0.0.1:7890` 访问 Supabase 和外部服务 |
| 生产环境 | 不需要代理 |

注意：
- 不要把”本地需要代理”的假设带到生产配置中

### 6.4 环境变量分组

核心变量见 `.env.example`，主要分组：

| 分组 | 关键变量 |
|------|----------|
| 数据库 | `DATABASE_URL` |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| AI 模型 | `AI_PROVIDER`, `AI_MODEL`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY` |
| 搜索模型档位 | `SEARCH_LIGHT_MODEL`, `SEARCH_JUDGE_MODEL`, `SEARCH_ARBITER_MODEL` |
| 数据源 | `BRIGHTDATA_API_TOKEN`, `GITHUB_TOKEN`, `HUNTER_API_KEY`, `SERPER_API_KEY`（仅用于 GitHub 身份发现兜底，可选） |
| 搜索调优 | `SEARCH_BRIGHTDATA_STANDARD_LIMIT`, `SEARCH_DEEP_SCORING_CONCURRENCY`, `SEARCH_JUDGE_SCORING_TIMEOUT_MS` |
| Paddle 计费 | `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET` |
| 通知 | `RESEND_API_KEY`, `SEARCH_NOTIFICATIONS_ENABLED` |
| 代理（仅本地） | `PROXY_ENABLED`, `PROXY_URL` |

### 6.5 数据库迁移

SQL 迁移文件位于 `supabase/migrations/`，命名格式为 `YYYYMMDD_description.sql`。

- `supabase/full_migration.sql` / `supabase/schema.sql`：基础 schema
- `supabase/migrations/`：增量迁移，按日期前缀命名
- 迁移通过 Supabase SQL Editor 手动执行，无自动迁移工具

## 7. 测试与调试

### 7.1 页面问题排查顺序

1. 先打开页面观察真实状态
2. 再查看 console / network
3. 根据 DOM 和报错决定下一步点击、输入、等待或截图
4. 稳定后再决定是否补自动化测试

### 7.2 调度器相关定位

优先检查：
- `scheduler/index.ts`
- 搜索队列表 `hirelix_search_jobs`
- GitHub 富化队列表 `hirelix_github_enrichment_jobs`
- VPS 上的 `hirelix-scheduler` systemd 服务状态与日志

## 8. 生产环境

### 8.1 VPS 信息

与 sibling 项目 `neliva` 共用同一台 Vultr VPS。

| 配置项 | 值 |
|--------|-----|
| Host | `66.42.53.127` |
| SSH User | `root` |
| SSH Port | `2222` |
| Hostname | `vultr` |
| 部署目录 | `/opt/hirelix` |

### 8.2 SSH 连接命令

```bash
# 直连（需本地代理）
ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -p 2222 root@66.42.53.127

# 快速连通性检查
ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -o BatchMode=yes -o ConnectTimeout=10 -p 2222 root@66.42.53.127 'echo VPS_OK && hostname'
```

### 8.3 部署架构

| 组件 | 部署位置 | 说明 |
|------|----------|------|
| Next.js 前端 + API | Vercel | 不含调度器 |
| 搜索任务调度器 | VPS | 独立进程，systemd 服务名为 `hirelix-scheduler` |

生产域名：
- `hirelix.online`

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
cat ~/.ssh/hirelix_deploy.pub | ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -p 2222 root@66.42.53.127 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys'
```

2. 添加 GitHub Secrets

| Secret Name | Value |
|-------------|-------|
| `VPS_HOST` | `66.42.53.127` |
| `VPS_USER` | `root` |
| `VPS_PORT` | `2222` |
| `VPS_SSH_KEY` | `~/.ssh/hirelix_deploy` 私钥内容 |

3. 验证部署

- Push 任意代码到 `main`
- 在 GitHub Actions 页面查看部署状态

### 8.6 手动回滚

```bash
ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -p 2222 root@66.42.53.127 'cd /opt/hirelix && git reset --hard <commit-hash> && systemctl restart hirelix-scheduler'
```

生产环境变量位置：
- `/etc/hirelix.env`

说明：
- 该文件由 systemd `EnvironmentFile` 加载
- 包含生产环境变量

### 8.7 服务管理

```bash
# 查看状态
ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -p 2222 root@66.42.53.127 'systemctl status hirelix-scheduler --no-pager'

# 重启服务
ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -p 2222 root@66.42.53.127 'systemctl restart hirelix-scheduler'

# 查看日志
ssh -o "ProxyCommand=nc -x 127.0.0.1:7890 %h %p" -p 2222 root@66.42.53.127 'journalctl -u hirelix-scheduler -f'
```

## 9. 扩展参考

补充规范见：
- `docs/conventions.md`

建议放入 `docs/conventions.md` 的内容：
- 编码风格
- 文件大小限制
- 组件组织规范
- 测试文件命名规范
- 脚本目录约定
