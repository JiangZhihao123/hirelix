# 猎头助理定位：生产发布与首批推广

用户于 2026-10-30 明确批准将本地版本发布到生产，并按“替独立猎头承担日常工作、每月 $49 配一位助理”的思路继续推广。本次为新授权的推广批次；已结束的两小时首客冲刺不延期，其 12 家名单不追发。

## 生产发布

- 发布 SHA：`83d79041f99c5a3c0c7dd9e75477f5d3877e39bc`。发布前 fetch 并核对本地与生产基线 `d51618cfe38a7af7b141beecc00fc6966223638f`；待推送内容仅为本聊天推广记录及已批准的首页/营销改动。两项用户未跟踪文件未提交。
- GitHub Actions：[41045876881](https://github.com/JiangZhihao123/hirelix/actions/runs/41045876881)，build-and-test、deploy-scheduler 均 success。类型检查、Lint、构建通过；单元测试共 528 项，508 通过、20 按环境门控跳过、0 失败。跳过不算真实服务验收。
- Vercel：`dpl_ArXwPuV6Aq6kDd7hwR29ACNj76ZK`，READY。GitHub 同一提交的 Vercel status 为 success；`vercel inspect https://hirelix.online` 读回该部署，alias 包含 `hirelix.online` 与 `www.hirelix.online`。
- us-2：`/opt/hirelix` 同一完整 SHA、工作树干净，scheduler active、NRestarts=0，主进程启动于 `2026-10-30 11:10:58 UTC`。没有应用迁移或修改生产价格、权益、邮箱配置。
- 正式域名的四项既有服务端 HTML/SEO 回归通过：公开页面元数据与内链、产品/价格一致、FAQ 可见正文与 JSON-LD、当前产品事实可抓取。真实 Chrome 读到新主标题、成本参考与来源、试用条款；实际点击主 CTA 到达已登录的内部 QA 工作区，来源参数保留，未交办新任务。此项不代替支付或登录后 Agent 的完整重新验收。
- 线上 `/opengraph-image` 实际显示新标题与 $49/月，已在 Chrome 查看。内部验收使用 `traffic_source=internal_qa`、`utm_campaign=assistant_release_qa`；不计自然访问或新客户。

## 实际执行的推广

1. [X 新短帖](https://x.com/Noah21729466/status/2116126688484675706)于北京时间 19:14 发布，作者 `@Noah21729466`。正文讲独立经营者不必亲自干所有工作，以 $49/月的 AI 助理承接记录、客户推荐与跟进草稿；给出 7 天/200 credits/无卡及自助入口。独立链接、正文和账号均已读回，未复制原先两份 CV 的邀请。
2. X 初次卡片仍显示旧标题/分享图。已查看正式域名的新图片，再使用 [X 官方 Card Validator](https://cards-dev.x.com/validator)提交该帖中的公开 URL，收到 `Page fetched successfully`、24 metatags、`summary_large_image`、`Card loaded successfully`。随后刷新实际短帖，标题和图片均变为 `Your recruiting assistant. $49 a month.`。这是本次观察结果，不承诺未来平台缓存行为。
3. [X 公开简介](https://x.com/Noah21729466)更新为 Hirelix 助理价值和当前价格，保留原有 Neliva 创始人身份，官网入口指向带 `recruiting_assistant` campaign 的 Hirelix。未改姓名、头像、地点、生日或认证设置。公开简介与链接已读回。
4. [Indie Hackers 原产品页](https://www.indiehackers.com/product/hirelix)更新标语为 `Your AI recruiting assistant for $49/month.`；About 改为独立猎头可交出记录、沟通准备和客户文书，腾出时间给人和业务。官网来源链接改为新 campaign。收到 `Saved.`，再进入公开产品页读回；不新增目录条目、不填收入、不重复发布社区帖子。
5. 三封新邀请实际发给 Alfonsina 的 Meghan O’Neil、Switch Recruiting 的 Mark Israel、J&J Search 的 Jamie Sears。逐个读取各自官网的独立招聘定位和公开工作邮箱，仓库推广记录无既有命中后发送一次。具体来源、相关性与原文见 `assistant-value-outreach-2026-10-30.json`；提供商回执见 `assistant-value-outreach-results-2026-10-30.json`。这些是适配判断，不是对方已表达采购意愿。

发件人为 `Noah Jiang <noah@hirelix.online>`，回复至同一邮箱，通过 Resend；三封均获得受理 ID，随后分别读回 `delivered`。这只代表接收服务器接受，不能证明收件箱落点、阅读或成交。文案直接介绍助理、省时价值、现价和自助试用，不要求预约演示、电话或把候选人资料发到邮件。按原已配置地址提供退订方式与邮寄信息；实际邮寄地址不写入 Git。

## 未完成渠道与结果边界

- Product Hunt 本轮进入 Cloudflare 安全页，后续读取超时；没有更新成功或新发帖证据，切换可用渠道，没有绕过验证。研究中找到的 Daphne Lee 关于行政负担的访谈仅作适配线索；未在其当前官网取得本轮要求的公开邮箱证据，因此没有联系。
- Reddit 继续禁用；没有尝试解锁、猜测或重置 X 私信口令，没有购买广告、服务或自行下单，没有改价格或权益。
- 19:24 左右刷新工作邮箱后，可见新消息仍为平台/账户通知，未见客户回复。新 X 帖为 0 回复；浏览数含本次内部核验，不作为自然覆盖成果。
- `2026-10-30 11:18:36 UTC` 生产只读账单聚合为 0 Pro、本轮开始后 0 账单更新及 0 账单事件。本轮尚无外部客户真实试用或付费的证据，不把发布、邀请或投递算成交。
- 本轮没有建立新的心跳或延长旧冲刺。后续继续使用本批台账去重；真实回复优先处理，退出立即尊重，不向未回复者反复催促。

截图保存于本机忽略目录 `output/assistant-promotion-20261030/`：`production-home.png`、`x-assistant-value-post.png`、`x-profile-positioning.png`、`x-card-validation.png`、`indiehackers-positioning.png`。本记录及发送台账本地提交，不为纯证据记录再触发一次生产发布。
