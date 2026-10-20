# Live 账号设置与桌面界面检查

日期：2026-10-20，Asia/Shanghai。使用已有登录态的 `noahjiang2@…` 账号，在真实 Chrome 检查 `hirelix.online`。用户授权操作和截图。本轮没有部署、付款、重新开启续费、发送邮件/反馈，或新增 AI 任务。

## 结论与待处理项

主要导航、设置、候选人、职位、推荐、提醒、对话和辅助弹窗均能正常呈现，检查过的交互未发现页面阻断或明显布局溢出。不能据此宣称所有业务动作和生产链路完整通过。

1. **账号连接异常：Gmail 显示授权过期。** 邮箱设置显示 `Connection needs attention`、`Reconnect mailbox` 和 `Mailbox authorization has expired. Reconnect this mailbox to renew access.`。本轮没有重新授权或发送邮件，不能确认当前账号能够发信。未独立读取 Google 响应或生产数据库，过期原因仍待进一步诊断。
2. **工程文案缺陷：发送能力提示不遵循连接状态。** 同一卡片在上述错误存在时，仍显示 `You can send email.`。本地 owner 为 `src/components/workspace/mailbox-connections.tsx` 的 Gmail 读取未开放说明：仅依据 `read_enabled` 渲染，未依据发信连接状态。`src/lib/workspace/mailbox-contract.ts` 的 `mailboxReadUnavailableReason` 也含 `Sending remains available.`，同样不是账号发信可用的证明。本轮记录问题，未修改产品代码或部署；修复应让读取开放说明只描述读取限制，让发送状态由真实连接结果表达。
3. **功能边界：Gmail 读取未开放。** 页面明确提示等待 Google 审核。Outlook 显示未连接，属于当前账号配置状态。本轮未开启权限、连接新邮箱或断开旧连接。

## 已实际检查

| 范围 | 实际操作与可见结果 |
| --- | --- |
| 账户设置 | 账户/邮箱/订阅三个分区可切换；账户菜单进入正确分区。密码表单正常显示，空值提交禁用；没有填写或更改密码。 |
| 界面语言 | 英文切换中文，刷新后中文和账户分区保留；随后恢复原有英文，后续设置/页面继续以英文显示。 |
| 订阅与用量 | 当前订阅有效，3,000 credits，已用 2.94，剩余 2,997.06，Access ends Nov 20。Manage subscription 实际进入 Paddle Live 客户门户，门户显示 2026-11-20 13:27 计划取消；未点击恢复订阅或修改付款方式。 |
| 候选人列表 | 2 位候选人；关键词查询、清除过滤、按姓名排序正常；不存在的测试关键词返回 0 和明确空状态。 |
| 候选人详情 | 打开 Jamie，概览、原始来源、关联职位和编辑弹窗可用；编辑取消后返回。当前没有关联职位，页面正确显示空状态。本轮未保存资料或修改关联。 |
| 关键词匹配解释 | 搜索 Alex 也命中 Jamie，刷新后相同。Jamie 的来源文本实际包含 Alex 和 Jamie，因此不能判为过滤失效；完整来源查找与仅按姓名查找属于不同范围。 |
| 职位 | 9 个职位；按虚构客户 Fictional Cedar Live QA 过滤到 1 个。打开仓储软件产品负责人，Brief/Candidates/Activity/Recommendations 分栏可用；要求、来源和未知项呈现正常。 |
| 职位进入对话 | Add from candidates 进入带职位上下文的对话；职位卡解析为真实名称，候选人选择器搜索 Alex 并可加入。职位与候选人可同时作为上下文显示；未发送消息，测试草稿和引用已清除。 |
| 推荐 | 全局页面、Prepare recommendation 职位选择弹窗、虚构客户过滤及职位内推荐视图可打开。当前没有发送记录；没有生成、发布或发送材料。 |
| 提醒与周期报告 | 两个分栏正常加载，分别显示无提醒/无周期报告。没有新建计划，未验证到时触发。 |
| 会话 | 搜索 Cedar 返回标题和消息片段，点击结果能打开保存的对话；消息、工具过程与输入框可见，空输入发送禁用。 |
| 个人偏好 | What I remember 正常加载，无使用中或已遗忘偏好，空状态明确。未创建/清空偏好。 |
| 反馈 | 表单、附加信息说明、空值发送禁用正常；输入临时草稿，关闭重开后保留，再清空关闭。没有上传截图或提交反馈。 |
| 支持与政策入口 | 支持 mailto 链接存在；隐私政策与服务条款实际打开并呈现。仅验证可达和显示，没有进行法律合规审查。 |

Paddle 门户和返回产品后的控制台 error/warn 采样均为空；这仅覆盖当时标签页捕获范围，不是全站无错误的证明。

## 证据与未验证范围

原始截图和界面文本仅保存在本地，未提交 Git：

`/Users/noah/projects/hirelix-local-archive/2026-10-20/live-account-audit/`

关键证据：

- `23-email-attention-visible.png`：同屏显示邮箱过期和“可发送”矛盾提示。
- `05-subscription-portal-loaded.png`：Paddle 门户计划取消状态。
- `03-account-chinese.png`、`02-account.png`：中英文设置。
- `09-candidate-empty-search.png`、`10-candidate-name-sort.png`：无结果及排序。
- `12-role-brief.png`、`13-role-candidate-context.png`：职位界面和对话引用。
- `19-conversation-search.png`、`20-saved-conversation.png`：会话搜索和持久读回。
- `21-memory-settings.png`、`22-feedback-draft.png`：偏好及反馈草稿。

未验证：重新登录/找回或修改密码、邮箱 OAuth 重连和发信、文件上传/解析/导出、候选人或职位写入/删除、推荐生成/分享/交付、提醒调度执行、账户级导出/删除、支付失败/续费/到期执行，以及手机和实体移动设备。先前 Live 任务和支付记录另见 `2026-10-20-live-conversion-verification.md`，不在本轮重复执行。

本轮只提交验收记录。没有以页面可达替代上述真实业务结果，也没有把模型业务判断列作工程缺陷。

## 连接异常原因复核（2026-10-20 15:59，Asia/Shanghai）

用户询问截图中的连接异常。对同一本地隔离 QA 账号实际调用现有 better-auth 凭证获取与邮箱身份验证，未读写邮件或扩大权限：

- Gmail：Google token endpoint 返回 200，随后 userinfo 返回 200，凭证续期和身份验证成功。截图当时检查未成功，现已恢复；没有证据认定 Google 授权已撤销。
- Outlook：Microsoft token endpoint 返回 HTTP 400、`invalid_grant`、错误码 `70000`；better-auth 将其包装为 `FAILED_TO_GET_ACCESS_TOKEN`。现有 refresh token 被服务端拒绝，应重新授权；不能仅凭该错误码断言账号锁定或具体撤销原因。
- 此结论针对本地 QA 授权记录，不替代 Live 账号状态。Gmail 读取审核和上述授权续期是不同问题。

脱敏请求状态、耗时和错误码保存在本地 `mailbox-diagnostic/result.json`，没有保存令牌值。当前界面对 SDK 通用错误只显示“暂时无法确认连接”，未获得具体拒绝原因时不能断言授权已过期。

## 按已确认设计图落地

邮箱名称旁新增带文字的状态标签（已连接、连接异常、未连接、暂不可用）；账号和能力分行，主要操作统一靠右。连接检查失败的提示紧贴账号，已知临时错误显示短说明；授权缺失、Microsoft 暂停和其他明确错误继续保留对应原因/动作。管理区域折叠，保留默认发件人、读取授权、断开及备用重连。设置内容宽度收至 760px，并为窄屏换行。邮箱组件被多处复用时，展开区域 ID 按实例隔离。

本地真实 Chrome 检查英文和中文界面，实际展开管理、更多选项、权限说明；打开断开确认后取消，没有断开邮箱。现有回归 17/17、TypeScript、ESLint 通过。真实依赖检查中 Gmail 曾显示已连接，后续请求也出现临时连接错误，Outlook 显示检查失败；均如实展示，未以设计稿的状态覆盖真实结果。新截图为 `mailbox-capability-copy/implemented-en.png`、`implemented-zh.png`。本轮仍只验证本地界面，尚未部署。

## 邮箱设置进一步精简

按用户确认的方案，顶部只保留一句介绍；每个邮箱显示名称、一次能力说明、账号/状态和主要操作。连接错误只显示一次，断开与备用重连收进“更多选项”；已连接邮箱的默认发件人、读取授权和断开操作仍在“管理”中。Microsoft 账号被暂停时保留前往 Outlook 的恢复入口，不同时提供无效的重新检查操作。发信确认、数据处理说明和隐私链接收进默认折叠的“了解更多”。粘贴/上传邮件的替代方式保留在读取不可用的工具返回中，不再常驻设置页。

真实 Chrome 在本地隔离库检查中英文页面，并实际展开/收起“了解更多”“更多选项”和已连接邮箱的“管理”，确认默认发件人、断开及备用重连入口仍可访问；没有提交这些账号修改。相关回归 17/17、类型检查和 ESLint 通过。截图为本地 `mailbox-capability-copy/simplified-en.png`、`simplified-zh.png`。本轮是界面验证，没有执行邮箱读写任务，尚未部署到 Live。

## 邮箱能力文案调整（后续本地修改）

用户确认直接描述可用能力，不在用户界面展示 Google 审核流程。设置页和对话里的邮箱连接卡片共用 `MailboxConnections`，现按服务实际的 `read_enabled` 分别显示：Gmail 支持发送、暂不支持读取；Outlook 在读取启用时显示支持读取和发送。账号自己的连接状态、错误和重连入口仍单独显示，不以产品支持某能力推断该账号已授权或连接正常。

读取被关闭时的工具/API 错误及其中英文翻译同步改为能力说明，保留粘贴正文或上传 PDF/文本的替代入口描述。没有修改读取权限、OAuth scopes、发信确认或业务执行逻辑。

验证：现有 mailbox read/cards/contract/OAuth UX 回归 17/17 通过，TypeScript 和修改文件 ESLint 通过。真实 Chrome 通过原有 Google 账号登录本地隔离库 `hirelix_workspace_qa_queue_20261015`，核对中英文设置页；仅本地预览进程临时设置 Microsoft 读取启用以检查对应文案，配置文件和生产开关未改。最初邮箱依赖返回连接错误，随后 Gmail 状态恢复，Outlook 仍显示连接错误；界面如实显示，未发送或读取邮件。截图保存在 `/Users/noah/projects/hirelix-local-archive/2026-10-20/mailbox-capability-copy/`，`email-zh.png` 同屏显示两个能力说明和独立的连接状态。本地语言已恢复原英文，预览服务已停止。本次修改尚未部署到 Live。
