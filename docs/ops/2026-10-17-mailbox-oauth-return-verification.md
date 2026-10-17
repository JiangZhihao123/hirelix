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
