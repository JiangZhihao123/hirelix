# 本地网页与 Agent worker 配置一致性修复

日期：2026-10-19。范围：本地启动器、Chrome、独立 worker、真实 DeepSeek 与本机隔离 PostgreSQL。

## 问题与修改

网页启动时继承了显式选定的验收库配置，worker 的 `scripts/dev/worker.mjs` 却使用 dotenv `override: true` 再读主目录配置，覆盖了数据库连接。网页任务留在 `hirelix_workspace_qa_release_20261019` 排队，worker 消费的是另一隔离库。

`scripts/dev/start.mjs` 现在复用 Next.js 自带的 `@next/env` 加载器，保留进程显式传入的配置，支持 Next 的文件优先级与变量展开；同一份解析结果同时传给网页和 worker。删除重复读配置的 worker 包装器，由 tsx 直接监视 `scheduler/index.ts`。

监视 `.env.development.local`、`.env.local`、`.env.development`、`.env`；配置变化后等待两个旧进程退出，再重新解析并启动两者，避免网页旧连接池与 worker 新配置并存。显式传入的配置在重启后继续优先；直接运行 `npm run dev` 仍按当前目录配置选择数据库。

## 验证

- 启动器回归：`npx tsx --test tests/dev-start.test.ts`，2 项通过。使用替代子进程验证生命周期与环境传播，覆盖显式数据库优先、Next 文件优先级、变量展开、修改/删除配置、旧变量清除及双进程重启。这部分不代表真实业务执行。
- `npx tsc --noEmit`、`npx eslint --no-ignore scripts/dev/start.mjs tests/dev-start.test.ts`、`node --check scripts/dev/start.mjs` 通过。
- `npm run test:unit`：480 项，471 通过、9 项跳过、0 失败；跳过的集成测试不计入真实链路证据。
- 停止旧启动器和临时补启的 worker，使用修复后的启动器运行 localhost:3000，继续显式选择原验收库；没有覆盖主目录环境文件内容。
- 仅更新 `.env.local` 修改时间触发真实重启：网页/worker 子进程由 77346/77345 更换为 77628/77627；日志记录两个进程重新就绪，没有依赖临时 worker。
- 重启后通过 Chrome 提交只读任务，对话 `9a20754f-ac93-4dd0-aa9e-2fb023128391`；任务 `f2202bf3-8723-4cbe-9cd4-46189842b609` 在原验收库完成，`done`、1 次尝试、无错误。真实 Agent 调用 `find_candidates` 和 `read_candidate`，读回 Nick Mehta 的原始链接与已关联职位；回复保存到数据库并在刷新后显示。
- 证据位于本机 `/Users/noah/projects/hirelix-local-archive/2026-10-19/`：`unified-dev.log`、`verification/dev-environment-fixed-readback.json`、`verification/dev-environment-fixed.png`。

当前仍是本地验证，没有推送或部署生产。LinkedIn 链接读取能力不在本次修复范围。
