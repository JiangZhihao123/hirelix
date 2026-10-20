# 1.0.0 支持渠道最终核验

核验时间：2026-10-20，Asia/Shanghai（HTTP 请求约 23:15–23:19；生产主机只读检查同日）。

本记录只覆盖落地页、公开法律/联系入口、产品反馈通知和运维故障告警。没有发送邮件、登录支持邮箱、修改生产配置或部署。它不替代 [1.0.0 发布门禁与运行核对](2026-10-20-release-1.0.0-gates.md) 中的其他用户链路。

## 结论

- **公开支持入口：通过。** `https://hirelix.online/`、`/pricing`、`/product`、`/privacy`、`/terms`、`/refund-policy`、`/contact`、`/guides/candidate-rediscovery` 和 `/llms.txt` 均实际返回 HTTP 200；页面含 `main` 内容，公开页面使用 `support@hirelix.online`，并互相提供 Privacy、Terms、Refunds、Contact 入口。首页 CTA、价格说明和支持地址均在当前生产 HTML 中可见。
- **法律/联系文案：通过可达性与一致性核验。** Contact 页说明技术支持、账单、取消和退款请求发送至 `support@hirelix.online`，目标响应时间为 2 个工作日；Privacy 页提供账户级导出/删除请求的带主题 mailto，并要求从账户地址联系；Terms 和 Refund Policy 均提供取消/退款支持地址。以上是页面事实核验，不作法律合规意见，也不把“目标响应时间”当作已证明的 SLA。
- **匿名边界：通过。** 生产只读请求 `GET /api/admin/feedback` 返回 401 `Not authorized`，`GET /api/admin/session` 返回 401，`GET /api/ops/analytics` 返回 404 `Not found`，`GET /api/workspace/feedback` 返回 405；未带会话时没有读到反馈、截图或运营统计。
- **产品反馈通知：数据库队列通过，收件箱实收未证明。** 生产只读 PostgreSQL 汇总为 1 条反馈、`sent=1`、`pending=0`、`sending=0`、`failed=0`；该行 `notification_attempts=1`。`sent` 证明通知请求已完成并写回 Resend 结果，不证明 `support@hirelix.online` 的 Zoho 收件箱已打开、收到或人工回复。未重发反馈，也未读取该邮箱。
- **运维告警：通过已批准的一次实收检查。** `/etc/hirelix.env`（只输出非秘密配置）显示 `APP_BASE_URL=https://hirelix.online`、`SEARCH_NOTIFICATIONS_FROM_EMAIL=notifications@hirelix.online`、`HIRELIX_ALERT_TO=noahjiang2@gmail.com`、`RESEND_API_KEY` 已配置。生产 `hirelix-health.timer`、`hirelix-backup.timer`、`hirelix-scheduler` 均 enabled/active；health 和 backup service 均配置对应 `OnFailure=hirelix-alert@…`。`/var/lib/hirelix-alert/test.json` 保留一次性检查回执 `01a159c9-a05c-72f9-b980-0b93486987e1`，与门禁记录中 Gmail 实收截图相符。没有再发测试邮件。
- **邮件域名：仅确认 DNS 接收基础设施。** `hirelix.online` 的 MX 为 Zoho（mx.zoho.com、mx2.zoho.com、mx3.zoho.com）。MX 不能证明支持邮箱可登录、可收件、已人工处理或有回信。

## 生产公开页面证据

| URL | HTTP | 关键观察 |
| --- | --- | --- |
| `/` | 200 | 首页 CTA、`support@hirelix.online`、隐私/退款链接；结构化组织数据包含支持邮箱；试用为 7 天/200 credits、无自动转付费。 |
| `/pricing` | 200 | 价格页含支持邮箱、Refund Policy 和 Terms 链接。 |
| `/product`、`/guides/candidate-rediscovery` | 200 | 页脚含 Contact、Privacy、Terms、Refunds 等公开入口。 |
| `/privacy` | 200 | 账户级访问/更正/导出/删除请求 mailto；说明反馈截图和通知处理；联系地址一致。 |
| `/terms` | 200 | 取消、订阅、退款与支持地址一致。 |
| `/refund-policy` | 200 | 14 天退款窗口、支持邮箱和 Paddle buyer support 入口可见。 |
| `/contact` | 200 | 支持、账单、取消和退款统一入口；目标响应时间 2 个工作日。 |
| `/llms.txt` | 200 | 公开事实摘要包含支持邮箱、价格、试用边界和政策链接。 |

生产响应均来自 `server: Vercel`，带 `strict-transport-security`；私有 API 响应带 `no-store` 或 `noindex`。这里只记录网络与 HTML/API 事实，不把 HTTP 200 作为业务操作成功证明。

## 本地合同回归

```text
npx tsx --test tests/ops-alert.test.ts tests/product-feedback.test.ts
2 passed, 0 failed
```

回归覆盖告警必须配置单一明确收件人、同一 UTC 小时幂等，以及反馈页面路径清理（不携带 query、fragment 或私有记录 ID）。生产检查与本地合同回归分别记录，不能相互替代。

## 未闭环范围与发布口径

当前可以宣称：首次接触用户能看到公开 Contact、Privacy、Terms、Refund 页面；产品反馈有持久化队列和后台通知状态；故障告警已接入批准的运营收件人并完成一次真实 provider/收件实收检查。

当前不能宣称：`support@hirelix.online` 的真实收件箱已经过本轮人工登录和处理验证，或已经证明 2 个工作日响应目标。若要把“支持渠道”升级为完整收件闭环，需要用户授权后使用自有支持邮箱读取一封既有通知或明确指定的自有测试邮件；本轮按要求不发送邮件，因此保留该边界。

