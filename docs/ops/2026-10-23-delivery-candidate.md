# 2026-10-23 交付候选收口

## 当前结论

本地候选完成本轮职位入口验收、工程检查及相关数据库回归，可以进入部署审批。不能把此结论视为新版生产放行。

开始时 HEAD 为 `ee4f470f`，刷新 origin 后 main 比 `origin/main` 领先 30 个提交，另有职位入口三个文件未提交。远端 main 为 `1afae7d9`；只读 SSH 核对 VPS `/opt/hirelix` 为 `1afae7d`、工作树干净，scheduler 与 PostgreSQL 均 active。未推送或部署，未核对 Vercel 当前 SHA。

## 本轮完成的职位入口

沿用候选人起点实现，在仅有职位上下文、无草稿和附件的空对话中，提供找库中人选、准备客户更新、回顾反馈三个可编辑起点。点击只填入输入框，不自动执行。职位与候选人同时选中时不展示单对象建议；未新增业务流程、实体或固定工具顺序。

环境：本机 Chrome、真实 worker 与模型；网页和 worker 通过同一启动进程使用 `hirelix_workspace_qa_local_20261022`。启动前端口 3000 无服务，本轮恢复开发服务，未重启、清空或重建数据库，未修改 `.env.local`。

2026-10-23 15:42–15:43（Asia/Shanghai）实际操作：

1. 打开已有 Harborlight Systems / Senior Revenue Operations Analyst 职位引用对话，三个起点均可见。
2. 逐一点击客户更新、反馈回顾、库中找人，核对各自草稿；清空本轮草稿后起点恢复。点击本身不创建会话或发送任务。
3. 在找人草稿末尾追加 `Use the latest saved evidence.`，刷新后完整草稿及正确职位引用保留。
4. 主动发送，用户消息带有职位引用及完整编辑文字。会话 `7a5372bc-16f0-4ce4-ae04-bfcdb667a737`，任务 `138ba170-7fb7-4b8d-9381-38e1f1a70fe2` 最终为 done / Complete。
5. 真实观察工具为 read_role、list_candidates、read_skill、find_candidates、两次 read_candidate；这些是实际轨迹，未作为必须顺序或次数的断言。
6. 最终分析使用新版 Taylor CV、职位要求、旧评估时效与已记录客户反馈，比较 Taylor / Quinn，区分候选人自述、未验证项及分享许可。刷新后完整结果仍在，执行已结束。
7. people、roles、records、role_candidates、deliverables、document_shares、email_deliveries、versions、files 九张业务表前后 JSON 指纹逐一断言一致。仍为 9 人、6 职位、44 记录、12 职位人选关系、6 文稿、17 文件和 0 邮件投递。对话、任务与模型用量正常增长，不属于不变断言。

没有修改模型判断逻辑，也不把本次排序视为未来回答质量保证。真实发送覆盖找人起点；其他两个起点验证点击填入，没有分别消耗模型执行。附件隐藏与移除恢复沿用 10 月 22 日已有观察，本轮未重新上传文件。

## 当前候选验证

| 层次 | 本轮结果 |
| --- | --- |
| 工程回归 | `npm run test:unit`：507 项，492 通过，15 门控跳过，0 失败 |
| 类型与静态检查 | `npx tsc --noEmit`、`npm run lint`、`git diff --check` 通过 |
| 生产构建 | `NEXT_DIST_DIR=.next-delivery-20261023 npm run build` 成功；隔离输出避免覆盖正在验收的开发服务，构建自动修改的 tsconfig 已恢复原文 |
| 真实数据库回归 | candidate-cv、communication-evidence、document-context、document-sources、reminder-overview、role-slate 六项打开各自集成开关后全部通过，0 跳过；事务回滚或仅清理测试自身随机 owner 的夹具 |
| 公开页面合同 | Playwright chromium 的 `current product facts and practical feedback guide are crawlable without JavaScript` 通过，复用 localhost:3000；这是 HTTP 内容检查，不是全套浏览器 E2E |
| 本地真实链路 | Chrome 点击、编辑、刷新、发送、真实模型执行、结果持久化、业务表前后对账通过 |

本轮日志、文本及截图保存在未提交的 `tmp/delivery-*20261023*`；业务表证据在 `tmp/role-context-delivery-before.json` 和 `tmp/role-context-delivery-after.json`。原有 tmp 内容保留。构建输出 `.next-delivery-20261023/` 未提交。

## 整批改动与交付边界

待发布改动主要覆盖首次委托和登录续办、候选人/职位上下文、原稿修订及简历附件复用、推荐反馈续办、提醒排序和付款周期回跳。累计改动没有新增 migration 或 package 依赖差异。详细历史真实链路见：

- [首次委托](2026-10-22-primary-trial-assignment.md)与[登录续办](2026-10-22-signin-work-continuity.md)
- [候选人复用](2026-10-22-candidate-rediscovery.md)、[推荐反馈闭环](2026-10-22-recommendation-feedback-loop.md)与[新版 CV 续办](2026-10-22-updated-cv-continuation.md)
- [候选人资料起点](2026-10-22-candidate-context-start.md)

以上历史场景没有在本轮全部重演。新版生产登录、付款/webhook、邮件送达、外部分享与部署后主流程均待生产验证；生产服务 active 仅证明当时服务运行，不替代上述业务结果。历史 1.0.0 放行不自动覆盖这批本地提交。

下一步是用户同意推送后，执行 main 推送（会触发部署），核对 CI、Vercel 与 VPS SHA，再按变更范围复验桌面主流程。既有“推送前同意”边界继续有效。本轮未付款、外发邮件或公开分享，未处理 Owen 的待定业务选择。
