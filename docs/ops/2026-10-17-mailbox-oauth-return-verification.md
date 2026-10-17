# 邮箱 OAuth 回跳实测（2026-10-17）

## 环境与范围

本地 localhost:3000、隔离数据库 `hirelix_workspace_qa_queue_20261015`、真实 Chrome、Google 现有账号。没有发送邮件，没有修改生产配置。

## 实际结果

1. 通过设置页断开本地 Gmail 发信连接，在已有虚构 QA 推荐文档的 Email 区填写测试草稿，再点击 Connect Gmail。
2. 本次 OAuth 请求只有 openid/profile/email 和 gmail.send，没有主动请求 gmail.readonly。Google 同意页仍显示应用未经验证及已有部分访问权限。没有绕过警告或授予新权限。
3. 在 Google 同意页点击取消，实际回到原文档。但 better-auth 将 `?error=access_denied` 追加到了 `#recommendation-delivery` 后面，造成错误提示不显示且锚点定位失效。
4. 邮件编辑区保持 Email 标签、Gmail 发件人、原收件人、主题 `OAuth 回跳草稿验收 — 不发送`、两行正文、包含链接和不附带 CV 的选择。截图位于 `tmp/oauth-e2e/cancel-draft.png`。
5. 再次连接时，Google 显示独立的“此应用未经 Google 验证”拦截页。点击“返回到安全网页”进入 Google 帮助页面，没有调用应用的取消回调。手动返回原文档后草稿仍保留。
6. 发送记录验收前后均为 5 条，没有新增发送记录。

## 修复

- 构造独立的失败返回 URL，移除 fragment，避免认证库追加的错误参数落入锚点；保留原业务 query。
- 失败返回带 mailbox_return 标识，加载结束后定位到连接提示；成功返回同样定位到真实连接状态。
- 重试清除旧错误及成功标记，不允许外部返回地址。
- 针对性单元测试 4/4 通过；TypeScript 和修改文件 ESLint 通过。

## 尚未完成

外部 Google 未验证警告需要用户接管。Gmail 本地发信连接目前断开，Microsoft 连接未改动，默认发件设置未改动。

成功授权、修复后的真实取消回跳、授权后前端自动继续准备邮件仍未完成完整浏览器验收。此前真实 worker/恢复请求测试不能替代这些结果。本轮不宣称完整链路通过；未推送部署。

## 用户接管授权后的续验结果

以下结果更新上面的未完成状态。本地真实浏览器链路已完成：

- **Google 成功回跳**：用户通过安全拦截后，在同一 Chrome 标签完成现有权限确认，实际返回推荐文档。页面显示已连接的 Gmail 地址并定位邮件区；收件人、主题、两行正文、包含链接、不附带 CV 的选择全部恢复。截图：`tmp/oauth-e2e/success-draft.png`。
- **Microsoft 取消回跳**：从推荐邮件区点击 Connect Outlook，实际进入 Microsoft 同意页并点击拒绝。回到同一文档，错误参数位于 query，连接未完成提示可见，页面定位邮件区，全部草稿字段及选项保留。截图：`tmp/oauth-e2e/cancel-fixed.png`。这是修复后的真实外部取消回调，不是手工构造 URL。
- **真实对话入口缺陷及修复**：初次请求仅调用 mailbox_status，按旧工具描述给出设置页链接，无法自动续准备。更新 mailbox_status/email 工具指引：邮件准备请求直接调用现有 email prepare；断开状态由该服务返回内联连接卡片和可恢复上下文。未增加场景判断、业务工作流或新实体。
- **Microsoft 对话成功回跳与自动续准备**：用新的自然语言请求重验，真实 Agent 产生对话内连接卡片；实际点击连接、登录原有 Outlook 账号、确认现有权限后回到原对话。前端自动提交恢复请求，真实独立 worker 生成邮件预览，用户无需重复发消息。连接请求未主动申请读取范围，提供商同意页仍列出了既有读取授权；应用读取功能仍未开放。
- **预览核验**：发件人 `noah.jiang2@outlook.com`，收件人 `noahjiang2@gmail.com`，主题 `OAuth 续准备链路验收`，正文 `这是一封本地验收草稿。请勿发送。`，无附件、无链接，状态 review。
- **幂等与副作用**：刷新 OAuth 返回的对话页面后仍只有一个自动恢复 job 和一个 review 预览。邮件发送记录前后均为 5 条；未点击发送，没有新增发送记录。Gmail 和 Outlook 本地连接均已恢复，默认发件设置未改动。
- **执行透明性**：恢复任务第一次 email 调用因授权引用不是当前恢复消息的逐字子串而被 403 拒绝；Agent 读取错误后自行修正并成功准备。没有绕过授权保护。界面保留这次失败调用和后续成功调用。
- **检查**：本轮 TypeScript、修改文件 ESLint、邮箱恢复针对性测试 4/4 通过。

验收对话：`8611f29e-3f43-41d2-a2f1-5947e9f9dbc5`；恢复 job：`0c7667c6-4b30-43fc-a431-7730ec2fba55`；review 消息：`9e7272db-2823-4e6f-af9f-1e7315effdba`。截图 `tmp/oauth-e2e/conversation-resumed.png`，只读数据库结果 `tmp/oauth-e2e/final-result.json`。保留该本地验收对话供查看。

验证矩阵：Google 成功回跳与草稿恢复、Google 修复前取消、Microsoft 修复后取消与草稿恢复、Microsoft 成功回跳与对话自动准备。不是两个提供商的全部分支排列，也不是生产部署或 Google 应用审核通过。未推送部署。
