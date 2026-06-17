# Repository Guidelines

## Project Structure & Module Organization

Hirelix is a Next.js 16 / React 19 recruiting platform. Main code lives in `src/`: routes in `src/app`, UI in `src/components`, database helpers in `src/db`, and business logic in `src/lib`. The search pipeline centers on `src/lib/search-jobs.ts`, Bright Data on `src/lib/brightdata.ts`, LLM routing on `src/lib/llm-client.ts`, and candidate research under `src/lib/public-evidence/`. The VPS scheduler entrypoint is `scheduler/index.ts`. Unit tests are in `tests/*.test.ts`; Playwright specs are in `e2e/*.spec.ts`. SQL migrations live in `supabase/migrations/`, and docs live in `docs/`.

## Build, Test, and Development Commands

- `npm run dev`: start the local Next.js app at `http://localhost:3000`.
- `npm run scheduler:dev`: run the local search scheduler with `.env.local`.
- `npm run build`: create a production build.
- `npm run lint`: run ESLint.
- `npx tsc --noEmit`: run TypeScript checking; CI expects this to pass.
- `npm run test:unit`: run Node/tsx unit tests in `tests/`.
- `npm run test:e2e`: run Playwright end-to-end tests.

Use targeted tests while iterating, for example `npx tsx --test tests/search-task.test.ts`.

## Coding Style & Naming Conventions

Use TypeScript, React Server Components where appropriate, and existing patterns before adding abstractions. Keep modules focused and prefer explicit names such as `search-task.ts`, `public-evidence-jobs.ts`, or `billing-server.ts`. Follow ESLint/Next.js defaults; use two-space indentation in TS/TSX/JSON. For server logs, use `getLogger({ component: "..." })` from `src/lib/logger.ts` instead of new raw `console.*` calls.

## Testing Guidelines

Mock tests are fine for local state, payloads, and error branches, but they do not prove the real search journey works. For core search, billing, auth, Bright Data, LLM, Postgres, or scheduler behavior, prefer real services or state what was not verified. Bright Data calls can cost money; do not trigger paid recall without explicit authorization. For page debugging, use Playwright MCP progressively: inspect page, console, network, and DOM before acting.

## Commit & Pull Request Guidelines

Commit after each substantial fix or feature. Recent history uses concise Chinese messages, for example `备份现有代理说明` or `修正候选人交付和按需深调口径`. Do not mix unrelated changes. PRs should include the problem, change, verification commands/results, linked issues when available, and screenshots for visible UI changes.

## Security & Configuration Tips

Do not commit secrets. Keep local values in `.env.local`; mirror required keys from `.env.example`. Production uses Vercel for Next.js, `us-2` for the scheduler, and PostgreSQL on `us-2`; migrations are applied manually from `supabase/migrations/`. Local mainland China development may need `PROXY_URL=http://127.0.0.1:7890`, but do not carry that into production config.
