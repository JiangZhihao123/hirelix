# Hirelix 生产上线验收（2026-10-01）

本轮目标：交付可接收首批真实付费用户的 Personal AI Agent。工作预算约五小时，从北京时间 2026-10-01 04:30 开始。时间耗尽不代表完成。

## 发布基线与授权

- 开始时本地 `main` 无未提交改动，HEAD `8d363f7b6009d0471005655acbada3128542e9c3`。
- VPS `/opt/hirelix` 同一版本，无本地改动；PostgreSQL 与 `hirelix-scheduler` active，scheduler enabled，Restart=always。
- 用户已授权修复、隔离 QA、真实模型验证、中文提交、检查通过后的生产部署、备份与兼容迁移、Hirelix 服务重启及必要回滚。
- 实际付款、付费 Bright 召回、对外发送、真实数据删除、破坏性迁移及共享商户/其他产品变更不在授权范围。
- 证据目录：本机忽略目录 `output/launch-20261001/`。敏感信息不进入本文或 Git。

## 验收矩阵

所有状态初始为未验证；历史证据只作为线索。最终证据需绑定发布版本与运行环境。

| 要求 | 必须取得的证据 | 本轮状态 |
| --- | --- | --- |
| 新用户入口与 OAuth | Chrome 从首页到 Google 回跳和空工作区 | local real chain：真实 Google OAuth 新账户、20 tasks 空工作区 |
| 文件导入与持久化 | 预览、确认、重复处理、刷新、原文和文件回读 | local real chain：CSV、PDF CV、DOCX CV、TXT JD，原文件 SHA 对应，重新 OAuth 后可读；同 source 接受幂等 |
| 职位与真实助理 | 真实模型、正确上下文、持久任务和结果 | local real chain 已验；production：真实 JD 职位及正确角色下双人比较 done/1、来源正确 |
| JD 判断与来源 | 不同职位独立判断、引用可核对、未知信息保留 | local real chain：产品／财务两 JD 双人比较通过，来源正确且未知意向／授权保留 |
| Submission / Search update | 编辑、修订、保存、重开、复制、实际 PDF/DOCX 导出 | local real chain：Submission 生成、编辑、修订接受、3 版历史、复制、PDF/DOCX 下载渲染通过；Search update 编辑、修订、历史、重开及 PDF/DOCX 实际下载渲染通过；Submission 精确选择 Morgan CV 原文件下载 SHA 一致 |
| 客户反馈与历史 | 反馈确认保存、同职位继续工作、历史依据保留 | local real chain：Chrome 确认反馈更新同职位 v2/v3、原 JD 保留、原 Submission source.role.version=1；完整时间修复通过 |
| 故障与重试 | 中断、租约回收、worker 重启、幂等、额度一致 | local real chain：真实 provider 鉴权失败返还、Chrome Offline 重试失败不重复、恢复网络同 job 完成；停止 worker 时排队、重启消费通过；运行中停止进程→自然租约到期→第 2 次领取完成，单回复／单额度通过 |
| 桌面和移动端 | 关键路径、空状态、运行中、失败和重试可操作 | 未验证 |
| 试用与额度 | 真实 PG 并发、到期、退款和已存资料可读 | local real chain：显式 PG 集成 1/1 无 skip；到期 HTTP 10 个已有对象／导出可读，新 AI 402 且无额外 job |
| Paddle Sandbox | 官方成功/拒付、真实签名回调、权益和继续使用 | 本轮 Chrome Test Mode 拒付→成功→三类真实 webhook 200→active/300→真实 AI done/299；门户详情、付款方式表单、取消审阅可打开 |
| Paddle Live | 真实付款、回调、权益、继续使用、客户门户 | 未验证，付款需用户操作 |
| 数据安全 | 两账户 HTTP/数据库隔离、文件和导出权限、内部鉴权 | local real chain：42 项实际 HTTP 检查；两 PG 账户及签名 session fixture，非两次 OAuth |
| 生产运行 | 兼容 schema、持久文件、worker 自启动/恢复和队列消费 | production：最终应用／worker 44a6f1f、生产真实 chat/import done/1；实际停机故障探针已验，较大导出待验 |
| 备份与恢复 | 实际备份文件与隔离恢复检查 | production chain：完整快照及独立 QA 库恢复、文件哈希检查通过 |
| 健康与故障识别 | 后台停止消费时可发现，日志可定位 | production：backup/health timer active/enabled，实际备份及每分钟 health 成功；实际停机发现并修复漏报；`3e804b9` 停机 status 3／恢复 status 0 通过 |
| 公开说明与支持 | 价格、隐私、条款、联系和删除入口符合实际 | 未验证 |
| 发布候选检查 | typecheck、lint、unit、build、相关真实集成 | `44a6f1f` 本地 gates 通过；unit 341 pass/1 显式 PG skip，实际 PG／模型另验；CI/CD 36791131014 success |
| 生产复验 | 最终应用/worker 版本，生产核心任务、文件及账单 | 部分：44a6f1f 应用／worker 一致，OAuth／CSV／JD／CV／真实比较／修复后附件导航已验；较大导出和 Live 链路待验 |

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

## 下次继续位置（旧记录，最新位置见第 52 项及后续）

- Next dev server live，QA 库 `hirelix_workspace_qa_launch_20261001`，private worker session `44619`（必须重新核对）。生产应用／worker `44a6f1f`，本地代码与远端一致；后续上线记录提交单独保存。
- 下一步：附件导航修复已发布并生产复验；生产 CV 合并／JD 比较已完成。Chrome 当前生产 Submission 版本历史弹窗；Submission 编辑／修订／复制／大下载已验。下一步生产反馈保存→Search update 生成编辑修订、历史来源→手机触屏关键路径。隔离 Search update 的复制成功提示仍待独立观察。
- 最终导航 gates 已全部 exit 0；3200 production server session `52269`、3000 dev `62371`、QA worker `44619` 保留，必须重新核对进程后继续，不得重启仅因观测超时。
- 用户侧待 Live 实际付款或已有真实订阅，以及支持邮箱收件确认。不能据 Sandbox 或 checkout 打开声明收费验收完成。

## 发布、回滚和交接

当前发布代码 `44a6f1f`（含导航修复 db81c6d）。所有当前代码差异不改变 schema；不需要新迁移或模型／支付环境变量。VPS 与应用可独立部署，接口／持久表保持兼容。发布前再建数据库快照，生产保持既有配置，CI 完成后部署准确 SHA；再安装 backup／health timers 并实际执行。

应用回滚：上一版 Vercel deployment `6752313582`（`hirelix-ojyqoxfb4-noahs-projects-292679b9.vercel.app`）对应 `8d363f7b6009d0471005655acbada3128542e9c3`。worker 在服务器工作区干净时切换该 SHA、npm ci、restart Hirelix scheduler，并复验消费；保留数据库及发布期间写入。Vercel 管理页本轮已实际访问，Production Ready 与 Instant Rollback 入口可见；未执行回滚演练。Hirelix Node.js=24.x，构建未覆盖命令；配置页真实检查 DATABASE_URL、DEEPSEEK_API_KEY、PADDLE_API_KEY、PADDLE_WEBHOOK_SECRET 存在，公共月付／年付 ID 对应 Live 商品，NEXT_PUBLIC_PADDLE_ENV=production；未读取密钥。

发布前新增备份 `/var/backups/hirelix/pre-release-20261001-2206.dump` 49,506,261 bytes、600，pg_restore 目录可读。VPS 当前工作区干净、旧版 `8d363f7`，scheduler/PostgreSQL active，队列 16 done、无待处理。生产 private worker 默认启用，官方 DeepSeek／SiliconFlow key 已配置。

代码已发布 `44a6f1f`，timers 已启用；未更改生产 schema。生产核心用户链路复验进行中。最终上线结论：**尚未完成**，Live 完整付款／门户及支持邮箱确认仍缺少证据。
