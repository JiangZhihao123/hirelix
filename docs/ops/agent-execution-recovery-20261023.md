# Agent 执行连续性修复与验证

2026-10-23，本地隔离库 `hirelix_workspace_qa_local_20261022`；未推送、未部署。本轮修复租约边界与正常停止，不引入观察持久化、checkpoint 或固定业务流程。

## 根因复核与修改归属

旧分析关于“父任务仅在 progress 时续租”的结论撤回：`jobs.ts/processJob()` 原本已有每 30 秒独立 heartbeat，覆盖整个 handler。生产样本中的服务重启与恢复重读成立，不能据此归因于缺少父 heartbeat。另旧文稿预算样本两次失败的 provider 时间为 **63,948 ms**；92,809 ms 包含成功重试，不能全计为浪费。

真实 PostgreSQL 修前复现了两项缺陷：父任务过期后换新 lease，旧 child 的 `finishJob().apply` 仍可执行；父 queued 时 child 也可被独立 worker 领取。修复位于现有 `jobs.ts`：领取 child 时锁定当前运行的 parent，捕获其 lease token；续租与提交同时检查该 token。锁顺序为 parent→child→billing；父 chat 路径仍为 conversation→job→billing，不反向取得 conversation。重试清除旧绑定，重新领取后绑定新 lease，无新增表或恢复实体。

独立 worker 与 inline child 复用 `withJobLease()`，保留原 30 秒续租并把失败传播为 AbortSignal。原 inline heartbeat 吞错、外层只设布尔值的行为移除。`agent-runtime.ts` 接收 worker signal；provider、子工具及最终 apply 仍受中止/租约检查约束，不让旧执行对新 attempt 提交结果。

`worker.ts` 与 `search-job-scheduler.ts` 增加 stop：停止领取及维护轮询，等在途处理结束，期间保持续租。`scheduler/index.ts` 接收 TERM/INT，排空后 flush usage、关闭连接再退出。15 分钟 Agent runtime 之外留持久化余量，18 分钟排空上限到达时记错误并退出 1，交由原有 lease reclaim 恢复。仓库 systemd drop-in 设置 20 分钟停止预算，部署 SSH 命令预算为 30 分钟；本轮仅只读核对了生产原 unit 的 90 秒预算，未修改生产。

**首次切换边界：旧进程没有新 signal handler，第一次部署仍须先等在途任务完成；新 drain 保护之后的正常重启。** 强杀、崩溃、网络阻塞或超过排空上限仍可能丢失未持久化的只读观察，恢复时重读；不能承诺任意崩溃零重读。

## 真实 PG 契约

`tests/integration/workspace-parent-lease.test.ts` 修前前两项均失败，修后五项通过。其中父 `d535dbd2-d6c2-4cfe-8c55-3b9daf5494de` / child `1dadabee-e8d9-4512-bb57-f131ae9178e2` 静默运行 125 秒，同时每秒执行 reclaim；各 prepare/apply 一次、各 attempts=1、各 lease 多次更新，没有被重新排队。另验证旧 child 在父换 lease 后不能续租或 apply、新父可恢复同一 child；inline 与独立 handler 失去续租后收到 abort，未执行 apply。

这些长时故障是**真实 PG + 受控 handler 契约测试**，没有伪装成自然 LLM 场景。原 `workspace-agent-execution` 的五项和 `workspace-jobs` 的三项真实 PG 回归也通过，覆盖原子回执、重复写保护、取消、旧 lease、重试及恢复身份。

## 正常停止与重启的真实服务链

通过实际 `requestRevision()` 业务服务创建文稿重写 `37e7567d-9f53-4e6f-81d2-327d8b95c777`，由真实 scheduler 与官方 DeepSeek 执行。观察到 provider 请求后，于 **10:29:23.162 UTC** 向真实 tsx launcher 发 SIGTERM；scheduler 在 10:29:23.226 开始排空，在 **10:29:45.501** 完成并退出，launcher 和子进程均退出。

在途 revision 保存成功、attempts=1。停止后另排的 probe `9eade323-2834-4ca8-8c93-9fd794b4e840` 保持 queued/attempts=0；重新启动 scheduler 后，probe 一次完成，原 revision 仍 attempts=1。文稿 `b8543b7e-1ca5-4cd8-ac75-fb569c481dd9` 仅新增一次 v6；该 revision 只有一次成功 provider 调用，来源快照、7 条来源引用和 2 人选择与生成前完全相同。未观察到由正常停止导致的重生成或重复保存。

这项是**直接业务服务 + 真实 provider 的契约链**，独立验证 drain，不声称自然 Agent 必须选择 revision。自然场景另记录于[保存回执验证](agent-document-receipts-20261023.md)。本轮没有制造生产故障，没有运行 systemd 本身、18 分钟超时或 SIGKILL 的完整业务场景。

## 检查与证据

- TypeScript、全仓 ESLint、`git diff --check` 通过。
- 单元回归：513 项，495 通过、18 项需显式独立环境而跳过；这些跳过项不替代本轮另跑的真实 PG 契约。
- 本轮未重新运行 production build 或整站 E2E；UI、生产部署与所有强杀场景不以单测代替。
- 本地原始证据：`tmp/execution-receipts-20261023/` 下 `parent-lease-before.log`、`lease-regression.log`、`long-lease-and-receipt.log`、`drain-before.json`、`drain-after.json`、`restart-check.json`、`final-integrity.json`、`worker.log` 与 `chrome-final-history.png`。原失败记录保留，不提交源资料/请求体/本地配置。
