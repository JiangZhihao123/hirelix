# Gmail OAuth 与真实发信复核 — 2026-10-16

## 结论

本次通过的是**本地真实链路**：Google 新授权 → 回到原推荐页 → 推荐页真实发送一次 → Gmail 收件箱独立读回 → 下载附件并校验原件一致。不是 mock，也不把历史生产验收当成本次证据。

生产 Google 审核没有失效。根因是本地 `.env.local` 仍使用旧客户端；切换后发现已验证客户端缺少 localhost 回调。修复均为配置，不需要修改发送业务代码。

## 身份与配置

- 旧本地客户端：`423498875582-4b8q9eiv7sieabm54kbfh4b290okjm49.apps.googleusercontent.com`。
- 已验证项目：`loyal-glass-510417-t9`，项目编号 `639029848396`。
- 已验证客户端：Hirelix Production Web，`639029848396-8jeiptd9uu24gnku3pca74o1jteskl2b.apps.googleusercontent.com`。
- 当天实际 Google Verification Center 同时显示品牌已验证、数据访问权限已验证。Vercel Production 与 VPS 环境中的客户端标识均与之匹配。
- 本地只同步 `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` 两个值；未将生产数据库配置用于测试。密钥未写入此记录或 Git。
- 经用户明确批准，Google Console 新增并保存 `http://localhost:3000/api/auth/callback/google`；保留原有 `https://hirelix.online/api/auth/callback/google`。
- 测试应用使用 `hirelix_workspace_qa_queue_20261015` 本地隔离数据库。开发服务和独立 worker 均已重启以加载配置。

## 实际授权与发信

1. 从虚构推荐文档的 Gmail 页签点击 Connect Gmail；Google 使用已验证客户端，只请求基础身份权限与 `gmail.send`。
2. Google 正常账号选择与授权页没有未验证应用警告。用户在实际权限页批准为 `noahjiang2@gmail.com` 授予“代表您发送电子邮件”。未请求 Gmail 读取或修改权限。
3. 授权回跳至原推荐文档 `#recommendation-delivery`；Gmail 页签显示正确发件账号。数据库持久化 `gmail.send`，access/refresh token 均存在，未输出令牌值。
4. 推荐页发送一封本人邮箱自测邮件，保留所选虚构 CV 与本地推荐链接。正文明确说明是虚构测试、localhost 链接仅本机可访问。
5. UI 显示 `Email sent and recommendation recorded.`，推荐文档变为 `submitted`。数据库仅有一条本次发送记录。
6. 普通 Chrome 中切换至收件账号，在 Gmail 收件箱打开相同主题和收件人的邮件。附件链接中的 Gmail message ID 与服务回执一致；实际打开一页 PDF，并下载核对 SHA-256。
7. 刷新推荐页后，发件账号和 `Sent through Gmail` 记录仍存在；没有再次点击发送。

| 证据 | 结果 |
| --- | --- |
| 发件账号 | `noahjiang2@gmail.com` |
| 收件地址 | `noahjiang2+hirelix-gmail-20261016@gmail.com` |
| 主题 | `Hirelix Gmail real-chain QA 20261016 — fictional CV` |
| 发送时间 | 2026-10-16 10:19:33 +08:00 |
| 本地回执 | `f5fbac0d-27bd-42a3-81e1-4b48d962fa7e`，`sent` |
| Gmail message ID | `1a14281f652987ee` |
| 推荐文档 | `c4675165-6eb2-4df9-b1cf-7c12fbeb6700`，发送后版本 3、`submitted` |
| 附件 | `Fictional_Elena_Audit_CV.pdf`，1 页，明确标记 FICTIONAL QA DATA |
| 原件/收到附件 SHA-256 | `33fc0b0615bf669fde8378118a03fb2dc3a77feb5a504f9a0e65288f15d237cd`，相同 |

本地截图：`tmp/gmail-20261016-verified.png`、`tmp/gmail-20261016-send-consent.png`、`tmp/gmail-20261016-sent.png`、`tmp/gmail-20261016-received.png`、`tmp/gmail-20261016-received-cv.png`。临时截图未纳入 Git。

## 验证边界与排查经验

- 本次从推荐页发送，未额外发送第二封 Agent 对话邮件；独立 worker 启动不等同本次 Agent 发信验收。
- 未进行生产部署或新一轮生产发信；本地推荐链接不代表公网链接可达性。
- 未重新发送相同邮件来验证去重；单条回执证明本轮没有重复发送，不代表并发/重试去重的完整回归。
- Chrome 调试附着曾造成 Google 页面加载停顿，退出调试后普通 Chrome 可完成授权与 Gmail 收件读取。这与 OAuth 审核状态是两个问题。没有绕过安全警告、关闭浏览器安全保护或更改代理配置。
- 未来遇到未验证提示，先对照授权 URL 中的 client ID、实际部署环境与 Google 项目 Verification Center；不要仅凭品牌名或旧审核记录判断。
