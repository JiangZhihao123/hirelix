# 2026-10-14 生产订阅付费链路检查

## 结论

最新排查结果：Live 商户、商品、生产配置、通知目的地与本地权益处理已具备基础条件。普通 Chrome 的月付和年付收银台都已实际打开；文案更新后再次打开，确认买家看到每月 3,000 AI 额度，USD 49/月与 USD 490/年及续费日期正确。首次空白框架已定位为浏览器调试暂停第三方文档响应；关闭本次调试后，同一生产代码正常加载，无需修改结账实现。

尚无 Hirelix Personal Agent 的真实付费订阅，Live 实际扣款后的开通、门户和持续使用仍未实测。按此前用户认可的收费标准，现有准备条件已核对，不把本轮入口验证写成完整 Live 支付已通过。

此前用户允许真实 Sandbox 全链路、代码检查和生产配置核对作为收费放行标准，不要求为 QA 专门购买套餐。后续用户明确授权排查加载问题、同步支付文案并复验，已仅修改 Hirelix Personal Agent 的商品介绍和两个价格的名称/内部说明。未发起实际扣款、未发送模拟事件到生产、未更改价格、周期、税务、通知配置或生产权益。

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

## 首次检查与后续浏览器复验

真实 Chrome 已登录生产计费页，显示 USD 49/月、490/年、3,000 额度；当前试用仍为 7 天 / 200 额度，按 UTC 自然月重置。

首次点击月付订阅后创建 `buy.paddle.com` 的 Paddle iframe，但一直没有显示内容。浏览器诊断工具的原始 CDP 返回“正在处理暂停的文档响应”；原生 Chrome 观察到的同一被调试标签也为空白。这个首次失败证据保留，不能用 HTTP 200 替代实际结账。

后续用原生 Chrome 打开一个普通标签，结束本次浏览器调试，仍使用原有生产代码和登录态。从产品计费页点击月付，实际出现 Paddle 收银台、Hirelix 图标/商品名、USD 49/月、税费和下一次续费日期；关闭后切换年付，实际出现 USD 490/年和下一年续费日期。由此确认首次空白来自调试工具暂停第三方文档响应，而不是生产结账代码本身。没有更换支付方式、改用其他支付服务或模拟收银台。

文案更新后再次关闭/重新打开年付和月付，实际收银台分别显示 `Personal Agent — Annual · 3,000 AI credits/month` 和 `Personal Agent — Monthly · 3,000 AI credits/month`，金额和周期不变。截图保存在 Git 忽略目录 `output/payment-fix-20261014/`。本次界面默认地区展示的含税金额只用于该次页面核对，不承诺其他地区相同税额。未填写地址/付款资料、未继续到付款提交。

本次真实 Paddle 结账产生的 `transaction.created` 已通过生产验签并写入账本：月付/年付均为 draft，purchase_type 分别为 agent_monthly/agent_annual，均关联到账户。这证明真实 Live 交易创建通知能到达且映射正确，不证明已扣款或已开通。账户仍为 free；未付款的 checkout 没有授予付费权益。无签名请求再次核对返回 401。

## 已同步的 Live 支付文案

- 商品介绍改为每个 UTC 自然月 3,000 AI credits、未用完不结转、单用户订阅；保留现有候选人/职位/推荐工作说明。
- 两个价格的客户名称增加 `3,000 AI credits/month`，年付也明确按月给额度。
- 两个价格的后台内部 description 从旧版 300 AI tasks 改为 3,000 AI credits、UTC 自然月、不结转。
- 刷新 Paddle 目录并重新打开产品编辑表单，确认商品介绍持久化；月/年价格仍 Active、USD 49/490，SaaS 税分类、无 Paddle 试用及购买数量限制保留。
- Paddle 的 price.description 是内部说明，不显示给买家；price.name 显示于 checkout 和 invoices。依据：[官方 price 文档](https://developer.paddle.com/api-reference/prices/get-price/)。本轮买家新名称已在真实收银台读回；没有付款，未取得实际收据，不声称收据已验。

## 剩余事项

1. 普通 Chrome 的 Live 月/年付入口、新文案和真实交易创建回调已复验通过；后续生产浏览器验收避免用处于文档暂停状态的调试标签。
2. 第一笔自然产生的真实 Personal Agent 订阅：核对成功扣款、签名回调、账户订阅、页面额度、继续 AI 使用，以及 Live 门户的订阅详情/取消/付款方式入口。真实付款由用户操作。
3. 商户仍使用 YieldMirror 品牌，买家收银台的商户营销选项与页脚实际显示该名称。商品介绍和月/年套餐文案已同步。本轮未改共享账号的商户名称，品牌隔离需要单独的商户/运营处理，不能影响同账号其他产品。
4. 14 天 / 300 额度、订阅日逐月重置只是本会话建议，尚未获实施指令或部署，不能作为当前承诺。

本轮没有发现价格 ID、回调密钥或通知启用状态的缺失。完整收款与付款后体验仍有上述证据边界。未改应用支付实现或部署生产代码，本次修复通过 Paddle Live 的文案配置直接生效。
