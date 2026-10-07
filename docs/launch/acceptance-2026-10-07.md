# Hirelix 增量验收与 Google 接入交接（2026-10-07）

## 结论与版本

本轮完成本地真实模型、真实 PostgreSQL 和 Chrome 业务验收，发现并修复资料整理提前声称“已保存”的问题。随后已完成独立生产 OAuth 客户端的 Gmail 授权和真实自发自收；合格审核录像及 Google sensitive-scope 审核仍未完成。 没有 push、部署、新付款、付费外部人才召回或数据删除。

生产核对：origin/main、GitHub 成功 CI、部署记录及 VPS checkout 为 `9e05f45d77479d301ea8799e49cff52fe91da9ec`；Vercel `dpl_3NXc97SfQ9mdwNyHjHV9BQTRAydR` Ready，绑定 hirelix.online。VPS scheduler active/running、NRestarts=0；health timer 最近服务 exit=0，私有队列、数据库及日备份检查通过。此检查不能替代异机恢复演练。

本地起点 `40e5390` 已领先远端一个提交，原有提交保留。本轮独立提交：

| 提交 | 结果 |
| --- | --- |
| `29d08bb` | ESLint 排除所有隔离 Next 构建目录 `.next*/**`，避免扫描生成产物 |
| `8ed7363` | 根据实际 conversation import 状态区分整理授权与保存结果；尚未保存时不声称完成；排队推荐稿只提示请求已保存 |
| `21e2caf` | 大库真实检索测试给完整批次/重试 600 秒预算并输出阶段耗时；没有改变 provider 超时/重试或减少 130 个样本 |

上述代码尚未发布。所有新增证据位于 Git 忽略目录 `output/acceptance-20261007/`；该目录包含本地 bearer 分享 URL，不可整目录公开上传。

## 本地真实业务结果

Chrome 使用 localhost:3200，数据库 `hirelix_workspace_qa_launch_20261001`，独立最新源码 worker。使用现有真实 QA 登录会话，**不算本轮重新 Google 登录**。所有新增候选人、职位、客户资料为明确虚构 QA。

| 链路 | 实际结果与证据 |
| --- | --- |
| CV、JD、客户备注一起提交 | 对话 `eb955b4a-9777-426d-8742-4232614d0368`；chat、import 均 done/1；离开再返回可见进度和结果。候选人 Riley Marsh `5f9d2551-a39e-49f4-85e1-3ec12167b8f9`；CV 486 bytes，数据库/源文件 SHA256 一致。`browser-import-saved.png`、`file-hash-readback-final.log` |
| 职位及候选人匹配 | 审阅原始 JD 后保存 Cedar QA1007 / Platform Engineering Lead `269c7cc8-2ef2-4655-981c-5873f475240c`，关联库中候选人，assessment done/1。结果明确三天到岗为硬要求，伦敦常驻不能证明到岗意愿；薪资、兴趣、可用性、分享许可均保留未知。`role-assessment-final.png/.txt` |
| 推荐稿与修订 | deliverable `e0e6be9b-7bfc-49c6-ab42-9c1dd0711681`、revision `598d2324-6084-41db-8d84-6f2f1234bf8e` done/1；刷新后可继续审阅提案，手动应用到文档 `58948e54-b461-4d8b-b5cd-f32a74774ecf` v2，v1 历史保留。文档仍 draft/client，仅选择原始 CV |
| PDF/DOCX/复制邮件 | Chrome 实际下载 PDF 2,127 bytes、DOCX 6,328,490 bytes；PDF 渲染一页视觉检查、正文抽取、DOCX ZIP CRC/正文读回通过；五项未知保留。复制邮件实际 clipboard 读回。`recommendation-v2.*`、`copied-email-body.txt` |
| 匿名分享与撤销 | 无 cookie 读取推荐稿及唯一选中 CV；未选 JD 404、私有邮箱不在公开正文、no-store/noindex。UI 撤销后页面 200 显示 unavailable，不再含候选人正文；附件 404。`share-anonymous-before-revoke.json`、`share-revoked.json/.png` |
| 实际成本额度 | chat/assessment/draft/revision 真实 provider 成本入账，导入跟随整理不重复扣费，reserved=0。本地旧 Sandbox 订阅显示 3000/月、已用 7.72。生产只读显示试用 200 已于 Oct 6 到期，剩余 0；套餐 $49/月、$490/年、3000/月。`browser-ledger-readback.log`、`billing-*-final.png`。这不是新付款证据 |
| 保存状态修复 | 初次真实 UI 曾提前写已保存，已保留失败截图。最终 Harper Finch 对话 `c1cf2fe6-b5fe-4811-9c78-0f13e99455ad` 先说正在整理，随后实际结果卡显示已保存 1 人；候选人 `7dc56089-2931-4f71-85d2-9df80959341b`。`save-status-release-candidate.png/.txt` |

## 验证命令及边界

单元 `npm run test:unit`：349 个，347 pass、2 个显式 skip、0 fail；不能当真实服务验收。最新源码 `npx tsc --noEmit`、`npm run lint`、`npm run build` 均 exit=0。证据 `unit-final.log`、`typecheck-release-candidate.log`、`lint-release-candidate.log`、`build-release-candidate.log`。

隔离空数据库 `hirelix_workspace_qa_acceptance_20261007` 从本地 schema-only 创建，使用 PostgreSQL 15 匹配版本工具；没有复制生产数据。先前 pg_dump 18 与 PG15 的 transaction_timeout 不兼容失败保留，不能当应用失败。

真实服务测试使用 `DATABASE_URL` 指向隔离库、`WORKSPACE_REAL_AI_TEST=true`、本地 `PROXY_ENABLED=true` / `PROXY_URL=http://127.0.0.1:7890`，通过 dotenv 加载本机凭据（凭据未入 Git），运行 `npx tsx --test --test-concurrency=1 tests/integration/workspace-{assessment-recovery,batch-intake,credits,document-audience,document-sharing,email-delivery,jobs,retrieval}.test.ts`。

最初串行运行 12 pass、1 retrieval cancelled；此取消没有包装成成功。其余覆盖真实 PG 队列租约/重试/owner 隔离、真实 AI 评估恢复、混合资料处理、权限、成本记账及受控失败退款。邮件测试的 provider seam 仅是 mock regression，不是实际 Gmail 发信。退款验证包含刻意诱导的 handler 失败，不代表生产自然故障。

最后单独运行 retrieval：1/1 pass，156,220 ms，130 个真实嵌入样本加较早目标共 131/131 indexed，返回 QA Maya Chen，source 与 owner 隔离均通过。`retrieval-complete-final.log`。原先 180 秒全链路测试预算不足，provider 单次超时/重试仍保持原值；另一次曾超时但最终 245 秒完成，不算通过。最新保存状态混合批次真实回归 1/1 pass，`save-status-release-candidate.log`；完整批次此前 3/3 通过，`save-status-real-final.log`。

签名 billing integration 2/2 pass：本地真实 PG + 人工构造已签名 Paddle 事件，不是本轮 Sandbox 或 Live 支付。`signed-billing-local.log`。本轮没有重做真机、自然时钟、offsite 恢复演练、支持邮箱收信及生产故障 UI 重试；对话返回恢复实际已验，失败恢复另由真实队列测试覆盖，两者不混为一个完整 UI 链路。

## Google/Gmail 排障结果与剩余项

独立项目 `Hirelix Production` / `loyal-glass-510417-t9`，client `639029848396-8jeiptd9uu24gnku3pca74o1jteskl2b.apps.googleusercontent.com`。Chrome 实际 Connect Gmail 请求包含该 client、准确生产 callback、basic scopes + gmail.send、offline/consent。当前品牌已验证并显示给用户，data access 未验证。Google 的提交页面明确缺少 scope justification 和 YouTube video，Confirm 不可用；本轮没有保存审核表单或提交审核。英文文案与录制脚本见 [Google 审核包](../ops/google-oauth-review-2026-10-07.md)。

实际新授权到达 Google unverified 警告，已要求本人处理警告与敏感授权。后续读取标签页时已返回文档且 URL 含 `error=state_mismatch`。再次只读检查 linked account 仍仅 email/profile/openid，没有 gmail.send。随后查到 Vercel 原始诊断 `State mismatch: State not persisted correctly`：发起时间 20:38:57.924、回调 20:53:05.991，相隔 848.067 秒，超过 better-auth database state Cookie 的 300 秒及 payload 的 600 秒有效期。已确认原流程过期。Chrome 控制超时后停止重复交互，未尝试绕过警告或重放 callback。

自测文档 `d612a9e8-f057-43c1-bc1a-3378525bf3c1` 仍只含验证文本、无候选人及附件，收件人为已授权 owner 本人邮箱。本轮随后重新 Connect Gmail，本人及时完成敏感授权，正常回跳。生产 UI 发件人可用并真实发送一次；21:06:47 本人邮箱收到 matching subject/body，Gmail message `1a11679402b5cb00` 同时具有 SENT 和 INBOX，Gmail Received header 标明新项目号 `639029848396`，无附件。见 `gmail-resolution.json`、`gmail-independent-sent.png`。连接问题已解决。旧客户端成功证据与含无关桌面内容的旧 MOV 均不替代本轮验收。

剩余步骤：合格英文录像、断开/重连及新客户端普通登录的独立验证。已完成自测勿重复发送。在受控单窗口英文录制中完成全程后审阅视频，再上传 unlisted 并补齐审核字段。录像前避免无关邮件、凭据和个人桌面入镜。Google 警告及安全敏感访问扩展的本人处理要求来自 Computer Use confirmation policy，并非未经证实的产品故障。

代码发布应另获授权后执行，因为 main push 自动部署。发布后须对确切新 SHA 重做生产 smoke；当前生产与本地修复不可合并宣称完成。Oct 1 的收费放行标准继续有效：历史真实 Sandbox + 检查 + 配置核对，无需先购买一笔 Live 月付；首个自然 Live 交易仅为后续运营观察。

## 授权过期恢复修复

本轮另修复交付面板忽略 OAuth error query 的问题：回跳自动回 Gmail 页签、显示过期/未授权原因并保留 Connect Gmail 重试入口；成功回跳同样返回 Gmail 面板。关闭时清理回跳标记。保持 better-auth 状态 Cookie、PKCE 和 CSRF 校验不变，不延长或跳过安全检查。TypeScript、lint、production build 验证日志为 `*-oauth-recovery.log`。修复仅本地，连接本身通过重新有效授权在现有生产版本恢复。

恢复入口提交 `b4585bc`。本地最新 build 已启动 localhost:3200；打开错误回跳 QA URL 后 Chrome 状态读取超时，因此该新增恢复提示尚无完整 UI 验收，不把构建通过算作提示已显示。生产连接及发送的可见结果已独立截图确认。
