# 推广发信子域名切换

2026-10-31，经用户明确授权，将 Hirelix 推广发信与日常工作邮件、产品通知分开。

## 冷邮件渠道限制（配置完成后核实）

Resend [Acceptable Use Policy](https://resend.com/legal/acceptable-use) 于 2026-10-13 更新，2026-10-31 核实：Prohibited Sending Purposes 第 1 条明确禁止 cold outreach；Appropriate Mailing Lists 要求所有收件人明确 opt in。官网公开工作邮箱、精准一对一、提供退出方式或用户授权，均不能替代收件人同意。

因此，此子域名的技术认证和内部收件测试已经完成，但**不得继续通过 Resend 向陌生猎头发推广**。本地配置检查只检查必需配置，不证明收件人同意或服务商允许。此前未先核对此限制，已向用户说明；本轮新名单只保存未发送草稿，没有发送或预约发送。后续实际冷触达须有明确允许此用途的发送服务及适用规则支持，不能换账号、复用工作邮箱或更换子域名绕过服务商限制。已同意接收的联系人可继续按原规则使用此子域名。

## 生效配置

- 推广 From：`Noah Jiang <noah@outreach.hirelix.online>`。
- 推广 Reply-To：`noah@hirelix.online`，继续在原工作邮箱处理客户回复；子域名未启用 Resend 收信。
- 推广发送渠道：Resend，独立验证 `outreach.hirelix.online`，打开和点击跟踪均关闭。
- 日常工作邮件仍使用 Zoho 的 `noah@hirelix.online`；产品通知仍使用原 `SEARCH_NOTIFICATIONS_FROM_EMAIL=notifications@hirelix.online`。未修改生产环境变量、产品代码、服务或主域名邮箱记录。
- 本地 `.env.local` 仅改变推广渠道、推广 From 和禁用历史发件人推断；Reply-To 保持原值。环境文件及其备份均不进入 Git。
- 已发送批次及日志保留历史真实 From，不改写历史，也未向潜在客户重发或新增发送。

## DNS 与验证

Namecheap Advanced DNS 仅新增以下四条记录，TTL 均为 Automatic：

| 类型 | Host | 用途/值 |
| --- | --- | --- |
| TXT | `resend._domainkey.outreach` | 独立 DKIM 公钥，由 Resend 生成 |
| TXT | `send.outreach` | `v=spf1 include:amazonses.com ~all` |
| MX | `send.outreach` | `feedback-smtp.us-east-1.amazonses.com`，优先级 10 |
| CNAME | `rsend.outreach` | `send.forge.rmta.net`，Resend 当前要求的发送记录 |

DMARC 继承现有 `_dmarc.hirelix.online` 的 `v=DMARC1; p=none`，未更改主域名策略。主域名 Resend 配置前后完全一致，仍 verified。完整展开的 DNS 记录从 14 条增至 18 条，原有 14 条无修改或删除；Google 公共 DNS 已查询到全部新增记录。

Resend 子域名 ID：`75f3ade3-5d63-43b2-8c6c-c8a307f499b8`。API 回读子域名及四条记录均为 `verified`。

## 发送与收件验收

2026-10-31 15:07 UTC（北京时间 23:07）仅发送内部配置测试到自有工作邮箱及自有 163 邮箱，未发送推广。

- 标记：`HXL-OUTREACH-SUBDOMAIN-20261031`。
- Resend ID：`01a19280-35d3-7d3b-b117-03550902d94c`。
- 服务端回读：From 为子域名地址，Reply-To 为原工作地址，`last_event=delivered`。
- 真实 Chrome 在 Zoho 中搜索唯一标记，只返回本次测试；打开邮件确认位于**收件箱**，From 为子域名，Reply-To 指向原工作邮箱。
- Zoho 原始邮件头：`dkim=pass`、`spf=pass`、`dmarc=pass(p=none dis=none) header.from=outreach.hirelix.online`；Return-Path 为 `…@send.outreach.hirelix.online`，TLS 传输成功。这是收件端真实认证结果。
- 163 邮箱在测试后约四分钟搜索全部九个文件夹仍未找到本邮件，尚未证明 163 收件成功。未验证 Gmail 收件或所有外部客户邮箱的投递率；服务端 `delivered` 不等同所有收件人均进入收件箱。
- 现有推广配置回归 8 项通过，覆盖误用工作/通知域名时拒绝发送。配置检查通过。未执行整站构建，因为没有产品运行代码改动。

本机忽略目录 `output/outreach-subdomain-20261031/` 保存 DNS 前后快照、差异、域名验证和测试邮件服务端回读。后续推广必须使用此子域名及当前配置；不能从旧批次或旧发信回执推断发件人。子域名分流不代表主域名完全免受信誉影响，也不能保证进入收件箱。
