# 网站流量与产品使用分析

更新：2026-10-19。状态：实现与本地验收；本轮尚未发布生产。

## 入口与访问

运营查看页为 `/ops/ceo`。输入服务端 `OPS_DASHBOARD_SECRET` 后，通过 Authorization 请求 `/api/ops/analytics`；凭据不写入 localStorage、不进入请求 URL。已有 hash 入口继续兼容。错误凭据返回 404，页面有切换凭据入口。生产要求至少 32 字符的随机凭据。页面 noindex、no-referrer，接口 no-store。普通产品菜单不暴露全站数据。

默认显示新看板，可切换历史运营看板。历史数据仍保留在原表中，新页面的浏览器统计只使用 telemetry_version=2，避免旧首页重复采集与不同口径混用。

## 五个查看视图

1. **总览与转化**：浏览器访客、会话、浏览量、新增账号、对话账号、成果账号、有效阅读、错误、注册群组激活覆盖率、访问到注册的行为覆盖数、每日趋势。
2. **来源与页面**：搜索/AI/UTM 来源、活动与媒介、页面浏览/导航/停留/滚动/错误、设备、托管平台提供的国家或地区。
3. **产品与回访**：文件、职位、推荐材料、逐人反馈、成果查看/复制/下载、后续新建对话、D1/D7 对话回访、邮件发送状态、当前订阅状态、账单回调、功能操作和响应时间。
4. **质量与错误**：真实 jobs 类型/状态/重试/定时触发，接口失败与前端未处理错误，浏览器 LCP P75。
5. **事件明细**：最近 200 条脱敏事件；汇总查询不受这个明细上限影响。

支持最近 1/7/30/90 天、统计时区、来源、设备、脱敏页面路径、包含内部流量。修改筛选后点击“应用筛选”，避免输入一个字符就重查数据库。刷新与导出只针对已应用的范围。导出 JSON 包含完整统计与统计口径参数；错误或加载时不保留上一组筛选结果冒充新结果。采集失败不会令已成功的产品请求报错。API 支持 ISO from/to，自定义范围最长 93 天。

## 采集范围与事件目录

复用 `hirelix_growth_landing_events`，没有新增第三方分析服务或数据实体。全站根组件是唯一浏览器采集入口，原首页重复采集组件已删除。浏览器标签页内的 pathname 变化产生页面浏览；仅查询参数变化不额外记 PV，以免记录聊天内容、候选人标识或把产品内部状态切换当新页面。

| 事件 | 触发与含义 | 数据边界 |
| --- | --- | --- |
| page_view | 根页面与站内路由访问 | UUID 路径替换为 :id；无查询参数或 hash |
| session_summary | 可见页面每 15 秒、离开、切后台 | 累积停留/有效阅读/滚动/交互次数；每次页面实例取最大值，不相加心跳 |
| section_view | 页面标记区域达到可见阈值 | 预先定义 section_id，不读取文案 |
| navigation_click | 点击链接 | 站内脱敏路径；外部统一 /external，不采集联系邮箱/外部个人资料路径 |
| ui_action | 显式 data-analytics-action | 开发者定义的动作名，禁止使用用户输入作为属性 |
| product_action_success / failed | 统一 fetchWithUserSession 内的同源 API 写操作，或任意失败请求 | 接口路径、方法、HTTP 状态、耗时；网络错误状态 0；主动取消不报错 |
| client_error | error / unhandledrejection | 仅错误类别，不记录异常正文、栈或输入 |
| web_vital | 支持浏览器中的首屏 LCP | 初始文档路由；软导航不当作新文档 LCP |
| document_view | 已载入成果页或成果侧栏 | 展示表面，不记录标题/正文 |
| document_copy | 剪贴板写入成功后 | 复制动作类别，无剪贴板内容 |
| document_export | PDF/DOCX/ZIP 内容取得并触发浏览器下载后 | 文件格式及 download_started，不宣称文件已被阅读 |
| 现有 CTA / signin / checkout 事件 | 保留既有受支持事件 | 使用同一传输、校验与身份关联 |

抓取机器人、自动化浏览器、私网 IP 和既有分类器可识别的云流量在生产采集入口丢弃；这不是覆盖所有机器人的反作弊系统。开发模式且连接 loopback QA/test 数据库时允许验收流量，但强制标记 internal。默认统计排除这些事件；本地业务记录也全部视为内部。`ANALYTICS_INTERNAL_USER_IDS` / `ANALYTICS_INTERNAL_EMAILS` 是可配置的运营、测试账号排除表。

事件使用 UUID 主键幂等去重。visitor/session/page 身份必须为 UUID；单次请求限制 16 KiB，拒绝跨源 Origin。已登录用户 ID 由服务端读取会话，客户端上传的 user_id/internal 不可信且会被覆盖。先匿名后登录的同一会话可以关联；一会话出现多个账号时，不把匿名事件猜给其中一个账号。

## 指标口径与不能推断的内容

- **访客**是本地浏览器标识，不是人；**会话**是标签页 sessionStorage 标识，不是 GA 的 30 分钟会话。清除存储、换设备或新标签页会改变计数。没有建立跨设备匿名身份图。
- **来源**保留现有 UTM/referrer 归因。仅已知来源域判定为搜索或 AI；没有 referrer 就是 direct，不能据此宣称被某 AI 推荐。来源/设备/页面过滤产品数据时，筛选的是该范围内可关联的账号，不是严格广告归因。一个账号可出现在多个来源分组。
- **有效阅读**按页面可见且 60 秒内有交互估算。平均值只包含收到汇总的页面；没有收到离开事件的页面可能缺失。停留样本数单独展示。后台页面停止周期上报。
- **新增账号**直接按 user.createdAt 统计，重复登录不会新增。访问→CTA→登录→注册是同一范围内独立覆盖数，不假设每人严格依次经过，不能相乘计算漏斗转化。
- **激活情况**是同注册群组中上传文件、保存非空评估或关联人选推荐的独立覆盖率；用户可以粘贴资料，没有文件不代表不能产生成果。评估首次时间优先来自版本记录，缺失时使用当前记录更新时间；不补造精确历史时间。
- **对话回访**统计真实用户消息，排除移除/仍排队消息及未关联产品对话的历史消息。D1 为注册后 24–48 小时；D7 为 168–192 小时。只有完整观察到 48/192 小时的账号进入分母。当天注册账号显示不可观察，不记零留存。
- **后续新建对话**只证明再次开启，不证明正确续接同一委托。**接口成功**只证明 HTTP 接受；**job done**只证明任务完成；均不自动等于业务成果或用户满意。
- **邮件 sent**来自真实发送记录，表示提供方接受，不证明最终送达或打开；不触发新邮件、不重新连邮箱。
- **订阅状态**是当前快照，受账号过滤影响，但不是筛选结束时的历史状态。兑换、Sandbox、Live 权益不得直接当实收营收；账单回调也不推算营收。
- 业务统计来自现有记录，删除或修改记录会影响历史结果。新埋点前没有页面、来源或成果使用历史；覆盖起点明确显示。

## 隐私和运维

事件字段严格白名单；不采集表单值、对话、JD、CV、邮件正文、候选人名字或分享令牌。IP、User-Agent 继续保留在第一方事件表用于流量质量诊断，国家取平台头；新看板与导出不提供 IP、邮箱、用户姓名或业务内容。账号/浏览器明细仅展示缩略标识。UTM 命名应只放推广标签，不放联系人或机密内容。

移除根布局原有硬编码 Google Analytics/Ads 脚本，统一使用第一方存储，避免两套 PV 及自动历史跟踪把工作区 URL 发到第三方；新的看板是查看入口。GA/Ads 后续不会收到这套新埋点。Google 搜索站点验证 meta 不受影响。公开隐私说明同步更新。

`/ops` 与公开推荐分享页不采集浏览器事件，公开客户反馈仍从业务记录统计。不存在会话录屏、热图、输入值捕获或第三方会话回放。当前没有新增自动清理、异机备份或故障告警任务。

## 本地验证

在 `hirelix_workspace_qa_release_20261019` 隔离库、localhost:3000 和本地独立 worker 上验收；未连接生产库做写入测试。

```bash
npx tsx --test tests/telemetry.test.ts tests/client-auth-telemetry.test.ts tests/analytics.test.ts tests/growth-landing-event.test.ts tests/ops-conversion.test.ts
npx dotenv -e .env.local -- npx tsx scripts/qa/verify-product-analytics.ts
PLAYWRIGHT_BASE_URL=http://localhost:3000 PLAYWRIGHT_REUSE_SERVER=1 PLAYWRIGHT_CHANNEL=chrome npx dotenv -e .env.local -- npx playwright test e2e/product-analytics.spec.ts e2e/seo.spec.ts --project=chromium --workers=1
npx tsc --noEmit
NEXT_DIST_DIR=.next-analytics-build npm run build
```

SQL/HTTP 合约脚本只接受 loopback QA/test 库，应用索引；生成并清理专属 fixtures，验证事件幂等、字段过滤、服务端身份、过滤、心跳最大值及 D1/D7 完整窗口。**fixtures 是回归测试，不是实际用户活跃数据。**

真实 Chrome 已走首页→指南→产品→推荐材料，登录身份由服务端关联，文档查看/复制/PDF 下载事件有数据库回读；实际 PDF 已下载到本机。Chrome 自动化不 mock 采集端点，通过真实分析 API 回读验证恰好两次页面浏览、来源延续、运营页面不自计流量、全部视图、导出及无效凭据提示。看板截图和 JSON 验收文件位于 `output/analytics/`，均为本地 QA 数据。

## 发布步骤

本轮不自动发布。确认后：

1. 检查生产 `OPS_DASHBOARD_SECRET` 长度至少 32，配置明确的内部账号 ID/email；不要把值输出到日志或提交 Git。环境变量在 Vercel 服务端配置，本地配置不证明线上配置。
2. 将 `supabase/migrations/20261019_product_analytics_indexes.sql` 应用于生产；只新增现有表索引，无历史数据重写。大表应在维护窗口评估建索引锁影响。
3. 合并、推送、确认 Vercel 与 worker 的部署 SHA 一致；虽未改 worker 执行逻辑，仍按项目正常发布检查。
4. 真 Chrome 访问公开页和已登录产品，核对脱敏事件入库、默认排除内部账号、运营权限、来源筛选与成果使用计数。
5. 生产未配置内部账号时，看板明确告警，不把 QA 计数称为真实客户。
