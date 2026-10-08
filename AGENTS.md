# Repository Guidelines

This file is the shared contributor and AI-agent guide for Hirelix. `CLAUDE.md` only references this file; keep durable rules here and put broader coding conventions in `docs/conventions.md`.

## Project Structure & Module Organization

Hirelix is a Next.js 16 / React 19 recruiting platform for passive candidate search, scoring, and recruiter outreach. Main code lives in `src/`: routes in `src/app`, UI in `src/components`, database helpers in `src/db`, and business logic in `src/lib`. Key modules:

| Path | Purpose |
| --- | --- |
| `src/lib/search-jobs.ts` | Main search pipeline: parse, recall, screen, score |
| `src/lib/brightdata.ts` | Bright Data LinkedIn dataset and snapshot access |
| `src/lib/llm-client.ts` | DeepSeek-first LLM routing; OpenRouter is fallback only |
| `src/lib/public-evidence/` | On-demand candidate research sources and evidence |
| `src/lib/search-job-scheduler.ts` / `scheduler/index.ts` | Scheduler loop and VPS entrypoint |
| `src/lib/auth.ts`, `src/app/api/auth/[...all]/route.ts` | better-auth Google OAuth |
| `src/lib/billing*.ts`, `src/lib/paddle.ts` | Billing and Paddle integration |

Unit tests are in `tests/*.test.ts`, Playwright specs in `e2e/*.spec.ts`, migrations in `supabase/migrations/`, and product/ops docs in `docs/`.

## Architecture & Product Facts

产品定位、核心场景与交互设计依据见 [猎头 Personal Agent 的核心场景与设计原则](docs/product/personal-agent-core-scenarios.md)。涉及产品功能规划、首页、对话、工作推进及资料/成果入口的设计与开发时，先阅读该文档；它描述目标体验，不代表能力已实现或通过验收。

配套的[技术架构与产品交互设计方案](docs/product/personal-agent-architecture-and-interaction.md)定义八个场景的目标交互、模块责任、工作状态、数据/API 契约与分阶段验收。该方案当前待评审，阅读它不构成对界面重构、数据库变更或部署的自动授权。

首版面向电脑端使用，发布验收以桌面浏览器体验为范围；手机和实体移动设备不属于首版放行条件。

项目当前尚未正式上线，没有已有用户。产品、订阅、额度和数据结构的调整无需考虑已有用户的兼容、权益衔接或迁移，不要为此增加兼容层或迁移流程。已有部署和测试账号不代表项目已上线或存在真实用户；仍须保留用户已有代码改动，不得据此擅自删除数据。

Hirelix 的主要交互是 AI Agent：用户交代目标和资料，Agent 理解、执行并交付结果；文件是任务上下文，候选人和职位是工作沉淀。不要把批量资料入口做成聊天外观的导入向导。明确授权的无歧义整理应直接完成，只有身份、事实冲突或影响当前任务的缺失信息才要求用户决定；分析请求不得擅自修改资料。

Agent 工作进度、结果和失败重试应留在对应对话中；从职位、候选人或文档页面发起的操作在原页面提供状态和恢复入口。不要重新引入面向用户的“后台任务”技术列表，也不要让用户离开当前工作去找执行结果。

Deployment is split across Vercel and `us-2`: Vercel hosts the Next.js app/API routes; `us-2` runs PostgreSQL 17 and the `hirelix-scheduler` systemd service from `/opt/hirelix`. Auth is better-auth with Google OAuth; sessions are stored in the same Postgres database. Production domain: `hirelix.online`.

独立的外部付费人才寻访已退出产品：已删除新建、结果列表、结果详情及旧结果分享页面和专属产品 API，不保留旧路由跳转或历史结果兼容。任务执行器禁止启动该链路；私人候选人库搜索、匹配和 Agent 工作继续正常运行。未上线产品无需为测试数据保留废弃功能。不要通过重开旧入口、环境变量或内部操作员身份绕过此产品边界。

Historical search flow:

```text
queued -> parsing -> searching -> screening -> deep_scoring -> done
                                                       -> error
```

Pipeline steps are tracked as `accepted -> brief_ready -> linkedin_scan -> reviewing_profiles -> shortlist_ready`. Initial delivery should include the scored candidate pool from the current recall; do not reintroduce old “max 25 shortlist” product copy. Candidate Research is triggered on demand after a user selects a candidate. GitHub is one research source, not part of initial candidate delivery.

Important tables: `hirelix_searches`, `hirelix_candidates`, `hirelix_search_jobs`, `hirelix_public_evidence_jobs`, `hirelix_public_evidence_items`, `hirelix_snapshot_profiles`, `hirelix_dataset_snapshots`, and legacy `hirelix_github_enrichment_jobs`.

## API Route Map

Product APIs live under `src/app/(product)/api/` and require authentication. Key entrypoints include `workspace/*`, `candidates/[id]`, `candidates/[id]/enrich`, `settings/ai-company`, and `billing/*`. The retired external sourcing product APIs under `search/*` and `searches/*` have been removed.

Internal APIs live under `src/app/api/` and are triggered by services or webhooks: `internal/search-jobs/run` for search execution, `internal/public-evidence-jobs/run` for on-demand candidate research, and `paddle/webhook` for billing events. Auth routes are mounted at `src/app/api/auth/[...all]/route.ts`.

## AI Model Strategy

Default search and scoring use the official DeepSeek API. OpenRouter is optional fallback only, not the primary path. Stage-specific model variables are `SEARCH_LIGHT_MODEL` for screening, `SEARCH_JUDGE_MODEL` for deep scoring, and `SEARCH_ARBITER_MODEL` for arbitration. Thinking/reasoning controls are also stage-specific; avoid flattening them into one global behavior unless the product requirement explicitly changes.

## Build, Test, and Development Commands

- `npm run dev`: start Next.js at `http://localhost:3000`.
- `npm run scheduler:dev`: run the local scheduler with `.env.local`.
- `npm run build`: production build.
- `npm run lint`: ESLint.
- `npx tsc --noEmit`: TypeScript check; CI expects this to pass.
- `npm run test:unit`: run Node/tsx unit tests in `tests/`.
- `npm run test:e2e`: run Playwright tests headlessly.
- `npm run test:e2e:ui`: run Playwright UI mode.

Targeted examples:

```bash
npx tsx --test tests/search-task.test.ts
npx tsx scripts/debug/check-failed-search.ts
npx tsx scripts/debug/check-snapshot.ts
```

## Coding Style & Naming Conventions

Use TypeScript, React Server Components where appropriate, and existing patterns before adding abstractions. Keep modules focused and use explicit names such as `search-task.ts`, `public-evidence-jobs.ts`, or `billing-server.ts`. Follow ESLint/Next.js defaults and two-space indentation in TS/TSX/JSON.

For server logs, use `getLogger({ component: "..." })` from `src/lib/logger.ts`; do not spread new raw `console.*` calls. Log by stable identifiers such as `component`, `search_id`, `job_id`, `candidate_id`, and `workerIndex`. Never log tokens, passwords, authorization headers, or large sensitive objects.

For natural-language cleaning, classification, extraction, scoring, or repair, prefer LLM logic over regex. Regex is acceptable for strict formats such as dates, URLs, and email validation.

## Candidate Quality Principle

Hirelix’s core product quality must come from JD-aware LLM judgment, not special-case keyword patches. Do not improve candidate quality by adding hard-coded exclusions for particular titles, stacks, schools, companies, profile phrases, or one-off observed failures. Use deterministic code only for structural concerns such as budget accounting, deduplication, cache identity, snapshot status, location eligibility primitives, and safe Bright Data filter construction.

When a candidate should be advanced, held, or rejected, encode the reasoning in prompts, schemas, scoring rubrics, and eval fixtures. The judge must compare the profile against the JD, parsed search intent, role function, seniority, and core must-have evidence. Target-company membership, employer prestige, exact-looking titles, or loose keyword overlap are not enough to advance a candidate without concrete profile evidence. Adjacent profiles can pass when the evidence shows equivalent work.

Candidate quality labels are always scoped to a specific `(JD, candidate profile)` pair. Never create or reuse a global “good candidate” / “bad candidate” label independent of the JD. The same person can be `advance` for one role and `reject` for another.

## Testing Guidelines

Mock tests are useful for local state, payloads, and error branches, but they do not prove the real search journey works. For core search, billing, auth, Bright Data, LLM, Postgres, or scheduler behavior, prefer real services or clearly state what was not verified. Report results as `mock regression`, `local real chain`, or `production/staging chain`.

Bright Data real recall costs money. Current Bright Filter API pricing is USD 2.50 per 1,000 records. Do not create snapshots, expand recall, or rerun real searches without explicit authorization. For retrospective analysis, start read-only from `hirelix_searches`, `hirelix_candidates`, `hirelix_snapshot_profiles`, `hirelix_dataset_snapshots`, and scheduler logs. Treat Bright snapshot `cost <= 0` as unknown, not real zero cost.

For page debugging, use Playwright MCP progressively: inspect page state, console, network, and DOM before deciding the next action. Stable regression flows can later move to Playwright CLI or `@playwright/test`.

## Troubleshooting Priorities

| Problem area | Start with |
| --- | --- |
| Search execution | `hirelix_search_jobs`, `hirelix_searches`, `src/lib/search-jobs.ts` |
| Candidate Research | `hirelix_public_evidence_jobs`, `hirelix_public_evidence_items`, `src/lib/public-evidence/` |
| Scheduler health | `scheduler/index.ts`, `src/lib/search-job-scheduler.ts`, `journalctl -u hirelix-scheduler` |
| Bright Data retrospective | `hirelix_snapshot_profiles`, `hirelix_dataset_snapshots`, final rows in `hirelix_candidates` |
| Auth/session | `src/lib/auth.ts`, `/api/auth/*`, better-auth tables in Postgres |

## Local Development & Configuration

Local login uses Google OAuth only; use `noahjiang2@gmail.com` through the browser flow. Mainland China local development may need `PROXY_URL=http://127.0.0.1:7890` and `PROXY_ENABLED=true` for Google OAuth and external services. Do not carry this proxy assumption into production.

Keep secrets out of Git. Store local values in `.env.local`; mirror required keys from `.env.example`. Runtime config groups include database, auth, AI models, Bright Data, GitHub/Serper/Hunter, search tuning, Paddle, Resend, and proxy. `GITHUB_TOKEN` and `SERPER_API_KEY` are for on-demand candidate research, not initial candidate delivery.

SQL migrations live under `supabase/migrations/` despite the historical directory name; production uses self-hosted Postgres on `us-2`, not Supabase. Migration files should use `YYYYMMDD_description.sql` and are applied manually, for example:

```bash
ssh us-2 'sudo -u postgres psql -d hirelix -f /tmp/xxx.sql'
```

## Production Operations

Primary checks:

```bash
git fetch --prune origin
git status --short --branch
git log --oneline --decorate --left-right --graph origin/main...HEAD
ssh us-2 'cd /opt/hirelix && sudo git status --short --branch && sudo git rev-parse --short HEAD'
ssh us-2 'sudo systemctl status hirelix-scheduler --no-pager'
ssh us-2 'sudo systemctl is-active postgresql && sudo -u postgres psql -tAc "SELECT version();"'
```

Scheduler logs:

```bash
ssh us-2 'sudo journalctl -u hirelix-scheduler -f'
ssh us-2 'sudo tail -f /var/log/hirelix/scheduler.log'
ssh us-2 'sudo jq '"'"'select(.search_id == "SEARCH_ID")'"'"' /var/log/hirelix/scheduler.log'
```

Production scheduler environment variables are loaded from `/etc/hirelix.env`. File logging is opt-in with `LOG_FILE_ENABLED=true` and `LOG_FILE_PATH=/var/log/hirelix/scheduler.log`; daily rotation is documented in `docs/ops/logging.md` and configured by `deploy/logrotate/hirelix-scheduler`. The scheduler is deployed by GitHub Actions after pushes to `main`: build, type check, unit tests, then pull/install/restart on `us-2`. If disabling the production scheduler is explicitly requested, use `sudo systemctl disable --now hirelix-scheduler` and verify ownership before stopping services on shared hosts.

## Commit & Pull Request Guidelines

Commit after each substantial fix or feature. Recent history uses concise Chinese messages, for example `备份现有代理说明` or `修正候选人交付和按需深调口径`. Do not mix unrelated changes, and do not revert user changes unless explicitly asked.

PRs should include the problem, change summary, verification commands/results, linked issues when available, and screenshots for visible UI changes. If real-chain validation was skipped because of cost, environment, or rate limits, say so directly.

## Reference

The previous long-form guide is preserved as `AGENTS.backup.md` for historical detail. When adding new rules, merge them into the relevant section above instead of appending loose notes at the end.
