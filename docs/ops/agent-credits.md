# Personal Agent AI 额度

项目尚未正式上线、无已有用户。本轮以 AI 额度替换任务次数，没有旧用户权益换算或迁移。

订阅购买私人工作台、候选人记忆、职位判断和客户材料能力。价格保持 USD 49/月、490/年；每个 UTC 自然月含 3,000 AI 额度，首次 AI 工作开始的 7 天试用含 200 额度，不滚存，不自动转付费。

## 内部结算

扣额度 = 直接服务成本（USD）× `AGENT_CREDIT_COST_MULTIPLIER` ÷ 0.01。初始倍率为 3；1 额度对应内部 USD 0.01 的消耗预算，不是可提现的余额。3,000 额度对应约 USD 10 的可计费服务成本；免费索引、系统重试、失败处理、平台和支付费用另属运营成本，不能把 USD 10 写成公司的总成本上限。

- DeepSeek：实际输入、缓存命中、输出 usage × 调用开始时的官方成本价。区分模型、峰谷时间和中国假期。价格核对日为 2026-10-01：[官方价格](https://api-docs.deepseek.com/quick_start/pricing/)。2026 假期来自[国务院通知](https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html)。新年度须更新价格日历；未知模型/缺少 usage 不猜成本。
- 可选 OpenRouter：最终按响应 `usage.cost`（账户实际扣费）结算，不用上游价格替代。[官方计量说明](https://openrouter.ai/docs/cookbook/administration/usage-accounting)。`AGENT_OPENROUTER_COST_CEILING_PER_MILLION` 只用于调用前保守预留，不用于最终扣费。
- 语义检索：Qwen/Qwen3-Embedding-8B 实际输入 usage × CNY 0.28/百万，按显式资金结算汇率 `AGENT_CREDIT_CNY_PER_USD` 换算；默认 7，是可配置的资金换算值，不是实时外汇行情。价格取自[硅基流动官方价格页](https://siliconflow.cn/pricing)的模型记录，已核对原始页面内模型和 price 字段。自动索引和关联到真实父对话的后续导入由订阅包含。

`src/lib/agent-credit-pricing.ts` 集中维护价格，`.env.example` 集中列出倍率及汇率。每笔任务的 `hirelix_agent_credit_usage.pricing_snapshot` 保存模型、服务、usage、成本、倍率、价表版本与汇率（适用时）；`cost_nano_usd` 保存可计费直接成本。诊断 usage 关联 job_id，不保存私人上下文载荷。

账本以 1/10,000 额度为整数单位，按实际服务调用向上取整到该最小单位。用户页显示已用、剩余、处理中预留。入队暂预留最多 1 额度；调用前按输入上界与输出预算扩大预留。余额不足时限制可用输出预算或停止调用，不默默透支。只有整个任务完成后才算已用；失败/取消释放全部额度，格式修复和供应商重试只计成功结果。重试/租约接管清掉未完成执行的费用，不重复收费；跨月排队任务不得借用新周期预算，须显式重试。

部署前先应用 `supabase/migrations/20261001_agent_credits.sql`（新增账本，不删除旧测试数据），再部署应用和 worker。同一数据库上的所有 worker 必须更新到额度版本。

## 验证

单元检查覆盖成本×倍率、缓存/不同模型、峰谷/假期、汇率和缺少价格/usage。隔离真实 PostgreSQL 回归覆盖并发预留、失败退款、重试、试用到期、签名权益事件、年付仍按月发额度；签名事件是本地回归，不是新的 Paddle 真实支付验收。

`tests/integration/workspace-credits.test.ts` 必须在本机隔离 QA 库与真实服务凭证下启用 `WORKSPACE_REAL_AI_TEST=true`，并停止同库其他 worker。通过真实 AI 响应核对服务成本、倍率、任务账本、用量归属、完成结算以及调用后失败退款；不足额度的分支验证无供应商调用。

2026-10-02 本轮证据：344 项单元检查通过；显式启用真实隔离 PG 2/2，真实 AI 2/2，任务恢复 3/3；类型、lint、生产构建通过。Chrome 实际提交虚构中文请求后，两次模型调用成本 USD 0.000446832，按 3 倍结算为 0.1341 额度，预留释放；最终生产构建的中文计费页已读回，控制台无错误。截图、日志、账本摘要在忽略目录 `output/launch-20261001/credits-*`。
