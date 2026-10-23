# 独立读取并行与并发计费验证

日期：2026-10-23（Asia/Shanghai）。范围：本地真实服务链、隔离 PostgreSQL、工具调度与计费合同；未部署生产，未做浏览器验收。

## 修改

原先 `createAgentTools()` 把所有工具放入一个 Promise 串行队列。现在经明确检查的只读工具共享有界并发池；修改、发送、追问和未知工具作为顺序屏障，等待之前的读取结束，之后的读取也不能越过它。原有用户隔离、授权、租约、AbortSignal 和追问检查继续执行。

`WORKSPACE_TOOL_READ_CONCURRENCY` 默认 6，可配置 1–32，限制单次 Agent 执行中的在途读取数。没有设置每轮搜索次数、固定查询列表或固定业务步骤，也没有修改模型的工具选择指令。

现有 `hirelix_agent_credit_usage` 增加 `call_reservations`，按请求 ID 记录在途额度。模型、搜索、网页读取、语义检索、视觉读取和结构化生成使用各自的预留凭据；结算仅消费自己的额度并释放差额，失败释放自己的预留，不会收回兄弟请求的额度。重复结算被拒绝，释放幂等；重试清理旧执行的预留，旧租约不能扣费或释放新执行的额度。数据库锁顺序统一为 job → 用户计费锁。

部署前须在目标数据库应用 `supabase/migrations/20261023_agent_call_reservations.sql`。本轮只应用到隔离库 `hirelix_workspace_qa_parallel_20261023`，没有修改生产数据库或推送代码。

## 本地真实链路

`scripts/qa/verify-parallel-tools.ts` 通过真实 `createAgentTools()`、DeepSeek Search/Fetch、PostgreSQL、额度服务和 job 完成逻辑执行。网络观察器只记录请求时间、路径和 HTTP 状态，原请求仍发送到真实服务，不记录密钥。

直接工具合同对照使用同样的 4 次搜索、2 次网页读取、2 次数据库列表读取；并发 1 复现原队列行为，并发 6 验证修复。该固定输入仅属于测试，不进入产品执行逻辑。

| 执行顺序 | 串行总耗时 | 并行总耗时 | 实际外部请求峰值 | 每组结算 |
| --- | ---: | ---: | --- | --- |
| 先串行、后并行 | 15,014 ms | 2,363 ms | 1 → 6 | 13,500 units，6 笔有效请求 |
| 先并行、后串行 | 8,161 ms | 7,199 ms | 1 → 6 | 13,500 units，6 笔有效请求 |

四组各 8 个工具全部成功，有真实来源返回；账本成本、消费额度与回执逐项求和一致，最终无在途预留。耗时是本次观测值，受缓存、网络和最慢请求影响，不代表固定加速倍数。

自然语言场景要求比较 OpenAI、Anthropic、DeepSeek 的公开产品和服务对象并提供来源，不保存或发送。未指定工具、调用数量、调用顺序或预设业务答案，执行真实 `assistantReply` / ToolLoopAgent、租约续期和最终消息持久化：

| 样本 | Job | 步数 / 工具数 | 在途峰值 | 工具排队 | 最终状态 |
| --- | --- | --- | ---: | --- | --- |
| 1 | `4bab6156-e890-4cc8-bee3-81c4cb3bebb7` | 5 / 11 | 3 | 0–1 ms | done，48,119 ms |
| 2 | `d1e6f007-756e-44fe-99ef-41b7bcc9e4cb` | 8 / 19 | 3 | 0–1 ms | done，64,748 ms |

模型自行发出同轮多个搜索和网页读取，工具请求真实重叠。样本 1 有 4 次 Fetch HTTP 404，7 笔有效网页请求结算；样本 2 有 6 次 Fetch HTTP 404，13 笔有效网页请求结算。错误如实返回模型并保留在工具记录中，Agent 继续寻找其他来源后交付。错误请求没有计费，两次最终账本均无残留预留。模型具体产品比较内容未做事实质量验收，模型结果与工程合同分别评价。

本地原始证据：

- `tmp/parallel-tools-20261023/real-chain.json`：第一组对照、自然场景、账本和请求时间。
- `tmp/parallel-tools-20261023/reverse/real-chain.json`：反转顺序复验及第二个自然场景。
- 同目录 `real-chain.log`、`reverse.log`：实际工具执行日志。

复验时先用环境加载器加载本地服务配置，再把 DATABASE_URL 显式指向已应用迁移的隔离库。禁止生产库或 15432 隧道；设置 `WORKSPACE_REAL_AI_TEST=true`、`WORKSPACE_QA_EVIDENCE_DIR` 后运行 `node --import tsx scripts/qa/verify-parallel-tools.ts`。`PARALLEL_QA_REVERSE_ORDER=true` 可反转对照顺序。脚本含真实付费模型/检索请求。

## 回归与边界

- `npm run test:unit`：498 通过、0 失败、19 跳过（默认未启用的集成测试）。
- 单独启用的相关检查共 20 项通过：调度、搜索契约、真实 PG 计费与周期、执行回执及租约、遥测、结构化生成预算。部分 provider 错误和格式重试使用 mock transport，不能视作外部服务验证；真实外部服务证据见上节。
- 新增并发计费合同最终复跑通过：乱序结算、兄弟请求保留、空搜索不扣费、非法响应释放、重复结算拒绝、并发余额竞争、余额不足不发请求、取消及旧租约保护。
- 修改文件 ESLint、`git diff --check` 通过；覆盖项目源码、测试和本次 QA 脚本的 TypeScript 检查通过。
- 原始 `npx tsc --noEmit` 被工作区未跟踪的旧 `tmp/execution-receipts-20261023/{drain-natural-monitor,restart-check,setup}.ts` 中 6 个类型错误阻塞；这些文件未改动。隔离类型检查配置和原始错误保存在本次证据目录，未修改项目 tsconfig 以隐藏错误。
- 未压测多用户全局吞吐，未宣称所有读取提供商和全部浏览器交互已重新验收。发布需应用迁移并进行生产验证。
