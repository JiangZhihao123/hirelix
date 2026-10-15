# Live 信用卡低价实测准备（2026-10-15）

用户授权配置最低金额，之后由用户亲自用信用卡付款。

已在 Paddle Live 的 YieldMirror 商户创建专用优惠，后台读回为 Active：

- ID：`dsc_01m4z52zz6gp1gafnvbv9v7ptm`
- 优惠码：`HXLTEST70OCT15`
- 仅适用 Hirelix Personal Agent 月付价格 `pri_01m3mf4h660x9k2h9jq0vj27qz`。
- 首笔减 USD 48.30，原价 USD 49，折后 USD 0.70，另计适用税费。
- 仅第一笔付款生效，兑换上限 1；后续续订恢复 USD 49/月及适用税费。
- 未修改公开价格或账户权益，未输入付款资料或扣款。

最低美元收费依据：https://developer.paddle.com/concepts/sell/supported-currencies/ 。

已打开生产计费页并尝试月付结账，本轮自动化标签显示空白 iframe，尚未在收银台应用优惠或核对含税总额。用户应在普通 Chrome 从计费页打开月付，输入优惠码，核对金额后自行付款。付款后核对真实 webhook、订阅权益、AI 使用与门户；不能把优惠创建视作支付已通过。

截图：`output/payment-low-price-20261015/discount-created.png`（Git 忽略）。
