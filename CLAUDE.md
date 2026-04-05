# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev              # 启动 Next.js（默认 http://localhost:3000）
npm run scheduler:dev    # 启动本地调度器（另起终端）
npm run build            # 生产构建
npm run lint             # ESLint 检查
npm run test:unit        # 单元测试（Node.js native test runner）
npm run test:e2e         # Playwright E2E 测试（headless）
npm run test:e2e:ui      # Playwright UI 模式
```

运行单个测试文件：
```bash
npx tsx --test tests/github-signals.test.ts
```

## Architecture Overview

Hirelix 是一个 AI 驱动的被动候选人搜索平台：输入职位描述，自动在 LinkedIn/GitHub 中找到匹配候选人并生成外联文案。

**部署分层**：
- **Vercel**：Next.js 前端 + API Routes（无状态，30s 超时限制）
- **VPS（Vultr）**：独立调度器进程，处理耗时 3-5 分钟的搜索任务
- **Supabase**：PostgreSQL + Auth，队列表用于解耦两层

**搜索流水线**（在 VPS 调度器中运行）：
1. JD 解析（`src/lib/jd-parse.ts`）→ 提取技能、职位、目标公司、召回策略
2. Serper Google 搜索（`src/lib/serper.ts`）→ 24 并发，找 LinkedIn 档案 URL
3. Bright Data 爬取（`src/lib/brightdata.ts`）→ 批量拉取 LinkedIn 档案，30个/批、4批并发
4. AI 深度评分（`src/lib/search-jobs.ts`）→ 多维评分（匹配度/能力/加入意愿）
5. GitHub 富化（`src/lib/github-signals.ts`）→ 异步排队，独立 worker 处理

**核心文件**：
- `src/lib/search-jobs.ts` — 搜索引擎主流程（最大、最核心的文件）
- `src/lib/prompts.ts` — 所有 AI prompt 模板
- `src/lib/openrouter-schemas.ts` — AI 响应的 Zod schema
- `src/lib/search-execution.ts` — 搜索执行档位配置（`bright_fast_free` / `bright_full_pro`）
- `scheduler/index.ts` — VPS 调度器入口，启动搜索和 GitHub 富化两个 scheduler

**数据库关键表**：
- `hirelix_searches` — 搜索任务主表（含状态机：pending → parsing → searching → deep_scoring → done/degraded/failed）
- `hirelix_candidates` — 候选人结果表
- `hirelix_search_jobs` — 搜索任务队列（调度器轮询此表）
- `hirelix_github_enrichment_jobs` — GitHub 富化队列

**AI 模型策略**：默认用 DeepSeek（便宜快），复杂仲裁用 Claude Sonnet。通过 OpenRouter 路由，配置见 `src/lib/openrouter.ts`。

**计费**：Paddle 集成，三档（Free/Pro Monthly/Pro Annual），配额检查在 `src/lib/billing.ts`。

**页面路由分组**：
- `(landing)` — 营销落地页
- `(marketing)` — 隐私/条款等
- `(product)/app` — 产品页面（需认证），含仪表板、新搜索、结果展示
