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
| 文件导入与持久化 | 预览、确认、重复处理、刷新、原文和文件回读 | 未验证 |
| 职位与真实助理 | 真实模型、正确上下文、持久任务和结果 | 未验证 |
| JD 判断与来源 | 不同职位独立判断、引用可核对、未知信息保留 | local real chain：同 JD 双人比较和来源通过；第二职位仍待浏览器验证 |
| Submission / Search update | 编辑、修订、保存、重开、复制、实际 PDF/DOCX 导出 | local real chain：Submission 生成、编辑、修订接受、3 版历史、复制、PDF/DOCX 下载渲染通过；CV 和 Search update 待验 |
| 客户反馈与历史 | 反馈确认保存、同职位继续工作、历史依据保留 | local real chain：Chrome 确认反馈更新同职位 v2/v3、原 JD 保留、原 Submission source.role.version=1；完整时间修复通过 |
| 故障与重试 | 中断、租约回收、worker 重启、幂等、额度一致 | 未验证 |
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
20. 当前已提交 main 比远端领先 9 个提交，尚未推送。typecheck／lint 最新通过；unit 339 pass/1 skip，实际 PG integration 另行启用通过。date/prompt 最新变更后 production build exit 0。任何本地结果都未替代最终生产复验。

## 下次继续位置

- Chrome 本地标签页停在修复后的 Search update，事实与来源已复验通过；原 Submission 与生产 Live checkout 标签页仍保留。
- 本地 dev server / QA worker 运行，库 `hirelix_workspace_qa_launch_20261001`。证据集中 `output/launch-20261001/`；切勿原样打印服务日志中的账户／OAuth 信息。
- 下一步：新报告编辑／复制／导出／视觉 QA；补 PDF/DOCX CV 导入与精确附件、重复导入、重新登录、第二 JD、移动和故障恢复；Sandbox 拒付与回调／门户；生产配置和最终 gates→授权部署→生产核心任务、大文件下载与 billing 复验。
- 用户侧仍待 Live 实际付款或已有真实订阅，以及支持邮箱收件确认。不能据 Sandbox 或 checkout 打开声明收费验收完成。

## 当前执行句柄（仅为续跑线索，必须重新核对）

- Next dev session `62371`，localhost:3000，QA 库；worker session `76735`，只消费 private workspace，legacy search 禁用。
- 最新检查输出：`typecheck-current.log`、`lint-current.log`、`unit-current.log`、`build-current.log`、`assistant-current.log`（11/11）、`search-update-current.log`（1/1）均已结束。
- 操作修复：`cd08901`、`b1f3c2a`；旧验收 fixture `ce53194`；OAuth 请求日志 `c918388`；任务安全日志 `5013a47`；多人检索 `3f6b941`；隐私入口 `1f6e225`；反馈日期 `6675f9c`；进展报告 `3db0713`。
- 未执行生产发布；未安装 daily backup／health timers；未更改生产 schema。真实 Live 付款仍待用户。

## 发布、回滚和交接

未发布本轮变更。发布前记录数据库备份、候选版本、迁移和配置顺序及应用/worker 回滚办法。生产异常优先恢复服务，数据回滚不得覆盖新写入。

最终上线结论：**尚未完成**。后续持续更新本文件。
