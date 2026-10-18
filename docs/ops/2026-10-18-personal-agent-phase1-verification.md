# Personal Agent 第一阶段：完整委托本地验收

日期：2026-10-18（Asia/Shanghai）。范围：一个职位、多位候选人、邮件往来、推荐交付、逐人反馈和跨会话续接。此次仅本地实现与提交，不推送、不部署生产。

## 结论

本轮指定主链路已通过真实浏览器、独立 Agent worker、DeepSeek、隔离 PostgreSQL 和真实 Outlook/Gmail 往来验证。不是整站发布放行，也不代表 Gmail 读取审核已经通过。

测试内容全部为虚构候选人，邮件仅在用户控制的测试邮箱之间流转。没有启动已退出产品的外部付费人才寻访。

## 环境与复现入口

- 工作分支：`codex/whole-product-audit-20261018`，工作目录 `hirelix-whole-product-audit`。
- 本地服务：`http://localhost:3001`；网页与独立 worker 使用同一个本地隔离库 `hirelix_workspace_qa_queue_20261015`。
- 原委托对话：`6069d8a4-bf96-4d9c-be47-5593e2890388`。
- 跨会话续接：`71f573f6-0a5e-4f44-a3ab-20c41b759fe5`。
- 职位：`d590e0cf-ccaa-4c1d-b571-bf277bd433d3`，Cedar Personal Agent 1018 / Head of Product。
- 推荐文档：`8217f08c-a3a8-482d-bc7f-153cd3096ca2`，版本 3。
- 初次执行遇到本地测试账号试用额度耗尽；确认数据库身份后，仅重置该 QA 账号的试用起点并从 UI 重试，历史用量未删除。这是测试环境准备，不计为产品修复。
- 修正本地服务 URL 配置为 3001，重新生成预览后才发送，避免推荐邮件带错误端口。

## 真实链路与验收结果

| 环节 | 操作与证据 | 结果 |
| --- | --- | --- |
| 委托理解 | 对话交代 B2B SaaS、亲自负责定价、直接管理 PM、上海混合办公；保存职位与三位候选人 | 正确建档与关联 |
| 多人比较 | Mira 有定价所有权和 4 位直接下属；Alex 只证实项目协调 6 位 PM；Sam 缺 B2B 定价且只接受北京远程 | Alex 直接下属保持未知，没有把协调管理推断为直属管理 |
| 推荐交付 | 选择 Mira、Alex；保存推荐，授权分享，打开客户推荐页，下载 ZIP/PDF 并读取实际 PDF 文本 | 只有选中两人；Sam 未混入；未宣称包含不存在的简历；未知证据保留 |
| 邮件发送 | 从 Outlook 发出推荐邮件，Gmail 收件端实际看到邮件进入 Inbox | 不是仅以 API 接受状态代替送达；发送回执 `8f097b50-41ed-45ef-99e7-6d6004eb23fb` |
| 逐人反馈 | 客户页分别提交 Mira“希望面试”、Alex“暂缓考虑” | 原对话收到两条按人关联反馈；希望面试不等于已安排；暂缓不等于拒绝 |
| 客户回信与附件 | Gmail 在原串回复，附 `cedar-feedback.txt`；Outlook 实际收取 | Agent 读取正文、来源、时间和附件标记 `CEDAR-ATTACHMENT-1018` |
| 跨会话续接 | 新对话只给职位名称和目标，不提供对象 ID；要求找回工作并继续 | 找回职位、候选人、推荐与反馈；读取最新邮件；没有重复建档或重复保存两人反馈 |
| 原串回复 | 准备明确预览，经 UI 确认发送；检查 Gmail 原会话 | 三封往来在同一个会话；回执 `34605b3b-376f-4e49-8745-fa641e26b963` |
| 来源更正 | Agent 修改已有 Sam 邮件记录的来源字段 | 原记录 `8668607c-a4dc-4255-b2de-266b8dde1dc2` 升为 v2，真实 Outlook 链接写入 `source_url`；无新增重复记录 |
| 交互 | 查看/收起邮件串、打开原邮件入口、下载附件、展开结果、保留输入草稿 | 邮件串显示 23:20、23:22、23:24；附件下载字节与原件一致；展开/收起不丢草稿 |

最终数据库回读：Mira、Alex 各一条反馈；Sam 的新增邮件证据只有一条，来源更正发生在原记录上。

## 本轮修复与补齐

1. **邮件上下文与原串回复**：按提供商 conversation/thread 身份读取往来，不靠主题猜测；Outlook 回复复用既有预览、确认、发送回执与去重。发送前重新核对原邮件、线程和收件人；不隐式 reply-all。
2. **附件读取与下载**：在所属邮箱/邮件中校验附件，支持唯一文件名或附件 ID；Agent 使用现有文档解析能力。初次真实执行曾因长附件 ID 读取失败，补充唯一文件名选择后复测一次成功。
3. **来源持久化**：Agent 创建和更正记录均可传递原始来源链接；不再只把来源写进正文。
4. **发送去重**：原邮件身份进入去重依据；按语义字段比较，避免 PostgreSQL JSONB 键顺序变化把同一回复误判成不同回复。已有接受回执重试不会再次发送。
5. **交互收拢**：连续邮件检索/读取保留最新结果，将较早结果折叠；用户仍可展开查证。邮件串按需展开，附件可下载，回复预览标明原串来源。
6. **上下文边界**：邮件和附件当作外部资料；反馈保留人、时间、来源与事实边界，内部枚举不作为自然语言答复。

没有新增工作流引擎、待办中心、自动记忆服务或独立 Agent。

## 自动化检查及证据分层

- `npm run test:unit`：486 项，477 通过，9 跳过，0 失败。这里包含 mock 回归，不把它当作真实邮箱完成证明。
- `npx dotenv -e .env.local -- tsx --test tests/integration/workspace-conversation-email.test.ts`：11 项真实 PostgreSQL 集成通过。提供商身份有测试替身，只证明预览/预留/去重/持久化约束。
- `npx tsc --noEmit`、`npx tsc --noEmit -p scheduler/tsconfig.json`：通过。
- 本次修改文件 ESLint、`git diff --check`：通过。
- `NEXT_DIST_DIR=.next-phase1-check npm run build`：通过。
- Chrome 真实业务链路：见上表；真实邮箱送达、原串归并、实际附件和 PDF 下载另行验证。

本地证据在 `tmp/whole-product-audit/`，不纳入 Git：`phase1-gmail-thread.png`、`phase1-resume-final.png`、`phase1-final-records.json`、`phase1-all-unit.log`、`phase1-pg-email.log`、`phase1-build.log`。证据可能包含测试邮箱信息，不作为公开材料。

## 保留的产品边界与下一步

- Gmail 读取仍由审核/配置开关控制，本轮未开放，也未证明其生产读取能力。Gmail 在本轮作为真实客户收件端使用。
- 原串回复和附件读取本轮以 Outlook 验收；Gmail 附件读取尚不支持。
- 首版一次读取最多 20 封线程邮件，超过会明确标记仍有更多；不是完整历史的保证。附件读取上限 4 MB，非普通文件附件给出明确错误。
- 本次推荐没有候选人 CV，因此验证了“无 CV 时不误称附件”；未把带真实简历的客户交付当作已验收。
- 原推荐 URL 指向本地，只适用于这次本地验收；不能作为外部客户生产交付链接。
- 部分 Agent 文字仍偏长，旧消息中的“未发送”叙述保留历史语境，最新回执展示实际状态。后续可继续精简交付摘要，但不能抹去证据和历史。
- 生产前仍需按另行授权部署前端和 worker，再在生产复验相同业务链路。本轮不据此宣称全部功能无问题或可以直接全面上线。

## 实现依据

微软官方 [Reply to a message](https://learn.microsoft.com/en-us/graph/api/message-reply?view=graph-rest-1.0) 和 [List messages](https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0) 用于核对接口语义。产品验收结论以上述本地真实结果为依据。
