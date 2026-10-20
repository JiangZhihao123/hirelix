# Outlook 授权与收发真实链路验收

日期：2026-10-20，Asia/Shanghai。用户要求暂不做发布者验证，继续打通授权、读取和发送，避免营销内容与重复发信。本轮沿用浏览器中的本地隔离库 `hirelix_workspace_qa_queue_20261015`，外部依赖为真实 Microsoft OAuth / Graph 和真实模型；不是 Paddle Sandbox，也不代表 Live 部署验收。

## 新旧账号选择缺陷与修复

旧 Outlook 账号（`noah.jiang2@…`）已断开，新账号（`noahjiang2@…`）完成 OAuth 回跳。数据库同时存在两条 Microsoft account 记录。原 mailboxConnection 按最新 updatedAt 读取状态，但 better-auth getAccessToken 只传 providerId/userId；已安装 SDK 在未传 accountId 时选取第一条同 provider 记录，可能继续使用旧记录。因此出现新授权已保存、页面仍要求重新连接的问题。

修复位于 `src/lib/workspace/mailbox.ts`：状态检查和读写凭证均明确选择当前用户、当前 provider 的最新 accountId，并传给 SDK；邮箱身份回写仅更新这条账号记录。保留旧账号和历史数据，不通过删除旧记录掩盖选择错误。

- 真实 PostgreSQL 回归：新旧同 provider 账号、另一个用户的更新账号、身份只回写当前记录、读取/发送选择一致、最新账号断开后不回退旧授权。
- 相关 mock/contract 回归 21 项通过；TypeScript、修改文件 ESLint 通过。mock token/Graph 仅用于回归，未作为真实链路成功证据。
- 修复后真实页面确认新 Outlook 地址、Connected；后续 OAuth 已持久化 Mail.Send 与 Mail.Read，读取权限已开放。

## 真实对话执行

会话 `6a84bf28-4bc9-4fb2-9a95-a132340e6d13`。通过正常浏览器对话提交任务，用独立 QA 执行进程调用现有 claimJob、assistantReply、heartbeat、finishJob，限定执行该会话的当前已排队任务，避免运行隔离库里其他历史待执行任务。工具及模型请求均到达真实依赖，没有模拟邮件回执。

第一轮查找微软欢迎邮件：真实 Graph 搜索返回账号通知等邮件，未找到欢迎邮件，模型没有擅自读取其他正文或发送。此轮只证明搜索与展示，正文读取和发送/收件需另行确认。

本地证据目录：`/Users/noah/projects/hirelix-local-archive/2026-10-20/outlook-real-chain/`。截图和邮件内容不提交 Git。当前代码修复尚未部署。

## 发送、实际收件与刷新读回

第二轮明确要求读取最新的“连接到 Microsoft 帐户的新应用”通知，真实 read_mail 返回 Inbox 正文，确认 Hirelix 已连接。随后准备一封自发自收预览，发件人与收件人均为新 Outlook 账号；主题“邮箱连接记录”，正文为本人记录邮箱连接的一句说明与署名，无链接、附件、抄送或营销内容。

浏览器核对预览后，点击 Confirm and send email 一次。实际发送接受时间为 2026-10-20 17:11:02（Asia/Shanghai），持久回执 `90d1f020-83cd-42e0-8642-9b6653070928`，数据库 status=sent、provider=microsoft。Graph sendMail 接受不返回 message ID，因此该字段为空，未伪造一个 ID。

下一轮只查这封邮件，实际搜索并读取了 Inbox 来信和 Sent Items 副本。Inbox 来信收到时间为 17:11:08；展开真实工具结果卡片确认 Inbox 标签、发件人与收件人及正文。没有把 Sent Items 或模型结论单独作为送达证明，也没有重新发送。

独立查询本地账本：该用户、本日该主题只有 1 条发送记录。刷新对话后，预览卡和发送结果卡均读回同一个回执，Confirm and send email 按钮数量为 0。两张卡展示同一回执，不是两次发送。

结果：新账号 OAuth 授权、按需检索、正文读取、正常预览、单次发送、Inbox 实收、读回核对和刷新持久化在本地真实链路通过。只发了上述一封自发自收邮件；未验证跨收件服务投递、批量发送、生产部署、Microsoft 发布者验证或未来账号风控状态。

证据：`connected.png`、`search-complete.png`、`read-and-preview.png`、`accepted.png`、`inbox-readback.png`、`after-refresh.png`、`ledger.json`、`received-evidence.json` 和对应轮次的真实结果 JSON。
