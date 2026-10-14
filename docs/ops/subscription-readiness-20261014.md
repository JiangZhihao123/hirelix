# 2026-10-14 生产订阅付费链路检查

## 结论

Live 商户、商品、生产配置、通知目的地与本地权益处理已具备基础条件。不能把本轮结果描述为完整生产支付已通过：本次 Chrome 收银台复验未完成渲染，尚无 Hirelix Personal Agent 的真实付费订阅，Live 付费后的门户和持续使用也未实测。

此前用户允许真实 Sandbox 全链路、代码检查和生产配置核对作为收费放行标准，不要求为 QA 专门购买套餐。本轮未发起实际扣款、未发送模拟事件到生产、未更改 Paddle 配置或生产权益。

## 本轮直接证据

- Paddle Live 后台显示商户 Verification passed，商户品牌仍为 YieldMirror。
- Hirelix Personal Agent 商品 `pro_01m3mezh7wbzxfhdbqy54jnaet` 为 Active。
- 月付价格 `pri_01m3mf4h660x9k2h9jq0vj27qz` 为 Active，USD 49 / Monthly；年付 `pri_01m3mfw6btd1wgrqqjnbk9tshr` 为 Active，USD 490 / Yearly。价格目录没有 Paddle 试用期，和应用自己的免卡试用、订阅即收款相符。
- Vercel Production 环境为 production，客户端令牌为 Live，月/年价格 ID 与上述目录一致；存在 webhook secret 和服务端门户密钥。
- Vercel 将门户密钥标为 sensitive，CLI 导出会返回空值。这不是密钥未配置的证据。本机已存 Live 门户密钥对不存在的客户请求返回 404 not_found，证明该本机密钥通过认证；不证明生产敏感密钥与本机值相同，也不证明真实门户可用。
- Paddle 生产通知目的地 `https://hirelix.online/api/paddle/webhook` 为 Active，Usage 为 Platform。后台密钥与 Production 配置通过长度和双校验值比对一致，报告不保存密钥或校验值。
- 订阅事件包含 activated、created、updated、canceled、paused、resumed；交易事件包含 created、updated、completed，共 9 项。
- 生产 webhook 接口对无签名请求返回 401。没有向生产提交自建的有效签名事件或创建人工权益。
- 生产 PostgreSQL 仍只有 free 账户，没有 Paddle 订阅关联。历史 transaction.completed 没有关联订阅，不能证明当前 Personal Agent 付款链路。
- 生产 Vercel 部署为 READY，代码 SHA `fda7b43ce7243b52d66a552d00a7006eef1d2d9f`；VPS worker 为 active，代码 SHA `1b05384`。两者版本不同；本轮比较两版本和本地 HEAD 的计费、验签、额度、门户核心文件，未发现差异。此检查不代表全部产品文件或所有部署环境完全一致。

## 代码与数据库回归

以下是本轮本地回归，不是 Paddle Live 交易证据：

- `npx tsx --test tests/paddle-webhook.test.ts tests/billing.test.ts tests/billing-server.test.ts`：15/15 通过。
- 使用本地隔离 QA 库启用 `AGENT_BILLING_INTEGRATION=true` 的 `tests/agent-billing.integration.test.ts`：2/2 通过，无 skip。
- 覆盖签名、价格映射、幂等、重复/乱序订阅事件、取消失效、试用余额、失败恢复和并发预留。数据库测试使用自建签名事件，没有替代官方真实回调。
- 历史官方 Sandbox 成功/拒付、真实签名回调、开通、继续 AI 与门户入口证据见 [订阅验收记录](agent-subscription-acceptance.md)。旧任务次数证据不代表当前额度模式。

## 本次浏览器边界

真实 Chrome 已登录生产计费页，显示 USD 49/月、490/年、3,000 额度；当前试用仍为 7 天 / 200 额度，按 UTC 自然月重置。

点击月付订阅后创建 `buy.paddle.com` 的 Paddle iframe，但本次 iframe 一直没有显示收银台内容。刷新后重新点击仍未完成渲染。原生 Chrome 也观察到空白框架；浏览器诊断工具的原始 CDP 返回“正在处理暂停的文档响应”，无法取得完整网络失败原因。独立 HTTP 请求能访问收银台资源，但 HTTP 200 不证明实际结账可用。无法据此断言是产品、Paddle、本机网络或浏览器工具的问题。本次结账入口复验标为未通过/原因未定，不复用历史成功作为本次成功。

## 剩余事项

1. 在普通 Chrome 中确认 Live 收银台确实显示商品、周期、总额和税费。需要先排除本次加载问题，再声称只差首单。
2. 第一笔自然产生的真实 Personal Agent 订阅：核对成功扣款、签名回调、账户订阅、页面额度、继续 AI 使用，以及 Live 门户的订阅详情/取消/付款方式入口。真实付款由用户操作。
3. 商户仍使用 YieldMirror 品牌；月/年价格的后台 description 仍写旧版“300 AI tasks per calendar month”，而应用已改为 3,000 AI credits。应同步文案并确认买家收银台/收据实际展示；目前只证实后台 description 过期，没有证实买家能看到该字段。不能修改共享商户品牌而影响其他产品。
4. 14 天 / 300 额度、订阅日逐月重置只是本会话建议，尚未获实施指令或部署，不能作为当前承诺。

本轮没有发现价格 ID、回调密钥或通知启用状态的缺失。完整收款与付款后体验仍有上述证据边界。
