# 2026-10-23 发布前全面回归与生产冒烟

用户已授权：本地功能检查通过、无明显问题后推送部署并执行生产冒烟。本记录区分工程合同、真实业务链和历史提供商证据，不承诺任意未来输入或服务状态都不会失败。

## 发布前检查与修复

从 `fe15db6d` 开始扩展检查。发现运行中工具回执过早折叠，计数隐藏且工具/思考交接的行高不稳定。修复位于 `TurnParts`：运行期间保留工具组，执行结束后再折叠历史。既有真实 Chrome 布局回归恢复通过，并在默认单测补充运行中不折叠的断言。

另外同步了响应式用例中的旧首屏、套餐名和指南链接；视频首次按需播放、开发路由首次编译的等待窗口改为有上限的 15 秒，保留播放进度、时长、拖动、播完、重播及真实埋点数量断言。没有通过跳过功能或模拟真实依赖处理失败。

首次默认 Playwright 运行因本机未安装指定 headless shell 失败，改用已安装的 Google Chrome。生产模式明确过滤本地自动化流量，因此流量采集用例在开发模式独立运行；没有关闭生产过滤。多次后台验收触发了隔离库限流，最终复验前只清理本轮专用测试库的限流夹具；错误密码最终返回 401，既有并发限流由真实数据库合同覆盖。

## 最终本地证据

| 检查 | 结果与范围 |
| --- | --- |
| 全量默认单测 | 507 项：492 通过、15 门控跳过、0 失败；其门控项另行启用如下 |
| 全部集成测试 | 14 项全部通过、无跳过；签名账单回调/额度并发/周期、反馈与管理员隔离、候选人删除/CV/导入恢复、沟通证据、文稿上下文/来源、列表、提醒、客户联系人及职位人选关系 |
| 真实浏览器布局 | WORKSPACE_LAYOUT_TEST=true；1–100 次调用在工具和思考阶段几何位置一致；连同成果展示检查共 5 项通过 |
| 补充默认回归 | 修改运行中断言后的 workspace-conversation-results 4 项通过 |
| 桌面 E2E | 生产构建启动，29 项全部通过，无重试：登录界面、落地页视频与样例、价格/FAQ/CTA/来源、窄屏回归、公开 SEO/权限边界。OTP/password 两项为模拟 API 的 UI 合同，不冒充提供商认证 |
| 真实后台 E2E | 开发环境 1 项通过，无重试：采集→真实数据库→后台登录/刷新/筛选/各页签/导出/退出/错误密码；没有 mock 采集与管理员 API |
| 工程门禁 | 生产 build、TypeScript、lint、diff 检查通过；构建的 tsconfig 自动改写已恢复，不纳入产品变更 |
| 真实 Agent | 本轮前段 Chrome 职位入口→草稿/刷新→真实 worker/模型→完成/刷新持久结果，九张业务表指纹不变，详见同日交付候选记录 |
| 当前推荐交付 | Chrome 打开职位推荐与反馈、原稿与来源；实际下载 ZIP 成功，完整性检查通过，包含 Recommendation.pdf 和选定 CV，CV 与原始 DOCX 逐字节一致 |

合同测试专用数据库 `hirelix_workspace_qa_release_20261023`，仅从原隔离库复制表结构，不启动 worker，防止账单测试的合成任务被真实执行。原浏览器/worker 仍连接 `hirelix_workspace_qa_local_20261022`，没有清空、重建或更换原资料。schema 导出工具写入目标数据库不支持的 transaction_timeout 会话设置，移除这一条会话配置后完整导入结构；没有省略任何表/索引。

本轮 30 个 E2E 最终通过日志：`tmp/release-20261023/e2e-verified.log` 和 `analytics-clean.log`；数据库 `database.log`，布局 `layout-fixed.log`，单测 `unit-fixed.log`，构建 `build-fixed.log`。所有早期失败和中断日志保留，不覆盖为成功。推荐包保存在 Downloads，未提交私人测试资料。

## 发布前生产基线

VPS 与 origin/main 为 `1afae7d`。Vercel 正式域名部署 `dpl_5MtYmMEekGALYLZjbbSjyVASVbck` 为 READY；这里不把 READY 单独视为业务通过。现有真实 Chrome 生产登录态可进入已保存会话。

只读健康 SQL stalled=0；scheduler active、NRestarts=0，backup 与 health 的 Result=success / ExecMainStatus=0；VPS 磁盘可用 11GB。累计改动没有新增 migration 或 package 依赖。

## 发布边界

首版十三项功能以既有 1.0.0 放行记录为基线，本次复验累计代码改动影响的行为。此前真实 Google/OTP、Gmail 发送、Outlook 读发、分享/反馈/撤销、提醒和 Live 月付证据仍属历史；没有将本轮模拟登录或签名账单合同说成新增真实付款、重新授权或邮件实收。Gmail 读取仍不支持，未实购年付和不配置自动异地备份继续遵循既有产品决定。

以下记录实际生产部署与冒烟结果；本节之前的通过结论不替代部署后结果。

## 本次生产部署与冒烟

产品提交 `e62e9963c38651a75c4fed1f8a19d9d8a1b75c7a` 已推送 main。GitHub Actions [39921914767](https://github.com/JiangZhihao123/hirelix/actions/runs/39921914767) 的 build-and-test 与 deploy-scheduler 均成功。Vercel `dpl_DsdFjbASbDeQGNyh3GhqUm2shY1N` 为 READY，构建日志明确记录该提交，正式域名已指向该部署；VPS `/opt/hirelix` 完整 SHA 相同。

真实 Chrome 使用现有测试账号登录态检查：4 位候选人及 Mara 详情、职位 v2 和原 JD、两个关联候选人、职位三项起点及可编辑草稿、推荐列表、提醒空态、订阅用量及邮箱连接能力说明均可加载。没有重新付款、授权邮箱或发送邮件。清空了未发送的职位检查草稿。

从 Mara 候选人详情进入 Agent，点击 Review this candidate's history 后发送默认只读要求，生产任务 `87c968fd-8228-4526-a638-719c356b6a1e` 在 2026-10-23 08:08:26–08:08:53 UTC 完成（attempts=1、done/Complete、error 为空）。对话 `cc73449b-dc11-4932-bd2e-98a33194545c` 刷新后保留结果。观察到读取候选人、职位、提醒和历史对话共五个工具结果；任务引用实际 CV、最新五人管理门槛和旧 JD 的三人门槛差异，没有强制模型的工具顺序或业务结论。

生产只读前后九张业务表的条数与完整 JSON 指纹一致，候选人、职位、资料、推荐、分享、邮件、版本和文件均未改变。账本只有对应 job 的一行，reserved_units=consumed_units=52426，剩余额度从 187.81 到 182.57，与界面相符；预留的未消耗部分已释放。截图、AX、账本及指纹在 `tmp/release-20261023/production-agent-result.png`、`prod-result-ax.txt`、`prod-job-final.csv`、`prod-fingerprint-{before,after}.txt`。

生产视频首次检查在拖动后 5 秒等待期内未完成缓冲，另一次并发运行挂起已终止，原日志保留。独立真实 Chrome 探针证实 CDN 206/Range 正常，21 秒位置约 6 秒恢复，随后播完和重播均成功；没有媒体错误。视频回归改为 15 秒缓冲上限、60 秒用例上限，并避免等待没有自身时限的 play() Promise，继续以真实播放状态验证。这个后续调整仅影响测试和本记录，不改变产品运行字节。

生产健康复核 scheduler active/NRestarts=0，stalled=0，backup 与 health service 均 Result=success / ExecMainStatus=0。上述通过不扩展本文件“发布边界”中列明的历史提供商验证范围。

生产公开页面 21 项功能断言均通过（`production-e2e-final.log`，无重试），包含真实视频播放/拖动/播完/重播、样例 CV、价格/FAQ、登录入口/来源、SEO 与匿名边界。该次运行在所有用例输出通过后退出阶段挂起，已终止，不能将其记为进程 exit 0；另以单 worker、有全局时限的运行复核。原先失败的缓冲日志和退出挂起日志继续保留。
