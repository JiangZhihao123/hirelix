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
| 职位与真实助理 | 真实模型、正确上下文、持久任务和结果 | 未验证 |
| JD 判断与来源 | 不同职位独立判断、引用可核对、未知信息保留 | local real chain：产品／财务两 JD 双人比较通过，来源正确且未知意向／授权保留 |
| Submission / Search update | 编辑、修订、保存、重开、复制、实际 PDF/DOCX 导出 | local real chain：Submission 生成、编辑、修订接受、3 版历史、复制、PDF/DOCX 下载渲染通过；Search update 编辑、修订、历史、重开及 PDF/DOCX 实际下载渲染通过；Submission 精确选择 Morgan CV 原文件下载 SHA 一致 |
| 客户反馈与历史 | 反馈确认保存、同职位继续工作、历史依据保留 | local real chain：Chrome 确认反馈更新同职位 v2/v3、原 JD 保留、原 Submission source.role.version=1；完整时间修复通过 |
| 故障与重试 | 中断、租约回收、worker 重启、幂等、额度一致 | local real chain：真实 provider 鉴权失败返还、Chrome Offline 重试失败不重复、恢复网络同 job 完成；停止 worker 时排队、重启消费通过；运行中停止进程→自然租约到期→第 2 次领取完成，单回复／单额度通过 |
| 桌面和移动端 | 关键路径、空状态、运行中、失败和重试可操作 | 未验证 |
| 试用与额度 | 真实 PG 并发、到期、退款和已存资料可读 | 未验证 |
| Paddle Sandbox | 官方成功/拒付、真实签名回调、权益和继续使用 | 未验证 |
| Paddle Live | 真实付款、回调、权益、继续使用、客户门户 | 未验证，付款需用户操作 |
| 数据安全 | 两账户 HTTP/数据库隔离、文件和导出权限、内部鉴权 | local real chain：42 项实际 HTTP 检查；两 PG 账户及签名 session fixture，非两次 OAuth |
| 生产运行 | 兼容 schema、持久文件、worker 自启动/恢复和队列消费 | 部分：服务 active 不代表消费正常 |
| 备份与恢复 | 实际备份文件与隔离恢复检查 | production chain：完整快照及独立 QA 库恢复、文件哈希检查通过 |
| 健康与故障识别 | 后台停止消费时可发现，日志可定位 | 未验证 |
| 公开说明与支持 | 价格、隐私、条款、联系和删除入口符合实际 | 未验证 |
| 发布候选检查 | typecheck、lint、unit、build、相关真实集成 | 进行中 |
| 生产复验 | 最终应用/worker 版本，生产核心任务、文件及账单 | 未验证 |

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

## 下次继续位置

- Next dev server live，QA 库 `hirelix_workspace_qa_launch_20261001`，private worker session `5778`（必须重新核对）。生产仍 baseline `8d363f7`；本地 `99294ad`，远端差异 0/12。
- 下一步：自然租约恢复及一次结果／计费，手机触屏路径，Search update 复制、重复导入；当前候选 Sandbox 实际回调／门户；发布备份和回滚→授权推送→生产核心任务、大文件下载与 billing 复验。
- 用户侧待 Live 实际付款或已有真实订阅，以及支持邮箱收件确认。不能据 Sandbox 或 checkout 打开声明收费验收完成。

## 发布、回滚和交接

待发布候选代码 `99294ad` 加上线记录提交。所有当前代码差异不改变 schema；不需要新迁移或模型／支付环境变量。VPS 与应用可独立部署，接口／持久表保持兼容。发布前再建数据库快照，生产保持既有配置，CI 完成后部署准确 SHA；再安装 backup／health timers 并实际执行。

应用回滚：上一版 Vercel deployment `6752313582`（`hirelix-ojyqoxfb4-noahs-projects-292679b9.vercel.app`）对应 `8d363f7b6009d0471005655acbada3128542e9c3`。worker 在服务器工作区干净时切换该 SHA、npm ci、restart Hirelix scheduler，并复验消费；保留数据库及发布期间写入。Vercel 管理页本轮已实际访问，Production Ready 与 Instant Rollback 入口可见；未执行回滚演练。Hirelix Node.js=24.x，构建未覆盖命令；配置页真实检查 DATABASE_URL、DEEPSEEK_API_KEY、PADDLE_API_KEY、PADDLE_WEBHOOK_SECRET 存在，公共月付／年付 ID 对应 Live 商品，NEXT_PUBLIC_PADDLE_ENV=production；未读取密钥。

发布前新增备份 `/var/backups/hirelix/pre-release-20261001-2206.dump` 49,506,261 bytes、600，pg_restore 目录可读。VPS 当前工作区干净、旧版 `8d363f7`，scheduler/PostgreSQL active，队列 16 done、无待处理。生产 private worker 默认启用，官方 DeepSeek／SiliconFlow key 已配置。

准备推送当前提交触发现有 CI/CD 和 Vercel 发布，部署准确 SHA。未安装 timers；未更改生产 schema。最终上线结论：**尚未完成**。
