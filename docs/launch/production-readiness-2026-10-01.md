# Hirelix 生产上线验收（2026-10-01）

2026-10-07 增量结果见 [独立验收与 Google 交接](acceptance-2026-10-07.md)：新增资料整理、评估、推荐稿修订/导出/分享撤销、真实成本及大库检索回归已验；本地修复尚未部署。独立生产 Gmail 最初因授权流程过期出现 state_mismatch，重新及时授权后已完成真实自发自收；合格录像和 sensitive-scope 审核仍未通过。本文 Oct 1 的历史生产 OAuth 和 Sandbox 证据不能替代新客户端验收；收费放行决定仍保留。

本轮目标：交付可接收首批真实付费用户的 Personal AI Agent。工作预算约五小时，从北京时间 2026-10-01 04:30 开始。时间耗尽不代表完成。

## 最新收费放行决定（2026-10-01）

用户明确决定：无法进行真实生产付款测试，本轮以真实 Sandbox 收费链路通过、代码检查通过、生产配置与部署核对通过作为收费放行标准。**不再要求用户先购买月付，不再把缺少 Live 首笔交易作为收费上线阻塞。** 此决定覆盖后文历史记录中相反的付款前置要求。

证据事实保持不变：Sandbox 成功/拒付、真实签名回调、权益与继续 AI 已验；Live 配置、价格与结账入口已核对；Live 扣款/回调/权益/门户尚未实测，在首笔自然产生的真实交易时观察。没有宣称 Sandbox 等于 Live 实测，没有执行真实付款、手动补额度或修改共享商户。

收费技术放行按此标准通过。共享 YieldMirror 品牌、支持邮箱收件与真机时间控件保留运营/设备验收交接；未将这些未知项写成已验证。日期修复的真实 PG/模型/Chrome 自然触发与导出已通过，代码已发布；生产下一次正常任务时观察，不以为 QA 购买额外订阅为前提。

## 发布基线与授权

- 开始时本地 `main` 无未提交改动，HEAD `8d363f7b6009d0471005655acbada3128542e9c3`。
- VPS `/opt/hirelix` 同一版本，无本地改动；PostgreSQL 与 `hirelix-scheduler` active，scheduler enabled，Restart=always。
- 用户已授权修复、隔离 QA、真实模型验证、中文提交、检查通过后的生产部署、备份与兼容迁移、Hirelix 服务重启及必要回滚。
- 实际付款、付费 Bright 召回、对外发送、真实数据删除、破坏性迁移及共享商户/其他产品变更不在授权范围。
- 证据目录：本机忽略目录 `output/launch-20261001/`。敏感信息不进入本文或 Git。

## 验收矩阵

所有状态初始为未验证；历史证据只作为线索。最终证据需绑定发布版本与运行环境。

| 要求 | 必须取得的证据 | 当前状态与边界 |
| --- | --- | --- |
| 新用户入口/OAuth | Chrome 首页到真实 Google 回跳 | 本地空工作区及生产实际 OAuth 已验，见 11/25/35；不宣称两 fixture session 是两次 OAuth |
| 文件导入/持久化 | 预览、审阅、去重、刷新、原文件回读 | CSV/PDF/DOCX/TXT 本地已验；生产 CSV/PDF CV/TXT JD、实际 SHA 下载、合并单来源已验，21/22/35/36/43/44 |
| 职位/真实助理/JD 判断 | 正确对象、来源、持久结果、独立 JD | 本地两 JD 与 131 人旧档案召回；生产双人比较 done/1、来源/未知状态正确；24/44；不代表真实猎头认可 |
| 两类客户材料 | 编辑、修订、历史、复制、生产下载渲染 | Submission/Search update 生产 v1/v2/v3、Copy 成功、PDF 及约 6.3MB DOCX 已验；46/47；原 CV 单独下载 |
| 反馈/历史依据 | 审阅保存、准确日期、原 JD/旧材料不变 | 生产反馈 v2、旧材料 source Role v1；QA 逐人反馈关联两个对象与原时刻已验；18/47/55 |
| 故障与恢复 | 模型失败/断网/worker重启/租约/计费 | 本地真实 provider 失败返还、Offline 重试、自然租约到期恢复、单消息/额度已验；26/27；生产 index 重试后 36 done，51 |
| 定期草稿 O04 | 时区/DST/暂停/幂等/恢复/实际执行 | 本地 PG/模型及自然时钟已验；生产自然任务 done/1、一额度/一通知、暂停已验；正文 UTC 跨日错误已复现，9140205 已修复并发布；本地完整复验通过，生产下一次正常生成时观察，见最新放行决定；48/49/54 |
| 桌面/移动端 | 核心交互和明确状态 | 桌面核心闭环已验；Chrome Mobile touch 附件/发送/刷新/导航/约定保存/复制/下载通过；原生时间输入在 touch 模拟无响应，Desktop narrow 可输入，真机时间控件未验；50/54 |
| 试用/额度 | 并发/到期/退款/历史可读 | 显式 PG 1/1 无 skip，21 并发仅20；到期 HTTP10已有对象/导出可读，新AI402；26/32/34 |
| Paddle Sandbox | 实际成功/拒付/签名回调/继续使用/门户 | 当前 Sandbox Chrome 实际拒付→成功→3 webhook200→active/300→真实AI/299，门户表单及取消审阅已验；未执行改卡/取消，32/33 |
| Paddle Live/品牌 | Sandbox真链路、代码检查、Live配置和部署核对；首单后观察 | 按用户最新收费标准放行；未有 Live 交易实测，首笔自然交易观察；共享 YieldMirror 商户保留运营交接；7/31/33 |
| 数据安全/存储 | 两账户权限、鉴权、文件大小/私有访问 | 42 HTTP＋13新增 schedule/notice 请求通过，数据存在 PG bytea；生产实际 Vercel大下载已验；12/46/47/49 |
| 备份/恢复 | 实际 dump、隔离恢复及文件校验 | 生产迁移后新 dump 恢复47表/5文件、六新增列、约定/草稿/额度，哈希错误0；53/56；同VPS，不宣称异地DR |
| 健康/服务 | 常驻/自启/停止消费可发现 | 各 service/timer active、enabled；停机漏报修复后 status3/恢复0已验，新增逾期约定SQL隔离探针通过；38/49/53 |
| 公开说明/支持 | 真实边界、价格、隐私/条款、删除联系 | 页面实际渲染/mailto正确，价格维持；support邮箱收件未证明，需运营确认；16/17 |
| 发布 gates/生产版本 | 四个命令、真实PG/模型、精确SHA | 9140205 四项 gates 与 CI/CD/Vercel/VPS 通过，最终真实 PG/模型顺序回归 4/4 无 skip；57/58；53/54 |

## 当前进展、缺陷和下一步

1. 已确认应用文件存放 PostgreSQL `bytea`，下载走流式响应；需要 HTTP 和生产实际下载验证，不能只靠代码判断。
2. scheduler 入口同时启动 search scheduler 与 private workspace worker。继续核对队列实际消费、租约恢复和故障识别。
3. 本地存在多个历史 QA 数据库；本轮建立独立库，避免将 schema 漂移和历史测试状态当成本轮结果。
4. 初始基线 `8d363f7`：typecheck、lint、build exit 0；unit 339 通过，1 项未启用的 PG 集成跳过（另行启用已通过）。GitHub Vercel Production deployment `6752313582` 对应同一 SHA；CLI 未登录，不能据此宣称 Vercel 配置已复查。
5. 已修复部署脚本：失败立即中止、服务器有改动时拒绝覆盖、部署本次 CI SHA、串行发布。提交 `cd08901`，尚未推送。
6. 本轮隔离库 `hirelix_workspace_qa_launch_20261001`：18 项实际集成首轮 16 通过，1 超时、1 失败。失败分别是 Node 环境未启用本机代理造成 embedding 请求超时，以及 Submission 测试 fixture 缺少当前 schema 的语言/本地日期字段。保留首轮失败日志；修复 fixture 并显式配置本地代理后，正在复验，未删除断言或放宽超时。
7. 生产只存在 free 账户，未发现 Live 付费订阅。Chrome Live 月付入口可打开（49 USD/月，税费由真实地区决定），尚未付款。已请求用户自行付款或提供已有 Live 测试订阅。收银台仍显示共享商户 YieldMirror；没有修改商户。
8. 新生产快照 `/var/backups/hirelix/prelaunch-20261001-2038.dump`，49,505,957 bytes，权限 600。恢复到仅管理员可连接的 `hirelix_restore_qa_20261001`：47 张表，private jobs 16、private files 1、people 2、roles 68；文件字节长度与 SHA-256 检查零错误。生产队列当时共 16 项，全部 done。
9. 已实现并实际运行 daily backup 与服务/队列/备份健康检查脚本：`daily-20260930T204140Z.dump` 49,505,957 bytes，检查通过，systemd 单元语法检查通过。定时器尚未安装；待发布对应脚本后启用。备份同 VPS 存储，不宣称具备异地灾难恢复。

10. embedding 与多人 Submission 集成复验 2/2 通过（真实 PG、真实 embedding）；生产 VPS 最小 embedding 探针返回 1×1536 向量，约 25 秒。代理配置只用于本机，未改变生产网络配置。
11. Chrome 本轮已完成：真实 Google OAuth、空工作区、CSV 附件→真实模型导入草稿→字段确认→逐项保存两位虚构候选人；刷新保留附件与结果，导入与索引不重复扣费。已建立 QA VP Product 职位并关联 Morgan。浏览器实例中的虚构样本不代表真实客户价值认可。
12. 两账户实际 HTTP 检查 42 项通过：候选人、ZIP、职位、文件、记录、对话、任务、材料、PDF、版本均本人 200／他人 404／未登录 401，跨账户修改 404；billing、内部 API、webhook 和过大上传按预期拒绝。`http-isolation.log`。计数以 42 条请求记录为准，初始脚本汇总文字误写 44，已更正。
13. Chrome 暴露多人比较缺陷：`Morgan Reed, Taylor Park` 被当作单个精确查询，0 命中；SQL 确认两人都已保存。修复为模型输出独立姓名数组后逐一查询，真实模型回归找到两人且隔离其他账户同名资料；Chrome 复验已同时找到两人、显示两套来源、按 JD 区分产品与财务经历，未假设兴趣／授权。修复提交 `3f6b941`。
14. 补齐 workspace job 的失败／丢失租约日志，仅记录 job_id、kind、attempt、error_type，不记录 provider 消息或源资料。实际 PG 错误→安全页面状态→同 identity 重试完成，3/3 队列检查通过；日志不含测试的敏感 payload。

15. Chrome Submission `591c0a6f-4ac8-4b87-9db9-6f9fed36dc77`：选择 Morgan 的 recruiter note（未选择 CSV／JD record；role 自身 JD 仍在上下文），真实模型生成，编辑标题自动保存→真实修订草稿→审阅→接受，历史保留 v1/v2/v3。复制正文显示成功；Chrome PDF 1,637 bytes、DOCX 6,328,242 bytes 下载完成，分别渲染一页并逐页目视无裁切／乱码，内容包含正确经历、未知状态且不含邮箱。该草稿未选择 CV，因此不据此声明 CV 附件链路通过。截图渲染在 `submission-pdf-1.png` / `submission-docx/page-1.png`，实际下载在用户 Downloads。
16. 修正公开说明与当前数据处理不符：隐私页纳入 CV、笔记、对话、版本及 DeepSeek／OpenRouter／SiliconFlow，区分可选 research 服务；条款更新产品实际范围与人工审阅／无自动发送的事实，保留既有商户与价格／退款条件。设置增加支持、隐私、删除请求 mailto 入口，明确人工核实处理、无自动删除按钮。域名 MX 指向 Zoho，不能由此证明 support 邮箱收件可用；需用户／运营确认。相关 provider 原始页面已读取：https://www.paddle.com/legal/privacy 、https://openrouter.ai/privacy 。不作法律合规结论。

17. 公开说明修复 `1f6e225`：Chrome 隐私页和设置实际渲染、支持 mailto／政策链接正确；已通过 typecheck／lint。支持邮箱收件状态已向用户询问，未擅自发邮件。
18. 反馈日期缺陷：`update_role_brief` 接受时硬编码 occurred_at=null。修复 `6675f9c` 将模型提案中的明确时间带入审阅，提供发生时间输入，按审阅值保存；只有日期、无确切时间时仍不猜测时区／时间。Chrome 反馈 `2026-10-01T04:45:00+08:00` 审阅显示 04:45，保存后 SQL 为上海 04:45，绑定 role v3。未知日期、跨账户和陈旧版本回归保留；本轮 assistant+foundation 11/11 通过，含真实模型。
19. Search update 首次 Chrome 结果 `6caeef0f-1007-47f3-91f0-a751da9a773a` 存在质量缺陷：把“未记录”说成“未发生”，并重新质疑已确认薪酬。已修正 prompt，真实模型测试 `workspace-search-update.test.ts` 比较无活动记录／选中反馈两种情况通过；Chrome 新任务 `83974d73-34c9-44e4-87b4-9c1e081141cd` 选中 v3 反馈、报告 9/30–10/1，复验通过，新报告 `76fcb824-8cf6-4876-801c-70d1248559f7` 正确记录选中反馈、165,000–180,000 薪酬、v3 来源与未知授权；修复提交 `3db0713`。导出和后续编辑待验。不得把首轮报告当验收成功证据。
20. 截至 06:00 当前已提交 main 比远端领先 12 个提交，尚未推送。typecheck／lint 最新通过；unit 339 pass/1 skip，实际 PG integration 另行启用通过。date/prompt 最新变更后 production build exit 0。任何本地结果都未替代最终生产复验。

21. PDF CV 与 DOCX CV 使用明确标记的虚构 QA 样本，真实 Chrome 上传、真实模型提取、合并已有候选人并保留原记录，文件 SHA 与实际下载一致。Morgan PDF 首次暴露重复保存建议：导入 review 和 assistant add_record 同时存在，接受两者可重复 source。根因为 assistant 仅禁止新候选人的 add_record。修复 `dc48993` 在导入草稿期间统一由 import owner 保存来源；真实模型＋PG 幂等接受回归 1/1、Chrome Taylor DOCX 合并后仅一个 CV source。保留首次错误样本作为复现证据，未删除断言或真实资料。
22. Taylor DOCX 与 Morgan PDF 实际打开／渲染一页，视觉可读。Submission `b569d77d-24d9-4604-ae27-5162ab928616` 精确选择 Morgan PDF，未选 Taylor CV 或私人笔记；原 CV 单独下载，SHA-256 一致。已有材料导出验证不能被替代为 CV 内嵌导出；界面明确分开。
23. 修复后的 Search update `76fcb824-8cf6-4876-801c-70d1248559f7` 已实际编辑、模型修订接受、刷新重开、PDF 1,641 bytes／DOCX 6,328,221 bytes 下载，各渲染一页目视通过。复制按钮已点击，独立成功提示未观察到，复制验收暂不算完成。
24. 真实 Chrome 导入第二个财务 JD 建立 QA Southbank Finance Director `779879c4-e6bd-4d7e-9cd7-f0332452d536`。SQL 角色 JD 与 TXT 文件原文相等，产品职位 v3 未变。真实比较明确 Taylor 的会计／财报／税务和 8 人团队更符合财务职位，Morgan 产品证据不足，引用两人 CV 和正确 JD，不作全局候选人好坏标签。
25. Chrome Sign out → Google OAuth → 返回原工作区，SQL 确认新 session，两候选人及 DOCX CV source 可读。393×600、100% Chrome 手机宽度下发送、失败提示和重试实际操作通过；尚不声明真机验收或所有触屏路径通过。
26. 隔离 QA 使用无效测试 key 请求真实 DeepSeek endpoint，job `352fe32f-16a2-4ad8-b1ec-8f36c425c081` 进入 error，额度 4→5 返还、页面可重试；安全日志仅记录 DeepSeekApiError，无 provider payload。Chrome Offline 点击重试显示 Failed to fetch，DB 没有新消息／计费；恢复网络，同 job 重试完成，仅一用户消息、一回复和一次额度记录。生产配置未修改。
27. worker 停止时新 job `7e9f957e-c2e7-4755-ad13-38f22ae395a4` 排队，重启后完成。下一项 `f6f4725c-15d2-43c4-906d-f4816d8dbdda` 于 06:01 被领取后立即停止进程（exit 130），DB running/attempt=1，租约至 06:03:09；新 worker 已启动，06:03:09 自然到期后第 2 次领取，06:03:58 已 done。SQL user_messages=1、assistant_messages=1、usage_rows=1；Chrome 刷新结果可读、2 tasks 剩余。证据 worker-interruption-recovery.log。未人为更改租约。
28. `99294ad` 首批用户英文工作流程说明已保存。最新代码检查：typecheck-cv、lint-cv exit 0；unit-cv 339 pass/1 显式 PG skip（另行实际启用已通过）；build-cv exit 0；cv-import-owner-recheck 1/1 实际模型＋PG 无 skip。首次只加载 .env.local 缺少 key 的失败日志仍保留。

29. 发布提交 `9ea8331ccd9c8cb835156bdf89740d13483f59db` 已推送 main。GitHub Actions `36783812497` build-and-test／deploy-scheduler 均 success；Vercel Production deployment `6771261787` success，对应同 SHA，URL `hirelix-flp3moqxo-noahs-projects-292679b9.vercel.app`。生产域名仍 hirelix.online，VPS 实际 git SHA 一致、工作区干净、scheduler active/running、NRestarts=0；此时队列 16 done。尚未因此声明核心业务生产复验完成。
30. 生产 backup／health service+timer 已安装、enabled/active。实际 daily 备份 `daily-20260930T221306Z.dump` 49,506,261 bytes 成功；health 手动及后续定时均 Result=success/exit 0。证据 production-timers.log、production-version-health.log。不提供主动外部告警，只通过 systemd failed/journal 识别故障；异地备份仍无。
31. 本轮显式启用 `AGENT_BILLING_INTEGRATION=true`：agent-billing-enabled.log 1/1 pass、0 skip，实际 PG 21 并发只接受 20、退款／重试、到期、签名鉴权、重复和乱序事件通过。这里事件是自建签名 fixture，不是 Paddle 平台回调。
32. 本轮当前候选真实 Sandbox：Chrome Test Mode 49 USD/月、官方拒付卡显示 declined，DB subscription_status 未开通；官方成功卡完成交易，实际收到 subscription.created、subscription.activated、transaction.completed 各一次，原始签名透传、应用返回 200，DB active，自动回跳页面 300 tasks。真实 worker 任务 `9ea115ad-c10e-44ad-81da-6578d12afbb5` 完成、一次 usage，Chrome 299 tasks／正确 JD＋CV 来源。证据 sandbox-decline-db.log、sandbox-success-db.log、sandbox-paid-use.log、sandbox-webhook-proxy.log。不是 Live 扣款。
33. 当前 Sandbox 订阅通过 Hirelix 入口实际打开门户，详情与产品正确，付款方式表单及取消前审阅可打开；未实际更换卡或取消。共享门户仍 YieldMirror。复用了原 Hirelix 临时 QA destination，更新地址与描述后启用；验收后已确认 Inactive，cloudflared session 13728 exit 0、proxy 60145 exit 130，其他通知未改动。官方测试卡来源 https://developer.paddle.com/sdks/sandbox/ 。不记录门户会话 URL 或密钥。
34. 到期隔离 HTTP 复验：人工设置 PG 试用开始八天前的 fixture，10 个本人已有资源／PDF 导出返回 200，新 AI POST 402、job 数不增加。http-expired-access-recheck.log。首轮计数断言错误假设只存在一个 index job；createPerson/addRecord 自动索引实际共四项。已改为请求前后计数相等，保留首次失败，不删断言或隐藏访问。

35. 本轮生产重新从首页经真实 Google OAuth 登录，session 最近创建计数为 1，受控运营测试账户 ID `8ad2bad7-d8fe-4207-83a8-b6bce553b739`。只新增明确 Fictional production QA 资料，不修改原候选人或职位。CSV 导入对话 `68b65de7-9005-47e1-a1ff-d63372afd2a5`、chat `b4b8aeb5-9f16-4395-ab6c-8cd706d98d1e`、import `b3f24f94-4c12-4de3-b27d-98ad75479350` 实际生产 done/attempt 1。两候选人经字段映射／逐项确认保存，ID Product `75b63d7e-d9e6-4eed-b8b9-71e024ef4245`、Finance `fc9a97d4-1767-4629-affc-7c0a01f4f071`。文件 `6190dab6-7a64-4e5e-81ea-4376cbcfaeb6` 533 bytes，Chrome 实际下载／本地源文件／生产 sha256 均 `059c796a1153112fcc1d8675b35f793ced37d08dc5d48b2eec6b9f7b787a6550`。
36. 生产 TXT JD 经真实模型提案、字段审阅保存为职位 `93d92ef2-046e-4d59-9fea-a864994b49d1`，对话 `be840c29-608a-420d-b47e-237e3d6aaa37`、chat `b21abe2b-e4f8-4aba-8f91-dce2a6a4aa5a` done/1。QA 职位名称、客户、原文及 165,000–180,000 已确认薪酬正确。PDF CV 上传 `da3b1aef-6ef8-4daa-964c-55d26fca8d57` 1,876 bytes、SHA `ac4413f88e91109eddf483781ab0fc18031345700cdeaf407748f5a3bed20471`，对应对话 `88f3913e-6c3e-4ee3-ac35-9b2d50970c7c`，chat/import 均 done，合并审阅尚未接受。
37. 生产故障探针首次发现 health 漏报：停止 scheduler 后 health 仍返回 success，trap 已恢复服务。根因 `systemctl is-active --quiet postgresql hirelix-scheduler` 任一 active 即返回成功。最小修复逐项检查，2 项 shell 行为 mock regression 通过；typecheck/lint/build exit 0，unit 341 pass/1 PG skip（实际 PG 已另启用）。保留 production-health-fault.log 首次失败。提交 `3e804b9` 已发布，CI `36787314112`、Vercel deployment `6771816384` 对应同 SHA 均 success。
38. 修复后实际生产再次停止空闲 worker（明确确认无 queued/running，trap 保证恢复），health Result=exit-code / status 3；恢复后 Result=success / status 0，scheduler/PostgreSQL/backup.timer/health.timer 全 active。production-health-fault-recheck.log。测试仅暂停 Hirelix 自己的服务及其 health timer，其他服务未停；定时器已恢复。
39. 生产首个 CSV 上传及带首页登录追踪参数的 PDF 上传后出现新对话未自动打开：后台 done，页面仍新建对话；历史链接键盘打开可恢复完整结果。干净 `/app` 上传 JD 自动进入新对话成功。此问题并非数据丢失，但妨碍首次核心使用。隔离 production build localhost:3200 + 同一 QA PG/Cookie 复现附件新对话问题（对话 `52af29e1-5c6f-413a-ac0e-1f3959883166`，URL 留在 `?entry=signin`）；3000 dev 同 entry 的纯文字正常。尝试改用 useSearchParams 后 production build 仍复现，已撤回该无效假设。Chrome Network 确认提交 JSON 返回正确 conversation_id 且 200；正在定位附件与纯文字提交在父组件 handoff／路由更新上的差异，最终浏览器复验及发布待完成。不要把恢复后可读当作自动跳转已通过。

40. Chrome 请求检查时意外输出了隔离 QA 的 session Cookie；立即在隔离库过期该用户现有 session，确认有效 session 数为 0，再经真实 Google OAuth 重新登录。生产 session 未受影响；没有将凭据写入 Git 或报告。后续只查看响应正文，避免展开请求鉴权头。

41. 附件导航定位：临时浏览器执行标记确认 response processed、onOpen entered/returned、branch finished 均实际运行，没有异常，production build 的 router.push 仍停留旧查询。仅更换 handoff、仅更换 layout 查询读取、仅更换 History API 的尝试均未通过，未将其单独当修复。最终统一 layout 到 useSearchParams，并在纯客户端对话页使用 Next 官方支持的 history.pushState 更新同路径 query；没有自建路由状态或整页跳转兜底。临时 console 标记已移除。
42. 最终导航候选 `db81c6d`：localhost:3200 production build＋QA PG＋真实 Chrome，带 entry 参数的附件＋说明对话 `29df35ac-26ba-428d-ad89-b81dbd1f0faa` 自动进入、真实回复且正确 12 人／165–180k；完整首页登录参数、只有附件的对话 `7cab73e5-2a13-471c-aa26-6fb94fca084f` 自动进入，返回旧新建页／前进恢复已保存回复；纯文字 `ec78713d-0052-40b8-8767-ccf638b4ff51` 自动进入。navigation-final-real-chain.log 保存 job done/1。typecheck-navigation-final、lint-navigation-final、unit-navigation-final、build-navigation-combined exit 0；unit 341 pass/1 显式 PG skip，PG 真实链路另验。本次导航回归是实际浏览器验证，没有用源码镜像断言代替。官方路由依据 https://nextjs.org/docs/app/getting-started/linking-and-navigating#native-history-api 。生产复验待发布。

43. 导航候选最终发布 `44a6f1fce11d443fdef5bdd65edc4a725d75e8e0`：CI/CD 36791131014 build-and-test＋deploy-scheduler success；Vercel deployment 6772408965 success，URL hirelix-2l6xz215v-noahs-projects-292679b9.vercel.app；VPS 当前 SHA 精确一致、工作区干净、四项 Hirelix service/timer active。发布前 daily-20260930T232612Z.dump 49,555,005 bytes，backup Result=success/status 0。生产完整首页参数 CV 提交自动进入 `d94dcfd1-487b-4e30-a211-3fc391754aac`，job `6a34ff74-3267-405e-93d7-7135c5f77185` done/1。真实模型识别重复资料且没有新保存建议；PG 候选人仍 cv/note/profile 各 1。证据 production-navigation-version.log、production-navigation-recheck.log（最后附带 jd 字段名误读失败；核心状态已输出，正确原文比对在 production-role-link.log 为 true）。
44. 生产 CV 原导入通过逐项合并审阅保留 Product Director 与私人备注，原 CV 唯一 source `c27981da-80c5-49e7-8f17-c34c8d01268b`，production-cv-merge.log。生产真实 JD 双人比较对话 `7fc22ff0-cfce-41d0-9b79-7928ed1cddaf`，job `b1401f12-8255-4078-9aad-0c248120ccab` done/1：明确产品部门 12 PM／B2B SaaS 与财务 8 会计的区别、正确引用职位和各人记录，当前状态／hybrid／薪酬期望／兴趣／分享许可保持未知，没有发送。
45. 通过 Chrome 把 Product 候选人关联到 QA 职位，PG permission=unknown、interest 空（未知），没有确认授权。推荐准备页精确选择 production-cv.pdf，四个可选笔记均未选；材料语言 English，生成指令明确 Fictional production QA、未知意向／授权、不含联系方式／私人笔记、不发送。生产实际生成任务已启动，后续验收见第 46 项。

46. 生产 Submission `d4330b09-813b-4429-8caa-e73f324a8d5e`：Chrome 编辑标题自动保存 v2，真实模型修订提案确认完整正文后接受为 v3，状态仍 draft（未发送）。修订明确 Fictional QA、London 并不确认 hybrid 意愿、兴趣／授权／薪资期望未知。最初 AX 文本截取只显示到 T，但 PG result 是完整句子；用真实输出核对，未把 AX 截取误报为模型截断。production-submission-revision-first.log、production-submission-saved.log 保存 v1/v2/v3、record_ids 空、选中文件 1、source.role.version=1、正文没有 example.test 邮箱。Chrome 复制正文显示“正文已复制”；版本历史实际列出 1/2/3，展开 v1 可读初始标题／正文，刷新重开仍 v3。线上实际 PDF 2,452 bytes、DOCX 6,328,659 bytes 下载完成（Downloads/Fictional production QA — VP Product candidate review），均渲染一页并目视无裁切／乱码，正文及未知信息对应；production-submission-pdf.png、production-submission-docx/page-1.png。大 DOCX 实际通过 Vercel 下载，不能把本地导出代替这一结论。推荐材料的原 CV 单独下载 SHA 与上传文件均 ac4413f88e91109eddf483781ab0fc18031345700cdeaf407748f5a3bed20471，不宣称内嵌在 PDF／DOCX 中。

47. 生产反馈于上海 07:40 保存：role `93d92ef2-046e-4d59-9fea-a864994b49d1` v2，feedback `b1e69331-99d4-4cc3-b8d4-16fb1ce1325f`，原 JD 保留。Search update `edca55ab-370a-410e-8dac-47bc7d87d16d` 初稿仍有无依据的“未联系/未推荐”断言，保留 production-search-update-first.log；强化通用证据范围提示，真实 PG＋模型回归 search-update-negative-recheck-2.log 1/1 通过。Chrome 编辑→真实修订→接受 v3，正文正确保留 165–180k、12 PM、London 两天 office 与未知状态，Copy 显示 Copied，历史 1/2/3、刷新重开均通过。生产 PDF 2,324 bytes／DOCX 6,328,597 bytes 下载并各渲染一页目视通过，production-search-update-pdf.png／production-search-update-docx/page-1.png。旧 Submission 仍 source.role.version=1；证据 production-feedback-search-update-history.log。
48. O04 既有规格中的定期草稿缺口已实现，复用现有 schedules/jobs/notifications 表及 worker/billing，不自动发送。支持周/双周、IANA 时区、DST、选定人选、显式选择日期记录、暂停/恢复、错误重试和仅变化通知。兼容迁移 20261001_scheduled_workspace_drafts.sql 已应用隔离 QA，生产尚未应用。schedules-real-isolated.log：实际 PG＋模型 3/3，无 skip，覆盖原子并发、单草稿/单额度/单通知、失败恢复、到期拒绝、未知权限、DST/延迟/双周相位。早期 fixture/SQL 类型失败日志保留，未隐藏失败。
49. 本地 Chrome 自然时钟 08:13 触发 job `897fbc0a-e48c-4680-90f9-3bf3b0158df0` done/1，draft `ccc503eb-879c-4a11-b6d1-b901b2357f90`，一 usage、一通知；实际打开草稿、暂停约定、Mark as read 移除通知。schedule-natural-local.log。两隔离账户新增 13 条真实 HTTP 检查和通知列表隔离断言通过（http-schedules.log）；签名 session 为测试 fixture，不替代 OAuth。health SQL 真实事务中的逾期约定=1／暂停=0，ROLLBACK，不影响 worker 或真实资料（schedule-health-real.log）。
50. Chrome 393×618、100%、Mobile touch：附件＋文字提交、自动进入新会话、真实回复、刷新重开通过；job `4c89e1c8-a60a-459d-80f8-475b981102ac` done/1。菜单→Roles→职位→Activity→Edit agreement、表单滚动与保持暂停的保存实际操作通过，页面无裁切。mobile-production-build.log。此为 Chrome 手机模拟，未声称真机键盘或全部手机路径通过。
51. 生产最终审计发现两个此前 index 错误，实际页面 Retry 后均 done/1：314cd0a8-ea04-466a-b759-0c0887992ac1、fc28e0da-8e4d-460a-8d9a-041e38f67e65。历史仅 TypeError，精确网络根因未证明；当前 VPS 实际 embedding 探针成功 1×1536、32.4 秒（production-embedding-current.log）。adb4b7b 在实际 provider owner 增加受限 cause.code 日志，不记录消息/headers/源资料；2/2 provider regression 通过。生产最新 36 done、0 error、0 schedules（production-final-preflight.log）。
52. 新候选发布 gates：typecheck-final-release.log、lint-final-release.log、build-release-commit.log exit 0；unit-schedules-release.log 341 pass/1 显式 PG skip，真实 PG 另行启用且上述 3/3 通过。provider-network-code-regression.log 2/2。发布顺序：先备份，应用兼容新增列迁移，再推送确切提交，检查应用/worker SHA，最后自然时钟生产约定触发及暂停。无需新增生产 key。回滚应用/worker 至 44a6f1f，保留新增列和发布期间数据，暂停本次 QA 约定；不 drop column 或恢复旧 dump 覆盖新数据。

53. 定期草稿发布 `15a4a4357a337483d817641ed27000e15dc8f8d1`，含模块提交 5f2b9b6。发布前 daily-20261001T003658Z.dump 49,578,208 bytes、600、目录可读；迁移文件 SHA256 56068d4729311c1fbdf6572ce29a77f8e0ab647d1322469111c41ef22f517831，psql ON_ERROR_STOP 单事务新增六列成功。CI 36797146442 两 job success；Vercel deployment 6773337712 success，hirelix-kcso8u3vq-noahs-projects-292679b9.vercel.app；VPS clean、同 SHA、active/running、NRestarts=0、health Result success/status0。production-schedule-migration.log／production-schedule-version.log／vercel-schedule-status.json。
54. 生产实际 Chrome 保存上海周四 08:48 约定 44c31eda-bdab-4e9a-8f37-b4740caf34e2，profile+dated role records opt-in，私人候选人笔记关闭。自然创建 a1b63605-748c-4277-a4b2-be81346e939c 于08:48:14，done/1，draft 8d754458-c586-4f4d-b94d-3c056fc3202e、一usage/一notice，UI自动显示下周时间及站内通知，已暂停及标已读。**正文复验失败**：上海10月1日07:40反馈被写为9月30日，UTC日期被误用。失败稿/源快照保留 production-natural-schedule-result.log，不能当正文成功证据。修复为捕获 report_timezone 与每条 occurred_local_date，服务端计算报告日历日期；真实跨午夜模型回归通过。生产试用20次已用完，未手动加额度或绕过计费，已请求用户 Live 月付49 USD加税/现有Live订阅以补最终生产生成复验。Chrome Mobile touch 原生时间控件键盘/选择器无响应，切 Desktop narrow 后实际08:48输入和保存成功；不声称真机时间控件验收通过。
55. QA localhost3200 Chrome：Role paused v4→active v5→closed v6→active v7，原 JD/关联与需求保留。记录明确虚构提交事件后 b569d77d-24d9-4604-ae27-5162ab928616 submitted v3，source Role v3 保留，不存在真实收件人/发送。真实模型 job670cacd7-e488-48a7-b76a-ff5b1d709c9a done/1，审阅接受逐人反馈 c3427e93-8aeb-470d-88b9-f6856cf8d603：正确Morgan+Role双关联、上海08:47，未改全局兴趣/授权；qa-lifecycle-feedback.log。已提交材料的只读保护正确，但显示Edit draft无效入口，已修正并Chrome重开确认仅导出/复制/历史可操作。
56. 迁移后 daily-20261001T005421Z.dump 49,581,601 bytes，恢复到新 hirelix_restore_qa_release_20261001，仅管理员连接：47表、5文件、byte长度/hash错误0、6新增列、生产约定paused、jobdone/1、usage1及实际草稿均恢复；production-postschedule-restore-check.log。原隔离恢复库保留，未覆盖生产或旧库。
57. 跨日候选 gates typecheck-local-date-final/build-local-date-final/lint-date-final/unit-date-final 全 exit0；unit341pass/1显式skip。首次两个共享全局队列的集成文件被同时启动，claimJob互相领取不同fixture，date-final-real.log保留2pass/2fail。纠正执行为 --test-concurrency=1，并让schedule测试所有fixture账户都取消未完成job；只取消确认属于失败fixture的一项9af3bbf9，未改真实资料/worker。最终 date-final-real-sequential.log 顺序真实 PG/模型回归 4/4、0 fail、0 skip；不将首次失败改写成通过。

58. 日期及只读修复发布 `914020586ee60c4d3d5540a7916ddf6755059bb4`：CI 36798980810 success；Vercel deployment 6773613061 success，`hirelix-hi86q2wgp-noahs-projects-292679b9.vercel.app`；VPS 同 SHA、clean、active/running、NRestarts=0、health success/status0。production-date-version.log。生产队列37 done，无 queued/running/error；约定 paused、通知 read_at 已由 PG 独立核对。production-final-cost-state.log。
59. 费用记录：本轮生产从 UTC 2026-09-30 20:30 起，DeepSeek usage 表记录19次调用，41,083 input＋26,259 output＝67,342 tokens；这是数据库记录的 token 使用，不是美元账单，未核对供应商最终美元费用，也不包括所有本地 QA/embedding 调用。未执行真实 Live 付款或 paid Bright recall。Sandbox 为官方测试交易。

60. 最终代码本地自然时钟 QA：Chrome 保存09:10约定后，worker于09:10:05自动创建 `b803bf95-4375-4bbe-8281-acea52b30ea8`，done/1，草稿 `357afcb2-0562-4215-b63a-c2da30149786`。快照 report_timezone=Asia/Shanghai、occurred_local_date=2026-10-01，正文正确写1 October 2026、07:40，已确认165–180k与未知兴趣/许可保留。Chrome实际打开、一任务额度297→296、一notice，约定随后暂停。timezone-natural-draft.log／timezone-natural-accounting.log／timezone-usage-archive-check.log（后者usage=1，后续文件列名误读保留，不当成功证据）。自然任务未通过人工修改next_run强制触发。Chrome PDF2,338 bytes下载，渲染一页无裁切，日期/币种/正文一致：timezone-natural-pdf.png/.txt。仍是 local real chain，不能替代 production。
61. QA Chrome候选人归档实际下载 `QA Morgan Reed-candidate.zip` 6,641 bytes。CRC无错误，profile person_id正确、history7版，源CSV与PDF的byte数/SHA256均匹配PG；archive-browser-check.json。包括私人记录，未对外分享。删除仅之前隔离PG回归，未删除真实生产资料。生产Chrome最新准备页已显示“汇报时区：Asia/Shanghai”；没有可用额度时不启动新的AI生成。

## 当前继续位置

### 用户视角补充验收（2026-10-01）

本轮从猎头的工作目标出发，用真实 Chrome Computer Use 操作及截图观察，先跟随页面引导，再查日志；不以接口成功替代使用结果。环境是 localhost:3200 的生产构建、隔离 QA 库、真实模型及已有 Sandbox 订阅，属于 local real chain。账户已有两位虚构候选人，不是空账户首次使用，未发送客户材料。

- 从首页 Meet your agent 进入，用普通业务描述创建 Lakeside Search 的 VP Product 职位。会话 `3164b23a-f960-43c1-bcd3-0b8d4363d61f` 自动打开，审核表保留原文、已确认要求及未知问题。保存后页面显示 Saved to your workspace，离开进入 Roles 后能找到 `d96a3339-37d7-49a6-af09-9836e8d7a792`，返回会话仍能继续。
- 推荐给出 Morgan 的十二人产品团队和企业 SaaS 证据，区分 Taylor 的财务经历，并保留薪资期望、意愿、到岗及分享许可未知。不同客户的旧反馈没有被作为 Lakeside 的结论。下一条自然请求得到可复制的内部审核意见，离开任务页面后返回能看到完成结果。
- 通过 Submissions → Prepare submission → 选择职位 → Add from your pool → 加入 Morgan → Prepare submission，页面预选正确职位和候选人；准确选择已有 PDF CV，未勾选私人笔记。真实任务 `25f0d0cd-a038-4a09-bb03-ef6377ebc783` done/attempts=1，保存材料 `002bfea2-1cb2-4359-ac6b-7b1cbdf64a96`，展示原始 CV 下载入口、未知分享许可和 Role version 1。额度 296→293，对应三次 AI 工作，不是实际付款。
- 使用摩擦：概览点击 morgan-cv.pdf 只切到整个资料列表，首屏仍是其他客户反馈，需要继续找。已复用现有 record 查询、滚动及高亮机制，让指定来源和最新沟通入口定位具体记录。localhost:3000 Chrome 实际点击 PDF 与 CSV 两份来源后，URL、目标正文及高亮都正确；这项修复的浏览器证明来自 dev 表面。typecheck-source-focus.log、lint-source-focus.log 通过；最终发布结果另行核对。
- 输出用途限制仍存在：正式 Prepare submission 是固定的客户推荐邮件，Direction 输入“内部审核且显式保留未知状态”未改变邮件体裁；正文仍面向客户，未知许可只在来源侧栏显示。内部审核意见应在会话中准备。本轮未把正式邮件输出当作内部审核需求通过，也未修改既定邮件产品方向。这个用途边界需要更清楚的页面提示或另行讨论，而不是以任务 done 包装成全部体验合格。

上述为首次验收的结果，内部审核失败保留为修复前证据。用户随后明确要求继续定位、修复和复验，后续结果如下；这些具体工作场景不代表已经证明所有新用户、设备或真实客户的使用体验。

资料定位发布复验：初版 `bf26d69` CI 36807089959 和 Vercel deployment 6774903957 均 success，VPS 同 SHA、clean、health 通过；但生产 Chrome 点来源后 URL 未带 record，也未高亮，不能当作修复验收通过。继续定位为同路径纯客户端查询更新，改用项目已有的 Next 原生 history.replaceState 集成，保留 useSearchParams 与原有定位/高亮，不新增私有路由状态。最终 production build localhost:3200 Chrome 点击 PDF 后正确出现 record、原文、高亮，刷新恢复同一记录。build-source-focus.log、typecheck-source-focus-final.log、lint-source-focus-final.log 通过。最终生产复验仍须以该后续提交为准，初版失败截图保留在本次工具记录中。

最终资料定位发布 `5930980`：CI 36807625068、Vercel deployment 6774986902 success；VPS `/opt/hirelix` 同 SHA、clean、scheduler active、health 通过。生产真实 Chrome 点击 CSV 来源后正确定位 record `4abea2dd-7f71-41f6-b908-da2c6fb9c243`，显示对应原文并高亮。补充凭据在 `output/launch-20261001/user-perspective-receipt.json`。

材料用途修复：生成器保留默认客户推荐邮件，但遵从顶层 Direction 的明确内部审核要求；来源内容不能改变用途。用途保存在原有 JSON 快照中，修改保留用途，明确转换客户材料时才更新用途，不新增业务实体或迁移。内部审核页使用材料预览/复制标题，并避免记录为客户提交。真实模型回归覆盖默认邮件、内部审核、缩短后用途及未知事实保留、原文不提前替换、版本更新、内部 Search update 和提交拦截。另加强不得仅凭职位名称推断性别或管理范围，避免初次生成中出现的无依据 IC 描述。

Chrome 本地生产构建完整复验：通过 Prepare submission 选择 Lakeside、Morgan、已有 PDF，输入同一内部审核要求，任务 `9763cbaf-4174-4c59-89a2-b1ee28a469de` done/attempts=1，草稿 `2bb0263c-fc9e-4f08-a84d-4c03a9bdd37a` 正文明确内部用途、五项未知状态，无客户问候或签名占位。实际生成缩短提案、审核、应用后保存版本2，页面历史可展开版本1，数据库两版均为 internal、保留同一 CV。PDF 与 DOCX 均从页面实际下载；PDF 在真实 Chrome 打开，一页完整、无溢出，DOCX 文字回读保留用途、证据与未知事项。额度293→291对应生成与修改两次工作。此项是隔离库 + 真实模型的 local real chain，未发送给客户，未做 Live 付款。最终代码模型回归及构建日志为 document-audience-*-final.log，发布结果另外核对。

继续转换复验发现修改器仍会把内部提示塞在客户邮件前后，首次提案未应用、旧稿保持版本2。补充明确的推荐邮件正文规则后，实际重新生成/审核/应用：无内部前言、无 Subject 重复、无发送/审批提示，五项未知仍在候选人段落；版本3用途为 client，页面更新为 Client preview / Copy subject / Record actual submission。内部版本1、2保留，未记录虚构客户提交。最终真实模型回归同时覆盖该转换与用途保存，全部通过；四次页面AI工作额度293→289包含两次转换提案，失败质量提案未被包装成业务成功。

材料用途发布为 `10e941795836af821ae4804f302b1175786b19c1`，CI 36810516967 success、Vercel deployment 6775444934 success，VPS 同 SHA、scheduler active、health 通过。属于本地真实模型完整链路 + 生产配置/部署验收，未使用生产零额度账户伪造新生成证明。

继续用户视角检查发现中文订阅页仍大量英文：生产真实 Chrome 可复现，trial0/20，套餐价格与付款说明/订阅按钮/侧栏均为英文。修复复用 LanguageProvider/useT 与现有中文词典，覆盖侧栏、设置套餐标题、试用/已付费状态、额度、周期、月/年价格、即时付款及自动续订说明、门户管理入口。价格、权益和支付接口未改。本地生产构建真实 Sandbox paid 账户：从语言页切中文，订阅和AI用量、289/300、周期及三个门户入口正确中文显示；不执行真实修改支付方式或取消操作。试用/月年选择继续在实际生产账户发布后复验。

中文订阅页发布 `dd2e448c3e10f100123b0bcd68693c16eed2be02`：CI36811060372、Vercel6775531090均success，VPS同SHA/clean/active/health通过。真实生产 Chrome 刷新后，试用0/20、额度、月年价格、即时收款及自动续订说明正确中文；点击年付后按钮与续费文字更新为年付，再恢复月付。未点击订阅或发起交易。已订阅状态来自本地真实Sandbox账户，语言切换后刷新和设置标题也正确；QA语言偏好已恢复原英文。

继续材料内容验收发现旧稿把 brief.unknowns 中“办公室要求能否协商”的问题写成“要求可能不固定”，弱化了 brief.priorities 中已有的两天办公室要求。修复在 role owner 中定义共享证据规则，供会话、评估、生成和修改复用：已审核要求优先，未知问题不能变成事实或放宽条件，候选人意愿未知与客户要求明确分开。测试fixture同时保留明确要求与可协商性未知，真实模型不得把要求写为optional/not fixed；不是用关键词排除特定候选人。10项真实模型/隔离PG回归通过，341单测通过、1明确PG环境skip，typecheck/lint/build通过。真实模型曾一次返回invalid_json，原有真实重试后成功，未替换模型输出或绕过链路。

Chrome 已有客户邮件再次真实修改/审核/应用为版本4，任务 `d56c4692-d516-41d0-af50-abe10a3c09fe` done/1：办公室两天要求保留，候选人五项状态未知，未提示要求可能不固定。随后实际职位评估首次仍错误把伦敦居住计为整项办公室要求满足（四项满足三项）；详情虽列未知，摘要仍误导。继续加强通用复合条件证据规则，禁止部分证据计为整体满足，并加入真实模型评估回归。最终实际 Update role review 摘要正确为两项有证据、办公室仅部分有证据、到岗意愿未知、客户预算明确而候选人薪资未知；其他职位反馈未泛化为本职位许可。数据库结果及页面截图一致，额度288→286对应两次评估，保留首次失败。最终 typecheck/lint/build 与包含评估/内部材料/客户转换的真实模型测试均通过，日志 role-evidence-*-final.log。生产部署另核对。

生产真实零额度入口：中文页面提交明确虚构的 QA 消息，请求被额度规则拦截，输入内容保留、没有伪造回复；错误提示仍英文。补全原有词典中的新任务与重试两条额度错误翻译，不改服务端规则或权益。typecheck/lint/build通过，发布后再实际复验中文提示及已保存工作可读。

角色证据规则95813f5已发布：CI36812356868、Vercel6775736951均success，VPS同完整SHA、clean、active、health通过。额度文案f057a47已发布：CI36812623829、Vercel6775778165均success，VPS同SHA及健康通过；实际生产Chrome零额度请求正确显示中文、输入保留，数据库没有保存被拒的新对话。已有客户邮件仍可预览并下载PDF 2,452 bytes，文字回读保留预算、未知事实及同一人选。未发起付款。

实际 Lakeside Search update 任务a135c6c9-083a-4c78-bd74-6c4c2f6fa8f9 done/1，草稿7f20cae8-1e56-4a82-a8de-9c408a317f24：本地日期24 September–1 October正确，无选中活动时明确不能报告活动；但把 brief 中 London-based / able to work office 的斜杠缩写误解释成or。原JD明确伦敦与办公室两天，继续修复共享规则：不得从标点推断二选一，明确JD可澄清未经明示更改的摘要歧义。真实模型测试fixture保留该斜杠并验证评估/生成/修改不放宽；一次invalid_json经原有真实重试后通过。typecheck/lint/build通过。实际普通缩短指令的提案正确恢复组合要求，审核应用为版本2，保留版本1、零活动及下一步建议边界，额度286→284为生成和修改两次任务。未外发。首次错误保存在role-logic-first.log，最终PG回读role-logic-final.log。发布结果另核对。

- 最近已核对的生产发布为f057a47；兼容迁移已应用，生产 QA 约定暂停且通知已读。日期修复本地完整复验已通过，生产下一次正常任务时观察。
- localhost3200 production build 与 QA worker 在每次修改后按最终代码重启；续跑必须核对实际进程/端口，不能复用历史句柄推断正在运行的代码。
- QA Chrome 已保存新虚构 Role `0f0f2459-0948-4b1b-99dc-e57ac1eca850` 的约定 `fcfb4299-ee31-411b-bf1d-6fe329da52cd`：Asia/Shanghai 周四09:10，role dated records opt-in，candidate private notes关闭。自然时钟完整链路及导出已通过，现已暂停，结果见60。保留该QA资料，不再定时生成。
- Live首笔真实交易改为后续观察，无需用户为本次QA先付款。共享商户品牌、支持邮箱收件与真机时间控件保留交接，未伪造已验结论。

## 发布、回滚和交接

最近已核对的生产业务代码为 `f057a47`，包含导航、定期草稿、时区、资料定位、材料用途与中文订阅页修复；包含角色证据规则95813f5；后续组合条件逻辑候选须另核对发布结果。CI先构建/检查，再以确切SHA部署VPS；Vercel发布同一SHA。发布过程中未新增模型或支付 key，未更改其他产品或 VPS 服务。此前已实际核对 Production key存在、Live价格ID、Paddle production环境及Node24配置；不公开密钥。定期草稿兼容迁移在备份后先应用六列，随后发布；9140205仅扩展 JSON快照，无新增迁移。

备份：迁移前 `/var/backups/hirelix/daily-20261001T003658Z.dump`，49,578,208 bytes；迁移及生产自然任务后 `/var/backups/hirelix/daily-20261001T005421Z.dump`，49,581,601 bytes。后者已实际恢复到全新、仅管理员连接的 `hirelix_restore_qa_release_20261001`，47表、5文件哈希正确、六新增列/约定/草稿/额度恢复。原恢复库保留；生产数据未覆盖。同VPS备份不能替代异地DR。

当前组合条件逻辑修复的回滚基线为已验 `f057a47117af0360e86195b361a4682bfddf4258` / deployment6775778165；更早时区相关发布基线为 `15a4a4357a337483d817641ed27000e15dc8f8d1`，Vercel deployment6773337712，`hirelix-kcso8u3vq-noahs-projects-292679b9.vercel.app`。若需退回定期功能前版本，选 `44a6f1fce11d443fdef5bdd65edc4a725d75e8e0` / deployment6772408965。确认 `/opt/hirelix` 无需保留的未提交改动后，以对应SHA安装依赖、重启 Hirelix scheduler、核对版本和队列。暂停本次QA约定，保留兼容新增列和发布期间数据；不得机械drop column或用旧dump覆盖新写入。Vercel管理页已见Instant Rollback入口；未执行应用回滚演练。

运行维护：`hirelix-scheduler` enabled、Restart=always；daily backup与health timers enabled。`deploy/hirelix-health.sh`逐项检测服务、工作区worker启用状态、卡住任务/逾期约定及26小时备份。生产实际停机检测status3/恢复status0已验。故障先恢复服务，再从安全job_id日志定位；文件存储在PG bytea，下载流式传输。首次用户步骤见 [使用说明](../product/overseas-recruiter-agent-v1/first-user-guide.md)。

后续观察：首笔自然发生的Live交易出现后，核对签名回调、数据库权益、页面状态、继续AI及Live门户；生产下一次正常Search update确认本地日期。不得为填补证据擅自付款或补额度。共享商户品牌处理、支持邮箱收件与真机时间修改/保存保留交接。

当前收费放行结论：**按用户最新标准通过，不要求先做真实Live付款测试。** Live实测缺口为已知后续观察项；其他未确认的运营/设备事项仍在矩阵中如实保留，本记录不宣称它们已经验证。
