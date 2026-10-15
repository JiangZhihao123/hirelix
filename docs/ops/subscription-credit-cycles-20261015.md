# Hirelix Pro 订阅周期额度

2026-10-15：本规则替代此前按 UTC 自然月发放额度的设计。价格不变，月付 USD 49、年付 USD 490；每个订阅月 3,000 AI 额度，试用仍为独立 7 天 / 200 额度，不结转。

## 实现

- 月付：使用已验签、已保存的 `transaction.completed` 的 `billing_period`。仅更新订阅日期不会生成新额度；续费付款成功后才开放新周期。
- 年付：在已付款年度内按订阅原始日期拆分月度窗口。保留 UTC 时间，月末钳制不累计漂移；例如 1 月 31 日 → 2 月末 → 3 月 31 日。跨年度保留原始日期锚点。
- 用量账本继续以 `charged_at` 归属周期，周期为左闭右开。旧周期排队任务不能消费新周期额度，失败工作不收费，重复回调不增加额度。
- 复用 `hirelix_billing_events`；按当前订阅 ID 查找付款凭据，处理付款先于 subscription.created 到达时暂时没有 user_id 的顺序。只接收 web/api 首购与 subscription_recurring 续费凭据；一次性加购、更新付款方式及按比例调整不会重发整周期额度。
- 定时取消仍可使用已付款周期；页面显示权益结束日期，年付在已付款年度内仍按月发额度。即时取消停止 AI 使用。缺少付款凭据时不将订阅更新当付款成功，页面提示检查付款，不再次引导已有订阅重复购买。
- 前台以用户本地时区显示周期。官网、FAQ、定价页、llms.txt、中英文计费说明已同步。

## 依据

Paddle 的 [续费事件顺序](https://developer.paddle.com/webhooks/simulator/subscription-renewed/) 中 subscription.updated 先于实际收款；[transaction.completed](https://developer.paddle.com/webhooks/transactions/transaction-completed/) 提供完成的付款及对应 billing_period。[取消订阅事件](https://developer.paddle.com/webhooks/subscriptions/subscription-canceled/) 区分定时取消与实际取消。

## 验证与部署边界

- 独立本地 PostgreSQL：`hirelix_workspace_qa_credit_cycle_20261015`。真实 SQL/事务、真实 webhook 验签代码与合成事件/账本样本；不是 Paddle 本次实际续费。
- 覆盖月付跨自然月、月底和闰年、年度内每月窗口、无付款不开放额度、重复和乱序回调、定时取消、跨周期账本、试用与并发预留。
- 对当前已记录的真实月付交易做只读计算：2026-10-15T06:54:09.877Z 至 2026-11-15T06:54:09.877Z；已用 5.6268 保留。Chrome 本地登录页已读回 11 月 15 日重置及新说明。
- 事件查询索引：`supabase/migrations/20261015_subscription_credit_event_indexes.sql`，已在独立 QA 库应用。它只创建索引，不更改用户数据；部署时在目标数据库执行。
- 本次未部署生产、未新建真实收费交易；Paddle 托管商品上的旧说明需在发布时单独同步。
