# 线上推荐交付与 AI 对话发信实测 — 2026-10-16

## 结果与范围

用户明确要求实测线上和 AI 对话发信。本轮从真实 Chrome 操作 `https://hirelix.online`，通过生产 worker、Gmail API 和收件方 Gmail 页面完成两封本人邮箱测试。没有使用本地发送结果代替线上证据，也没有部署本地积累的其他功能。

两封邮件都成功送达、发送记录持久化；附件校验一致。同时发现**线上推荐邮件忽略自定义主题/正文**，故不能把本轮描述为邮件产品全部验收通过。该问题已修复在本地，并经过服务回归和真实模型预览验证，尚未发布。

线上 Gmail 已连接 `rosedawsonwhere@gmail.com`，本轮沿用已有授权。生产 worker 实查 `active`，代码 `1b05384`。这不代表 Vercel 与本地 HEAD 版本一致。

## 两条实际路径

### 直接 AI 对话

会话：`7e23d293-1676-4ed4-a79a-3b41832f80b8`。

1. 在新对话请求查询 Gmail 连接并准备指定收件人、主题、正文的预览，明确暂不发送。
2. 实际预览显示正确账号、收件地址、主题、正文及无附件。确认前生产 DB 对应收件地址发送记录为 0。
3. 用自然语言确认发送一次；真实 worker 返回成功，原预览变为已发送。
4. 收件方 `noahjiang2@gmail.com` Gmail 收件箱实际打开邮件，核对完整正文和目的地址。
5. 刷新对话仍显示已发送。再次询问发送结果且明确不重发后，没有重复发信。旧版 Agent 只查询连接并对投递核验持保留说法，没有独立读取邮件能力；本轮的收件证明来自单独的 Gmail 页面。

### 从线上推荐页交付附件

文档：`d4330b09-813b-4429-8caa-e73f324a8d5e`，虚构 `Fictional Launch Product Lead`。
会话：`75450b4a-1c30-4940-89fa-c9d2a9ad1d8a`。

线上现有入口是推荐页“分享链接或复制 → Gmail → 交给 AI 助理”（“交付给客户”也跳到带文档的对话），不是本地新版的独立发送面板。实际沿线上入口进入文档对话，准备并确认发送附带 `production-cv.pdf` 的推荐。

首次预览仍采用原文档标题/全文，未应用请求中的新主题和开头说明，但 AI 文字声称已应用。没有直接发送这一不一致结果。指出差异后，明确确认此次虚构自测按**卡片实际显示的原标题、原推荐全文和原始附件**发送一次。随后 Gmail 收件箱实际收到完全对应的邮件与附件，推荐状态为 `submitted`、版本 4。

| 项目 | AI 普通邮件 | 推荐附件邮件 |
| --- | --- | --- |
| 收件人（本人别名） | `noahjiang2+hirelix-agent-prod-20261016@gmail.com` | `noahjiang2+hirelix-rec-prod-20261016@gmail.com` |
| 主题 | `Hirelix production Agent Gmail QA 20261016` | `Fictional production QA — VP Product candidate review` |
| 发送时间（Asia/Shanghai） | 2026-10-16 10:55:43 | 2026-10-16 11:03:44 |
| DB 回执 | `e7bb78ef-1f44-4539-95e3-0fe6758fb7e0` | `8b91735f-0359-449d-89ac-53da3391f126` |
| Gmail 发送端 ID | `1a142a308c0d3dea` | `1a142aa609b3e7c0` |
| 附件 | 无 | `production-cv.pdf` |
| 发送状态 | `sent`，1 条 | `sent`，1 条 |
| 收件证据 | Gmail 收件箱打开正文 | Gmail 收件箱打开全文、下载 PDF |

收件方附件链接对应 message ID `1a142aa6bbbbcac8`；跨账号的发送/接收 message ID 不要求相同。收到的 PDF SHA-256 为 `ac4413f88e91109eddf483781ab0fc18031345700cdeaf407748f5a3bed20471`，与生产发送快照内的文件哈希一致。

## 发现的问题与本地修复

`prepareEmailReply` 只在包含分享链接或不附 CV 时应用推荐邮件的 `subject/body` 覆盖。普通附 CV 邮件直接使用保存文档的标题/正文，忽略了模型传入的编辑。这不是模型没有理解要求，而是服务分支遗漏。

修复：所有文档邮件统一经过已有 `recommendationEmail` 组合逻辑，保留选中 CV、未指定字段的原值和发送时的精确预览校验；不修改保存的推荐文档。没有增加新工作流或案例分支。

验证：

- 本地隔离 PostgreSQL：`workspace-conversation-email.test.ts` 与 `workspace-email-delivery.test.ts` 共 10 项通过。新增覆盖附 CV、无链接时同时修改主题/正文、单独修改字段、未修改默认值、不可变原文档、重复保留与未审核变更拒绝。服务测试未调用 Gmail。
- `npx tsc --noEmit`、两个修改文件的 ESLint、`git diff --check` 通过。
- 重启独立本地 worker 后，真实 Chrome → 真实模型 → 邮件工具生成了指定主题 `Hirelix attachment preview correction 20261016`、指定正文与原选中虚构 CV，无分享链接；保存文档保持版本 3。此预览随后取消，未发送第三封邮件。

上述修复未推送、未部署。线上两封真实邮件证明发送/收件链路可用，不证明新修复已上线。线上主入口与本地新交付面板的差异也仍存在。

## 本地证据文件

- `tmp/gmail-20261016-prod-agent-preview.png`
- `tmp/gmail-20261016-prod-agent-sent.png`
- `tmp/gmail-20261016-prod-inbox-both.png`
- `tmp/gmail-20261016-prod-agent-received.png`
- `tmp/gmail-20261016-prod-rec-received.png`
- `tmp/gmail-20261016-prod-preview-mismatch.png`
- `tmp/gmail-20261016-fixed-custom-preview.png`

截图与下载文件未写入 Git；不包含令牌或认证密钥。

## 后续根因修复与真实发送复验

除附 CV 分支跳过主题/正文覆盖外，模型指导未明确以工具返回的预览为准，可能将请求参数误述为已完成修改。现已明确实际快照为事实来源，显式主题/正文适用于所有文档邮件，精确正文须保留全部句子。真实模型初次预览曾缩短正文；加入逐字保留指导并重启独立 worker 后，新预览一次保留全部三句。

本地隔离库 → 真实模型 → 原文件读取 → Gmail → 本人收件箱已验证：

- 主题：`Hirelix corrected CV final verification 20261016`
- 正文：`Owner-only fictional QA.`、`The customized subject and body must be sent with the selected original CV.`、`Verification marker: FINAL-CV-20261016.`，三句与预览一致。
- 附件：`Fictional_Elena_Audit_CV.pdf`，Gmail 收件页显示；本次未重新下载做字节校验。
- 收件人：本人 Gmail 的 `+hirelix-fixed-20261016` 别名。
- 回执：`42c9ab15-de03-44da-875e-8e0aa0d1d6db`，状态 `sent`，Gmail ID `1a14338ae17d68a7`；13:39 +08:00 收件页独立核对。
- 截图：`tmp/gmail-fixed-received.png`。

此前 13:23 的另一封测试请求 `e95229d0-c1a4-418e-b1cc-995871bdc99a` 未获得 Gmail 回执，保留 `unknown`，邮箱搜索未发现该标记；不能由此断言永远未送达。没有自动重发。加入只含回执 ID、错误类型/底层错误码或 HTTP 状态的诊断日志，不记录凭据、正文或收件人。原异常未留底层错误，无法追溯确切网络原因；后续同运行环境的未认证 Gmail 探针 1.9 秒返回预期 401，独立新邮件发送成功，不能把偶发问题宣称为已根治。

验证：隔离 PostgreSQL 集成测试 10/10；单元测试 408 通过、4 跳过、0 失败；生产构建通过；最终 TypeScript 与修改文件 ESLint 通过。构建生成的 tsconfig 改动已移除。

修复仍为本地版本。当前 main 相比 origin/main 积累 44 个未发布提交，包括订阅周期、列表搜索、对话控制、自然对话和推荐交付等。此次未擅自推送整个积累版本，线上仍需发布后复验。
