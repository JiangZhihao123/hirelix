# 本地 Google 登录与 Agent 链路验收

2026-10-17，local real chain。Chrome、localhost:3000、独立本地数据库 hirelix_workspace_qa_queue_20261015，使用 npm run dev 启动的 Next.js 与正式 workspace worker。

## 登录卡顿排查

Google 账号选择后页面停留在“正在加载”，当时 Next.js 只收到 sign-in/social，尚未收到回调。Chrome 显示 ChatGPT 调试连接。取消该调试连接，改用原生 Chrome UI 操作并刷新后，正常回到本地工作台；本地 session 表确认新会话建立。此次未修改 OAuth 参数、权限或应用认证代码。证据表明卡顿发生在 Google 页面/浏览器阶段，调试连接干扰是可能原因，尚不能断定唯一根因。

## 完整验收

- Google 现有账号选择 → 本地工作台成功。
- 浏览器新建对话，发送真实问题：收到 JD 后猎头应首先澄清什么。
- 页面先显示 Thinking，随后显示真实 Agent 回复，说明应确认 must-haves、nice-to-haves、成功标准与招聘时间。
- 对话：3d6b3d6a-2f46-42a0-8dca-b1b88178e903。
- 任务：118e9fe8-3e64-419c-977a-e4956667240d，done，attempts=1，无错误。
- 刷新页面后保持登录，用户消息与 Agent 回复均保留。
- 本机截图：tmp/local-login-agent-20261017.png（不提交临时截图）。

未发送邮件、变更业务资料或部署生产。此记录覆盖登录和聊天主链路，不代表所有外部集成均已验收。
