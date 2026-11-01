# Outlook 推广邮件投递排查与复测

2026-11-01，Asia/Shanghai。用户明确要求排查 Outlook 垃圾邮件原因、改善并重新测试。只向用户自有 Gmail / Outlook 测试邮箱发送；没有新增联系潜在客户。

## 结果

当前不能宣称 Outlook 投递已恢复。原推广正文、简化推广正文、纯诊断通知三种内容在 `noahjiang2@outlook.com` 都进入 **Junk Email**，`SCL=6`、`BCL=0`。三封 Outlook 收件端均为 `spf=pass`、`dkim=pass`、`dmarc=pass`、`compauth=pass reason=100`，Mailbox-Delivery 标头均包含 `dest:J`、`OFR:SpamFilterAuthJ`、`RF:JunkEmail`。不是单靠提供商 delivered 判断分类。

| 样本 | 北京时间 / 收件时间 | 提供商 ID | 接收结果 |
| --- | --- | --- | --- |
| 原推广正文，含价格、试用及官网链接 | 19:31:54 | `01a196e1-49ed-73fe-8d16-fb698c5ec313` | Outlook Junk Email，SCL 6 / BCL 0 |
| 简化推广正文，无外链、价格、试用语，增加邮件退订头 | 19:40:31 | `01a196e9-394e-7dd1-8a52-aef7d749dfb2` | Outlook Junk Email，SCL 6 / BCL 0 |
| 不含推广内容、链接或附件的纯诊断通知 | 19:42:20 | `01a196ea-dd9c-7202-bac7-b0090a25dd80` | Outlook Junk Email，SCL 6 / BCL 0 |

原文与简化推广正文也各向 `noahjiang2@gmail.com` 发一封：Gmail 均显示 `INBOX`、`CATEGORY_PROMOTIONS`，无 `SPAM` 标签，收件端 SPF / DKIM / DMARC 通过。

- 原 Gmail：Resend `01a196e1-466e-7d61-839d-c31fa7382278`；Gmail `1a196e149ee35e6a`。
- 简化 Gmail：Resend `01a196e9-35dd-7727-a610-096ca12fd7ca`；Gmail `1a196e939185249e`。
- 本轮在原测试基础上新增 **3 封**：简化版 Gmail / Outlook 各 1 封，纯诊断 Outlook 1 封；不重复发送原样本。

## 调整与诊断边界

发件人始终是 `Noah Jiang <noah@outreach.hirelix.online>`，Reply-To 始终为 `noah@hirelix.online`。保持纯文本、无附件、关闭阅读及点击追踪。简化版增加 `List-Unsubscribe: <mailto:noah@hirelix.online?subject=unsubscribe>`；这是邮件方式退订，**不是 RFC 8058 HTTPS 一键退订**，没有伪造一键退订头或不存在的退订接口。

简化版仍明确介绍 Hirelix 是独立猎头的 AI 助理，说明整理 CV、笔记、推荐及跟进草稿，用户审核后再发出；以询问是否希望看候选人摘要示例作为行动入口。保留原有回复退出与邮寄信息。没有伪装已有对话、添加 `Re:`、更换发件身份或修改收件人的安全设置。

结论分层：

- **已证明：** 微软在认证全部通过后仍执行垃圾邮件过滤；三种正文均未改善该测试邮箱的分类。
- **不支持：** 不能把原邮件里的价格、试用、官网链接或缺少 List-Unsubscribe 单独认定为唯一原因。
- **合理推断：** 应优先排查发件身份 / 域名及通道信誉。子域名在 10 月 31 日才完成设置，历史很少；但这不足以证明“新域名”就是唯一根因。
- **未证明：** 不能区分子域名、主域名、共享 IP 池、收件人历史或微软其他信号的具体贡献。三封发送 IP 分别为 `54.240.48.56`、`54.240.48.63`、`54.240.48.58`，不能由此宣称整个 SES 池被封，也未开展公共黑名单全面扫描。
- **样本限制：** 同一自有 Outlook.com 邮箱的连续测试，不代表陌生收件人的首封体验、企业 Microsoft 365 或全部 Outlook 用户。

没有移动邮件、标记为非垃圾邮件、加联系人或白名单；没有用这些收件人操作包装“修复”。没有修改 DNS、主域名、生产应用配置或原先 8 封预约邮件。无证据支持把 DMARC 从 p=none 改成 p=reject 就能修复本问题，也没有购买独立 IP 或额外服务。

## 后续处理

保留当前认证和分流配置，避免继续重复向同一测试箱发送或购买自动互发“养邮箱”服务。用户随后明确授权提交给 Resend 支持；已提交提供商 ID、微软 Message-ID、接收时间与选定诊断标头，请其核查发送域名及共享通道对 Outlook.com 的信誉、是否需要 Microsoft sender support 介入。

### Resend 支持提交与回复（当日北京时间 19:53–19:54）

公开支持表单提交后返回 `Something went wrong while processing your request. Please try again later.`，未获得成功回执。改由现有 Zoho 邮箱 `noah@hirelix.online` 向官方技术支持地址 `support@resend.com` 发送一封邮件，无抄送、密送或附件；选定标头直接置于正文，没有客户邮件正文、密码或 token。主题为 `Outlook.com Junk placement despite passing authentication — outreach.hirelix.online`。该地址由 [Resend 官方联系方式](https://resend.com/legal/terms-of-service)核实。

Zoho 已发送记录 ID `1793534025435144400`，状态为“已投递”。19:54:00 收到 `Team at Resend <support@resend.com>` 的已收到请求自动回执（Zoho ID `1793534040931141500`）；19:54:24 又收到 `Resend Support <support@resend.com>` 的具体回复（Zoho ID `1793534064964141500`）。未显示工单编号。

支持回复认为，纯诊断通知也进入垃圾箱，更指向刚设置的 `outreach.hirelix.online` 缺乏微软发送历史和域名信誉；其表示持续监测共享发送 IP，但没有提供本账号或具体 IP 的信誉核查数据。支持不会代向 Microsoft 提交升级请求，并要求如需账号级排查，使用 Resend 团队成员邮箱来信。这是支持方的判断，尚不能证明唯一根因或排除其他过滤信号，也没有宣称问题已修复。未继续发送测试或调整 DNS / 生产设置。

实际发送内容、自动回执、后续回复及截图保存在忽略目录 `output/outlook-deliverability-20261101/`；浏览器已保留最新支持回复供用户查看。

### 注册邮箱继续排查（当日北京时间 19:58 起）

用户进一步明确授权使用 Resend 注册邮箱继续联系并请求账号级排查。通过 `noahjiang2@gmail.com` 内 2026-03-13 的 Resend 欢迎邮件，以及发送给该邮箱的 `noahjiang2` 团队额度通知核对邮箱；没有把这当成支持已经完成账号审查。19:58:40 使用该 Gmail 连接器发送支持邮件，引用先前 Zoho 往来主题、发件地址和时间，请支持关联原请求；提供原有三封样本的 ID、IP、时间及选定标头，无抄送、密送、凭据或新增客户资料。Gmail 已发送 ID `1a196f9df0aa4e8e`，读回 `SENT`、From、To 与主题一致。

19:59:26 收到支持回复（Gmail ID `1a196fa950c6e0dc`）：

- 支持表示域名已验证，SPF / DKIM / DMARC 对齐且通过，Return-Path 为 `send.outreach.hirelix.online`，无需修改域名设置。回复把新子域名信誉不足明确写为可能解释，而非已证实结论。
- 支持明确表示当前回复可用的数据不含账号级限制和合规标记，未提供账号级健康结论、近 30 天退信/投诉/抑制情况或具体共享 IP 的微软信誉结果。回复中一次误拼为 `outtreach.hirelix.online`，后续已再次提供正确域名及 ID，不能单凭这段文字宣称其完成了精确域名审查。
- 支持不建议当前发信量使用独立 IP，建议向希望接收邮件的人稳定少量发送、渐增，并引用官方 warm-up 与 Outlook 指南；没有提供针对本账号的日发送量、恢复时间或复测间隔。

20:00:10 在同一 Gmail 线程明确要求升级到能读取上述记录的人工账号 / 投递专员，核查限制、合规、域名情况、近 30 天的相关指标和三封样本的共享 IP 问题，并给出适合实际低发信量的起始节奏、停发指标及 Outlook 复测方式。回复 ID `1a196fb3fcaed2af`，线程 `1a196f9df0aa4e8e`，读回 `SENT` 与指向支持回复的 `In-Reply-To`。这是已提出升级请求，不能写成人工已经接手或账号排查已经完成。无付费升级、DNS / 账号设置变更或新增测试发信。

官方 [warm-up 指南](https://resend.com/docs/knowledge-base/warming-up) 当日核验：建议保持平稳发送、监测 bounce rate 低于 4%、spam rate 低于 0.08%，并明确这些只是基线，可由支持制定具体计划。其新域名表格是上限参考，不能把首日最多 150 封误当成本账号应达到的目标；低样本比例波动也不能用来判定投递已恢复。官方 [独立 IP 说明](https://resend.com/blog/do-you-need-a-dedicated-ip) 将高且稳定的发信量列为适用条件。暂不根据泛化指南放大发送量，账号级核查结果仍待支持提供。

若服务商处理了可识别的问题，再用新邮件验证原始文件夹和标头；若测试收件人已经白名单或手动移出垃圾箱，则必须单独记录，不能算作一般投递恢复。低流量信誉积累依靠真实、愿意接收邮件的收件人反馈；本轮不承诺恢复时间或成功率。

## 证据与官方资料

忽略目录 `output/outlook-deliverability-20261101/` 保存 Microsoft Graph 收件端诊断标头、只读读取脚本、实际支持邮件与回复。使用用户已有的 Mail.Read OAuth 授权，读取前核验 Graph 身份为自有测试 Outlook 邮箱；未增加权限或启用产品邮件读取配置。Gmail 使用独立连接器读回标签及认证标头。原生 Outlook 也确认垃圾邮件文件夹与警告；原生查看源未返回可读标头，网页版加载超时，最终证据来自 Graph。

- [Resend：How to avoid Outlook's spam folder](https://resend.com/guides/email/deliverability/avoid-outlook-spam-folder)：认证、SCL/BCL、低流量发信与信誉、测试箱限制及内容建议。
- [Resend：Why are my emails going to spam?](https://resend.com/guides/email/deliverability/why-emails-go-to-spam)：域名认证、内容及 Deliverability Insights，未解决时联系支持。
- [Microsoft：Anti-spam message headers](https://learn.microsoft.com/en-us/defender-office-365/message-headers-eop-mdo)：认证、垃圾邮件诊断字段；未公开字段只供微软内部诊断，不推测其含义。该文档面向云组织，Outlook.com 此次分类同时由实际 Junk Email 文件夹与 Mailbox-Delivery 标头佐证。
- [Microsoft：Sender Support in Outlook.com](https://support.microsoft.com/en-au/outlook/sender-support-in-outlook-com)：IP、域名、认证、名单、投诉及内容共同影响过滤。
