# 普通登录接回工作，同时优先保留未发送草稿

## 主流程断点

Chrome 走首页 Sign in 时，已登录老用户打开空白对话；直接进入 `/app` 才会恢复最近对话。原实现用 params.size===0 判断恢复资格，登录携带的归因参数和 entry=signin 将普通登录排除在外。恢复逻辑也只检查文字，没有检查仅有附件的新工作。

## 调整

普通空入口与明确 entry=signin 可以恢复最近工作；显式 conversation/new/role/person/document/prompt 或 free_trial 保持原目的地。恢复前使用既有浏览器草稿存储检查文字、选中引用及当前用户附件，未发送工作优先。附件无法核对时保留输入界面，不以未知状态推断无草稿。

异步检查期间离开该入口则不跳转；跳转保留原归因参数。复用现有对话、认证、IndexedDB 和草稿机制，没有新增持久实体、服务或自动任务。

## 本地 Chrome 验证

现有已登录 QA 账号，独立数据库 `hirelix_workspace_qa_local_20261022`，未退出登录或重走 OAuth。

- 无普通新工作草稿：从首页 Sign in 接回最近对话 `86baaa0c-cfe7-4718-96c5-38d60b6d53ae`，可读已保存评估回复；URL 保留 intent_path/page_variant/traffic_source/utm_campaign/entry，并新增 conversation。
- 从 New conversation 仅选入本轮虚构 Pinecrest 文件、保持文字为空，再经首页 Sign in：仍在新工作，原附件恢复，没有被带到旧对话。
- 移除本轮附件后输入标记的未发送 QA 文字，再经 Sign in：文字恢复，没有被覆盖。随后仅清空本轮文字，普通登录重新接回最近工作。
- 主试用 CTA 仍进入带首次委托的新工作，没有误接回旧对话；显式上下文的路由边界另有合同回归。

没有发送测试消息、触发模型、付款或新增业务对象。既有首试用委托草稿与其他会话保持，未改动 Owen 决策和已有提醒。截图 `tmp/signin-resumed-work.png`，文本状态 `tmp/signin-resumed-state.txt`，不提交 tmp。

## 检查与边界

新增路由回归区分空入口、带归因普通登录、试用、指定对话、新建、职位、人选、文档与委托。真实浏览器分别验证文字、附件和无草稿三条路径；没有用合同测试代替浏览器草稿恢复。

TypeScript、lint、git diff --check 通过。全量单测 507 项，492 通过、15 门控跳过、0 失败。未在浏览器人为破坏 IndexedDB，存储读取失败保守保留输入界面的分支为代码检查范围。未推送、部署或进行生产登录复验，不据此宣称留存或续费效果。
