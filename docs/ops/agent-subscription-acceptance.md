# Personal Agent 订阅与首次使用验收

## 2026-10-01 当前发布验收

权威细节见 [上线记录](../launch/production-readiness-2026-10-01.md) 第 31–34 项，证据在本机忽略目录 `output/launch-20261001/`。后文保留 September 历史边界。

- 实际 Chrome Sandbox 月付 49 USD：官方拒付测试卡显示 declined、未开通权益；官方成功卡完成交易，实际签名 subscription.created／subscription.activated／transaction.completed 各一次且返回 200。数据库 active，自动回跳 300 tasks。sandbox-decline-db.log／sandbox-success-db.log／sandbox-webhook-proxy.log。
- 真实 worker 继续完成已保存 JD＋CV 任务，job `9ea115ad-c10e-44ad-81da-6578d12afbb5` done、一次 usage，页面 299 tasks。不是手动写入订阅或模拟 paid use。sandbox-paid-use.log。
- 从产品实际打开 Sandbox 门户，订阅详情、付款方式表单、取消前审阅可用；未执行实际改卡或取消。共享 YieldMirror 品牌仍存在。复用的 Hirelix QA webhook destination 验收后设 Inactive，临时转发与隧道已停止，其他产品通知未改。
- 显式启用的 Agent billing 隔离 PG 回归 1/1、无 skip：21 并发最多 20 接受、失败返还/重试、到期、300 月度/年付、幂等及乱序；合成签名事件只证明本地处理。agent-billing-enabled.log。
- 实际隔离到期账户的 10 个已有对象/导出仍 200，新 AI 402、无新 job。http-expired-access-recheck.log。
- 生产 Vercel Live 环境与价格目录已核对，hirelix.online 月付收银台可打开；当前生产未找到有效 Live 付费订阅。**Live 扣款→签名回调→数据库权益→页面状态→继续 AI 使用及 Live 门户仍未验收，是公开收费阻塞。** 最终付款由用户操作。共享商户品牌需要独立商户/运营审批交接；未修改全商户品牌。

价格维持 49 USD/月、490 USD/年加适用税；300 AI tasks 按 UTC 自然月，不滚存。支持邮箱 MX 存在不证明收件成功，仍需运营确认。

## 2026-09-29 历史验收

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

Sandbox 密钥已加入 `.env.agent-qa`。在已付款的真实沙盒测试账号中，Hirelix Billing 页可直达对应订阅详情、更新付款方式和预打开取消表单；未实际更改支付方式或取消订阅。已取消默认进入同一商户的多产品总览。但 Paddle 门户顶部仍显示 `YieldMirror`；共用商户的门户导航仍可能通向其他产品。

Live 密钥已更新到 Vercel `hirelix` 项目的 Production Secret `PADDLE_API_KEY`，并已通过新部署生效。用不存在的客户 ID 调用 Live 客户门户接口返回预期的 `404 not_found`，证明新密钥通过认证和权限检查；尚无 Live 付费订阅可用于真实门户验收。

## 发布与验收边界

2026-09-29 已将 `4077ad3` 推送并部署到 Vercel 与 VPS；CI 构建、类型检查、Lint、单测和调度器部署均成功，调度器 active。生产数据库已先备份，再依次应用 20260924 私人工作区相关迁移和 20260929 Agent 订阅迁移。Vercel 与 worker 已配置 Live 月/年价格 ID。Chrome 从 `hirelix.online` 进入现有用户的 7 天试用工作区，显示 20 次额度；Billing 显示 49/490 USD，线上 Live Paddle 收银台成功打开，显示月付商品和税费。以下仍未完成：

- Live 成功扣款、Live 回调开通和线上首次用户验收。
- 线上客户门户打开、自助取消、变更支付方式及退款实测。
- Paddle 共用商户的跨品牌显示。线上收银台的营销选项与页脚仍出现 `YieldMirror`，沙盒门户页眉也显示该品牌。[Paddle 官方说明](https://www.paddle.com/help/start/set-up-paddle/can-i-have-multiple-paddle-accounts)商户 display name 是账号级设置；完整隔离需独立 Hirelix 商户账号和相应商品、密钥、通知目的地，不能修改当前共享商户名称而影响 YieldMirror。

从 localhost 调用 Live 时曾返回 `Transaction checkout creation is blocked for this vendor.`。发布后从获批 `hirelix.online` 域名已成功打开 Live 收银台；这证明入口可用，不证明支付扣款和 webhook 最终成功。

实际发布顺序与后续验收：

1. 前置数据库迁移、价格环境变量、应用及 worker 已完成。
2. 用新用户从线上落地页开始验收。真实最终付款由用户操作，之后核对 Paddle、数据库和浏览器权益。
3. 从已付款的 Live 账号打开客户门户，核验取消和付款方式管理，并在 2026-12-27 前轮换密钥。
4. 迁至独立 Hirelix Paddle 商户后，重建 Live 商品、客户端令牌、API key、webhook secret 和通知目的地，再以 Sandbox 与 Live 各验收一次；切勿直接修改共享商户品牌。

## 本地运行与清理

本地预览目前在 localhost:3000，使用独立 QA 数据库。Sandbox 配置保存在 Git 忽略的 `.env.agent-qa`，生产 `.env.local` 的付款配置没有被替换为 Sandbox。

```sh
DATABASE_URL='postgresql://noah@127.0.0.1:5432/hirelix_workspace_qa_landing_20260929?sslmode=disable' \
BETTER_AUTH_URL=http://localhost:3000 NEXT_PUBLIC_APP_URL=http://localhost:3000 NEXT_DIST_DIR=.next-agent-qa \
npx dotenv -e .env.agent-qa -e .env.local -e .env -- next dev --port 3000
```

3100 未被 Google 登记，实测 redirect_uri_mismatch；3000 回跳成功。

本次临时公网入口仅转发 POST `/api/paddle/webhook`，未签名请求 401，其他路径 404。验收后已停用本次 Sandbox 通知目的地并关闭 Cloudflare tunnel 和本地转发进程。现有生产与其他产品通知目的地均未改动。再次测试付款回调需重新配置临时目的地；当前已开通的本地测试订阅可继续验证 AI 功能。
