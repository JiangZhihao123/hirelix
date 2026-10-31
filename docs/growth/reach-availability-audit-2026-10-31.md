# 触达核查：生产入口被 Vercel 禁用

2026-10-31 北京时间约 12:55–13:00 只读核查。用户确认当前应先解决目标客户访问，而不是落地页转化。

## 已确认的故障

- 真实 Chrome 打开带邮件归因参数的 `https://hirelix.online/`，显示 `This deployment is temporarily paused`，未加载应用。
- 对无参数官网首页的独立 HTTP 请求返回 `402`，响应头 `x-vercel-error: DEPLOYMENT_DISABLED`。Vercel CLI 仍将构建显示为 Ready；Ready 不能证明当前可用。
- 当前别名仍指向 `dpl_ArXwPuV6Aq6kDd7hwR29ACNj76ZK`，生产提交 `83d79041f99c5a3c0c7dd9e75477f5d3877e39bc`。未发现本轮误发版本。
- Vercel 团队 API `/v2/teams/team_YNZl1iztlaJedAIZjVobmxGm` 的 `softBlock.reason` 为 `FAIR_USE_LIMITS_EXCEEDED`，`blockedDueToOverageType` 为 `fluidCpuDuration`。当前套餐 `hobby`。
- `blockedAt=1793389060506`，对应 **2026-10-30 19:37:40.506 UTC / 2026-10-31 03:37:40.506 北京时间**。最初口头时间换算错误，已在同轮明确更正。
- API 给出的 `unpauseAt=1795981060506` 对应 2026-11-30 03:37:40.506 北京时间；这里只记录平台字段，不保证届时一定恢复。
- 暂未核查 CPU 消耗来源，不能将全部消耗归因于 Hirelix 或某个具体请求。
- 官网错误截图：忽略目录 `output/reach-audit-20261031/deployment-disabled.png`。

## 对此前获客判断的修正

今天无事件不能等同于无人点击。请求在应用前被平台拦截时，客户端埋点无法运行；应用数据库也看不到这样的访问。需要平台边缘请求日志才能评估这段时间的访问尝试。

故障不能解释全部历史失败：昨天最后一轮约 22:55 的核查发生在本次封停前，新的 `recruiting_assistant` 活动当时同样无可归因访问。此前 10 封助理口径邮件均在封停前发送。邮件已投递不证明收件箱位置、阅读或点击。

此前 12:51 的只读查询：昨天排除已知 QA 后仍为 15 PV / 11 会话 / 11 浏览器标识；今天所有原始事件也为 0；新口径活动没有事件，全站自活动开始的新认证账号为 0。新账单事件与订阅事件更新为 0，不用历史计划字段冒充新客户付款。

## 本轮执行边界

已停止新增对外邀请，避免继续把人引向不可用网站。未重新发送旧邮件，未扩大推广名单。X 公开搜索及两条 LinkedIn 原文核查没有发现本轮适合直接回应的新客户需求，未将搜索当作实际交流。

未升级套餐、购买服务、修改费用限制、绕过平台限制、重新部署或迁移生产。恢复托管需要处理平台额度限制；收费操作需具体预算授权。修复或迁移后仍需验证真实首页与归因事件写入，不能只检查构建 Ready。

官方故障说明：https://vercel.com/docs/errors/deployment_disabled
