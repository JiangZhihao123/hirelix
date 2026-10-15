# 对话排队、立即处理、停止与继续：本地验收

日期：2026-10-15。范围：本地真实链路；不代表生产部署或 Gmail 发信验收。

## 产品行为

- 正常发送在同一对话中按顺序排队，当前工作继续。队列在输入框上方，可以编辑、移除或立即处理。
- 立即处理在一个事务中撤销当前执行租约、保留已提交回执并提高新消息优先级。其余排队消息保留。这里是中断后按最新要求接续，不是向正在生成的模型请求注入文本。
- 停止将对话标为 stopped，并撤销当前任务及其子工作的租约。已保存事实保留，后续消息不会自动开始；刷新仍保持停止状态。
- 继续恢复原任务，带上已完成工具回执与未完成输出；完成后再顺序处理队列。失败也会按住队列，重试后才能继续。
- 排队消息尚未进入 Agent 上下文，也不会提前消耗待回答问题。编辑或移除排队答案不会把问题提前标成已回答。
- 删除的队列项不会成为当前回复。对话查询只返回待执行任务和最近一个终态任务，不反复读取全部历史任务结果；正常流式回复复用 SSE，队列有变化时才增加轮询。

实现复用现有 private_jobs、租约和工具回执。仅为 conversations 新增 stopped 字段及队列索引，迁移为 `supabase/migrations/20261015_conversation_queue.sql`。

## Chrome + 实际模型 + PostgreSQL

使用 localhost:3000、独立本地库 `hirelix_workspace_qa_queue_20261015`、最新本地双执行器及正式 workspace job handlers。未替换模型或业务工具。模型用量记录确认实际使用官方 DeepSeek 的 deepseek-flash。Google 登录通过现有账号的正常 OAuth 重新登录完成。

验收对话：`c43d0a88-cf91-4e89-98e9-4e30f616ea59`。

1. Agent 创建虚构候选人 Rowan Queue October15，再生成面试准备稿。
2. 第二轮先将地点改为 London，再生成长回复；在保存后点击停止，并保留下一条排队消息。
3. 编辑队列中的查询要求；加入并移除另一条测试消息。刷新后仍停止，排队项 attempts=0；被移除消息从未执行。
4. 点击继续。Agent 核对已保存记录，没有重做地点更新；完成后排队查询返回 London、version 2。数据库候选人只有一条，版本仍为 2。
5. 运行中保留一个后续任务，再通过输入框 Send now 提交纠正。原长任务 cancelled；纠正任务在 10:49:12 UTC 完成，原队列任务在 10:49:15 UTC 完成，验证抢先执行且不丢队列。
6. 最新代码再次执行排队、停止、刷新、继续。截图保存在本地 `tmp/queue-final-stopped.png`，展示停止状态、继续入口和保留的队列。

验证使用虚构候选人、内部记录和文字回复，没有发送真实邮件。已经提交给外部服务的动作不能通过停止回滚；本次没有宣称验证了邮件在途撤销。

## 自动回归

另一个独立库 `hirelix_workspace_qa_queue_regression_20261015` 与浏览器工作进程隔离，避免测试任务被后台提前领取。

- 21 项 PostgreSQL 集成通过：并发领取、FIFO、连续提权、编辑/移除、所有权、停止通知、旧租约写入拦截、继续的回执去重、子任务恢复、失败/租约耗尽时保持队列、排队答案延迟生效及已有执行回归。
- 4 项真实模型/数据库集成通过：缺失信息追问与提醒续接、过期答案拒绝、普通聊天回答续接保存 JD、真实流式输出和停止后迟到写入拦截。流式用例观察到 4 个不同中间输出，最终回复 2840 字符。
- 单元测试：401 通过、4 跳过、0 失败。单元测试包含模拟回归，不作为真实链路证明。
- TypeScript、改动文件 ESLint、生产构建和 diff whitespace 检查通过。

主要测试文件：

- `tests/integration/workspace-conversation-queue.test.ts`
- `tests/integration/workspace-agent-execution.test.ts`
- `tests/integration/workspace-jobs.test.ts`
- `tests/integration/workspace-failed-turn-recovery.test.ts`
- `tests/integration/workspace-conversation-status.test.ts`
- `tests/integration/workspace-conversation-questions.test.ts`
- `tests/integration/workspace-live-reply.test.ts`

运行真实模型测试需要设置 `WORKSPACE_REAL_AI_TEST=true`，加载真实模型配置；所有上述集成测试都限制 DATABASE_URL 为本机 `hirelix_workspace_qa_*` 数据库。

## 交付边界

数据库迁移只应用到上述本地 QA 库。没有推送 main、修改生产数据库或重启生产 scheduler。当前 localhost:3000 使用隔离测试库，测试资料与线上资料分开；部署时需要先应用队列迁移，并同时更新 Web 与独立 scheduler。
