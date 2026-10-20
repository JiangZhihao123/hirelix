# Live 用户转化链路验收（实付前检查点）

日期：2026-10-20，Asia/Shanghai。用户明确要求直接验证 Live，不使用 Sandbox。本轮没有部署代码、提交付款、修改支付价格或手工授予权益。

## 当前结果

已通过实际 Chrome 从 `https://hirelix.online/` 的 Start free trial 进入产品。浏览器已有 Noah 的登录会话，本轮复用了该会话；**没有重新验证新账号注册、Google/邮箱登录或取消后回跳**。

首次进入订阅页时：200 AI credits，试用尚未开始，提示首次 AI 任务后开始，无需银行卡。

之后通过正常对话界面提交了虚构业务资料，实际完成两轮任务：

1. 用户给出 Fictional Cedar Live QA 的仓储产品负责人要求和两位候选人的简短笔记，要求整理已有依据和待问事项。真实运行的工具进度、回复与会话链接可见。
2. 用户明确要求保存职位与两人资料，实际返回职位和两位候选人的保存回执；刷新后消息、工具进度、保存卡片及对象链接仍在。

会话：`0bfeb1ac-334c-486f-b853-8b0f6953d3eb`。

- 职位：`ff68eac4-027a-4b28-a9f9-696a87f99732`。
- Alex：`82b8c652-dd76-464d-b785-15c41511cc52`。
- Jamie：`c61210ff-005d-41dc-9561-19523a667612`。

新打开的订阅页显示：已用 4.69 / 200，剩余 195.31；试用结束日期为 2026-10-27 13:13 GMT+8。该证据支持试用启动和持久 UI 读回；本轮尚未通过生产数据库独立对账。

## Live 收银台

首次点击月付出现 `Failed to load Paddle`。Chrome 直接访问官方脚本一度导航超时，终端两种路径也分别遇到 TLS 错误和超时。稍后同一 Chrome 已能读取官方 `https://cdn.paddle.com/paddle/v2/paddle.js`，重新打开订阅页后收银台成功显示。

没有更换 CDN、使用镜像、自托管付款脚本、关闭安全保护或修改系统网络设置。不能从这些有限观察断言网络故障的最终根因。

通过实际 iframe 的 `https://buy.paddle.com/paddlejs/v2` 和 Live 客户端 token 类型确认收银台为 Live，未记录 token 值。

当前显示：

- 商品：Hirelix Personal Agent，Monthly，3,000 AI credits/month。
- 基础价：USD 49 / month，自动续费。
- 预填账号对应当前登录用户的邮箱。
- Country 自动选择 Canada，ZIP/Postcode 为空；暂算 Due today 为 USD 54.88，下一次账单为 2026-11-20。该税费并非最终核实金额，须按用户真实账单国家/邮编重新计算。
- 收银台显示的卖方文案为 YieldMirror；本轮只记录显示，未更改商户配置。

付款方式和真实账单资料未提供，停在 Your details 步骤，**没有提交真实扣款，也没有证明订阅已生效**。收银台已保留在 Chrome 供用户完成。

## 后续仍需验证

用户完成实际支付后：真实交易成功 → 签名 webhook → 正确用户订阅与付费额度 → 刷新/重新进入仍生效 → 回到原会话实际执行并记账 → 客户门户、取消续费与有效期。

年付、支付失败/取消、重复付款防护、续费、到期/额度用尽、新账号注册登录等尚未在 Live 本轮执行。不能用本轮试用成功或收银台显示替代这些结果。

一次只读 SSH 检查未连接成功（`Connection closed by UNKNOWN port 65535`），未读取到当前 VPS 部署版本或生产账本；没有据本地提交推断生产版本。

## 本地证据

`/Users/noah/projects/hirelix-local-archive/2026-10-20/live-conversion/`

- `live-checkout-ready.png`：实际 Live 收银台与实付前金额、账单字段。
- `saved-work-after-refresh.png`、`conversation-readback.txt`：刷新后的真实会话和保存回执。
- `trial-usage.png`：试用用量读回。

截图和原始界面文本仅本地保存，未提交 Git。试用消耗属于真实线上 AI 使用；未把虚构输入当作模拟服务回执。

## 优惠券验收方案与权限阻塞

用户要求使用优惠券降低测试成本，随后核对官方 Discount API：支持首期 100% 减免，`recur=false`，可限用一次并限制月付 price。零元订单可用于核对 Live 订单/订阅及应用权益；不能计为银行卡实际扣款已验证。

本地配置确认：Live API key 类型，checkout environment 为 production，Live client token 类型；本地月付 price ID 与实际收银台一致。未输出或记录密钥值。

实际调用 Live API：

- 读取月付 price：403，`not authorized to read price`。
- 读取 discounts：403，`not authorized to read discount`。
- 创建限定月付、首期 100%、一次使用、48 小时有效的验收优惠券：403，`not authorized to create|read discount`；请求 ID `a63f23f6-ca2f-46f4-92f2-3ed55bf4cd90`。

因此优惠券**未创建**，没有可用券码，也没有更改价格或扣款。创建请求仅尝试一次，拒绝回执保存在本地归档 `discount-attempt.json`，不提交 Git。

已在 Chrome 打开 Paddle 正式后台，由 `vendors.paddle.com` 跳转到 `login.paddle.com` 登录页；当前没有后台登录态。保留该页及原收银台，等待用户登录后继续。未更改 API key 权限，也未索取密码或密钥内容。

首期优惠不改变后续正常续费价格；完成验收后仍需验证取消自动续费，避免下个周期正常扣款。

## 后台登录后创建并应用优惠券

用户完成 Paddle 商户后台登录后，确认商户 YieldMirror、环境 Live。通过 Catalog → Discounts 创建优惠券，未更改或扩展 API key 权限。

- ID：`dsc_01m5bw9zea4kgn9agr2qwkg17c`。
- 首期 100% 减免，Recurring discount 关闭，列表显示 Applies to 为 1 payment。
- 总使用次数限制 1，创建后列表显示 Active、Uses left 1。
- 限定 Hirelix Personal Agent 的 USD 49 Monthly price：`pri_01m3mf4h660x9k2h9jq0vj27qz`，未选择年付或其他产品。
- 到期：2026-10-22 05:19 UTC（北京时间 2026-10-22 13:19）。
- 券码保存在本地 `discount-created.json`，不写入 Git。

已在保留的 Live 收银台通过 Add discount 应用该券，实际显示：`Pay nothing`、`Discount -US$49.00`、`Due today US$0.00`。没有提交最终订阅，没有录入账单地址或银行卡，也尚未验证零元交易/订阅回调与权益授予。后续续费恢复正常月付价格；完成验收后仍需走取消续费验证。

证据：本地 `live-discount-created.png` 和 `live-checkout-zero.png`。已保留 0 元收银台，等待用户填写真实账单资料并完成订阅。先前 API 403 仍是该密钥的能力边界；后台登录解决了本次创建券的操作入口，没有证明该密钥获得了新权限。

## 用户完成订阅后，优先关闭两个账号的自动续费

用户明确要求取消当前和此前测试账号的续费，并确认后台唯一另一条有效 Hirelix 订阅属于自己。两条均通过 Paddle Live 后台 Actions → Cancel subscription → At the end of the current billing period 操作，**未选择立即终止权益**。

| 账号标识（邮箱略去域名） | 订阅 ID | 已安排取消日期 | 后台 Next payment |
| --- | --- | --- | --- |
| 当前账号 `noahjiang2@…` | `sub_01m5bwf2vrjr4fjcn633mf3gmg` | 2026-11-20 | `-` |
| 此前账号 `rosedawsonwhere@…` | `sub_01m4z5dz0ptasf63pt16fd48yq` | 2026-11-15 | `-` |

两个详情页都显示 Scheduled cancellation 成功横幅。分别搜索两个实际邮箱后：当前账号只有上述一条订阅；此前账号还有一条旧 YieldMirror Subscription，原本已为 Canceled、无下一次付款，未再操作。没有修改其他客户的订阅。此前确认提问中少写的邮箱字母已明确更正；后台真实拼写以 `rosedawsonwhere` 为准。

Paddle 当前账号详情确认：本次 USD 0.00 交易 Completed，已建立 Active 月付订阅，付款国家 CN。此前账号对应 2026-10-15 的 USD 0.70 交易 Complete。均为本轮后台读回，不再以优惠券创建或用户口头付款替代交易状态证据。

### 产品端与付费任务读回

取消后刷新 Hirelix 订阅页：Subscription active、3,000 AI credits、Access ends Nov 20, 2026，续费关闭已同步到页面。当前周期权益仍有效。

继续原定 Live 验收，在新会话自然请求从已保存的职位及 Alex/Jamie 资料准备后续沟通问题。模型实际完成候选人检索、职位检索、读取职位、读取两位候选人，最终回复已保存。会话 `dc883179-aa10-4670-936a-025a810f23c2`。之后重新进入订阅页显示已用 2.94 / 3,000、剩余 2,997.06，Access ends 仍为 Nov 20。

以上确认 Live 零元订阅完成、产品权益到账、付费期继续工作及 UI 用量记账、后台取消续费及产品端同步。尚未通过生产数据库直接核对签名 webhook 原始事件和账本；新注册登录、到期执行、真实后续续费等仍不因本轮局部结果而放行。

证据均仅本地保存：`noah-renewal-cancelled.png`、`previous-account-renewal-cancelled.png`、两个账号筛选后的无 Next payment 截图、`paid-access-ends-after-cancellation.png`、`paid-follow-up-complete.png`、`paid-follow-up-readback.txt`、`paid-usage-after-cancellation.png`、`renewal-cancellations.json`。未记录完整银行卡资料，未创建额外收费项目。
