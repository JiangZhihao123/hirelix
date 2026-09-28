# Personal Agent 订阅与首次使用验收（2026-09-29）

## 产品口径

- 英文落地页，品牌文字 Hirelix；首页、登录页、侧栏和助理消息使用同一绿色四块图标。
- Personal Agent：49 USD/月或 490 USD/年，税费在 Paddle 结账中显示。
- 首次 AI 任务开始 7 天试用，共 20 次，无需银行卡；不会自动转付费。
- 订阅含每个 UTC 自然月 300 次任务，不结转。试用任务不占用首次开通后的付费额度。
- 消息、直接导入、评估、草稿、修订及语义检索计任务；自动索引、关联到真实父任务的后续导入不另收费。失败任务退款，重试重新占用额度。
- 超额或试用结束拒绝新 AI 任务，已有资料仍可读取。保留旧 sourcing 付费套餐权益，未修改旧 Paddle 商品。

## 实际验收证据

Chrome + 空的本地 PostgreSQL `hirelix_workspace_qa_landing_20260929` + 真实 Google 登录 + 真实 AI worker：

1. 落地页进入登录、Google 回跳、创建新账户，进入空工作区。
2. 发送虚构 Northstar 职位笔记，真实 AI 返回简报；试用从 20 变为 19。
3. 工作区试用卡进入 Billing；Paddle Sandbox 月付 49 USD、年付 490 USD 结账均正确打开，周期和税费可见。
4. Paddle 官方拒付测试卡：结账显示拒付，数据库未出现付费订阅。
5. 官方成功测试卡：Paddle 实际发送 `subscription.activated`、`subscription.created`、`transaction.completed`，签名验证通过并均返回 200。自动回跳显示 active 和 300 次额度。
6. 返回原对话继续真实 AI 任务，保留上下文，任务完成后额度为 299。

Sandbox subscription 对应用户 ID：`7cad7254-0bc6-4dbf-bee1-a9bde8e11a09`。以上不是手动写入付费权益，也未产生真实扣款。截图与日志在本地忽略目录 `output/agent-checkout/`。

本地 PG 回归另外验证了并发 21 次只接受 20 次、幂等、伪造免费前缀被拒绝、失败退款与重试、过期拒绝、年付月度额度、回调幂等及乱序保护、无签名拒绝。这些回调回归使用自建测试事件，不能替代上面的 Paddle Sandbox 真实回调证据。

检查：`npm run build`、`npx tsc --noEmit`、`npm run lint -- --quiet`；现有单测 339 项通过、1 项显式跳过的本地集成；另行启用的 Agent Billing 本地 PG 集成通过；桌面/移动 Chrome 落地页 12 项通过。

## Paddle 目录

| 环境 | Product | Monthly | Annual |
| --- | --- | --- | --- |
| Live | pro_01m3mezh7wbzxfhdbqy54jnaet | pri_01m3mf4h660x9k2h9jq0vj27qz | pri_01m3mfw6btd1wgrqqjnbk9tshr |
| Sandbox | pro_01m3mg912khh35sg3b5gvy4zrg | pri_01m3mgar17pdz7ft7x6dkxybp4 | pri_01m3mgch36709wdgjpa455b4e4 |

Paddle.js 只需要客户端令牌；服务端 API key 用于客户账单门户，不是打开结账的必要条件。2026-09-29 已分别创建 Hirelix 专用 Live 与 Sandbox 密钥，权限均仅为 `Customer portal sessions: Write`，到期日为 2026-12-27；密钥值只保存在 Git 忽略的本地环境文件和 Vercel Secret 中，必须在到期前轮换。

Sandbox 密钥已加入 `.env.agent-qa`。在已付款的真实沙盒测试账号中，Hirelix Billing 页的 `Manage subscription` 按钮打开了 Paddle 客户门户，能看到 Hirelix Personal Agent 订阅详情、更新付款方式和取消订阅入口；未实际更改支付方式或取消订阅。门户顶部显示同一 Paddle 商户的 `YieldMirror` 品牌，且订阅总览还列出该客户的其他产品订阅，正式上线前需要处理这一跨产品品牌体验。

Live 密钥已更新到 Vercel `hirelix` 项目的 Production Secret `PADDLE_API_KEY`。用不存在的客户 ID 调用 Live 客户门户接口返回预期的 `404 not_found`，证明新密钥通过认证和权限检查；尚无 Live 付费订阅可用于真实门户验收。Vercel 提示必须重新部署，新值才会进入运行中的应用。

## 发布与验收边界

应用代码尚未推送或部署，也未改生产数据库；仅更新了 Vercel Production Secret。以下仍未完成：

- Live 成功扣款、Live 回调开通和线上首次用户验收。
- 线上客户门户打开、自助取消、变更支付方式及退款实测。

从 localhost 调用 Live 时实际返回 `Transaction checkout creation is blocked for this vendor.`。后台账户验证通过，`hirelix.online` 域名 Approved，默认付款页 `https://hirelix.online/` Approved。不能据此断言商户被封，也不能把 Sandbox 成功当作 Live 已恢复。发布后需从获批线上域名重新验证，若仍报错再联系 Paddle 排查。

上线前顺序：

1. 应用 `supabase/migrations/20260929_agent_subscription.sql`，在应用/worker 更新前完成。
2. 在 Vercel 与 worker 的运行环境设置两个 Live `NEXT_PUBLIC_PADDLE_AGENT_*_PRICE_ID`；保留 Live 客户端令牌、环境和现有 webhook secret。环境变量要在构建前设置。
3. 发布应用及 worker。确认现有 `https://hirelix.online/api/paddle/webhook` 订阅所需的 subscription 生命周期事件；后台当前目的地为 Active，有 9 项订阅事件。
4. 用新用户从线上落地页开始验收。真实最终付款由用户操作，之后核对 Paddle、数据库和浏览器权益。
5. 重新部署后从已付款的 Live 账号打开客户门户，核验取消和付款方式管理，并在 2026-12-27 前轮换密钥。

## 本地运行与清理

本地预览目前在 localhost:3000，使用独立 QA 数据库。Sandbox 配置保存在 Git 忽略的 `.env.agent-qa`，生产 `.env.local` 的付款配置没有被替换为 Sandbox。

```sh
DATABASE_URL='postgresql://noah@127.0.0.1:5432/hirelix_workspace_qa_landing_20260929?sslmode=disable' \
BETTER_AUTH_URL=http://localhost:3000 NEXT_PUBLIC_APP_URL=http://localhost:3000 NEXT_DIST_DIR=.next-agent-qa \
npx dotenv -e .env.agent-qa -e .env.local -e .env -- next dev --port 3000
```

3100 未被 Google 登记，实测 redirect_uri_mismatch；3000 回跳成功。

本次临时公网入口仅转发 POST `/api/paddle/webhook`，未签名请求 401，其他路径 404。验收后已停用本次 Sandbox 通知目的地并关闭 Cloudflare tunnel 和本地转发进程。现有生产与其他产品通知目的地均未改动。再次测试付款回调需重新配置临时目的地；当前已开通的本地测试订阅可继续验证 AI 功能。
