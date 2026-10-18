# Hirelix SEO & GEO 发布准备

更新：2026-10-08。目标市场是海外英语国家的独立猎头与精品猎头公司顾问。

## 定位与内容

主标题保持 **Your personal AI agent for headhunting.**。Personal AI Agent 是产品类别；长期陪用户工作、积累用户保存的资料与偏好是产品价值，不把主标题替换成工具关键词或功能清单。

副标题：An assistant for your recruiting desk, from one conversation to the next. Build on your candidates, client work, and the way you like to work.

自然覆盖 personal AI agent for headhunters、AI recruiting assistant、candidate rediscovery、candidate submissions 等英文表达。这是内容意图规划，未声称这些词有经过验证的搜索量或排名机会。美国、英国、加拿大、澳大利亚等市场共用一套英文内容，不建立无实际差异的国家页面或虚构本地地址。

公开内容：

| URL | 作用 |
| --- | --- |
| `/` | 品牌、长期关系、工作示例、价格与 FAQ |
| `/product` | 解释个人 Agent 如何延续工作、使用已保存上下文与显式偏好 |
| `/pricing` | 月/年订阅、试用、AI credits、续订与支持 |
| `/guides/candidate-rediscovery` | 将旧候选人资料与新职位要求连接起来的工作方法 |
| `/guides/candidate-submissions` | 从已有证据形成客户推荐并延续后续反馈 |
| `/contact`, `/privacy`, `/terms`, `/refund-policy` | 运营主体、联系渠道与政策 |
| `/llms.txt` | 由产品常量与公开链接生成的便利摘要，不视为收录协议或推荐保证 |

产品介绍与代码 owner 核对：`workspace/memories.ts`（显式偏好与遗忘）、`workspace/conversations.ts`（上下文与授权）、`workspace/assistant-work.ts`（长期助理与约定工作）、`workspace/schedules.ts`（定期草稿）、`workspace/gmail.ts`（用户显式发送）。本轮未重新运行这些业务的完整真实服务链路。文案不承诺无限记忆、自动知道外界变化、自动外联、付费外部寻访或“永远记住所有内容”。

价格、FAQ 和机器可读摘要复用 `AGENT_PLAN`，避免新增独立定价配置。示例角色与公司仍明确标为虚构。

## 技术实现

- 公开页面各自的 canonical、title、description、Open Graph、Twitter 元数据；移除根布局向私人页面继承首页 canonical 的行为。
- 统一非 www 域名，www 请求永久 308 重定向并保留路径与查询参数。
- Sitemap 只列九个真实公开页面，不包含工作区、API、邀请、推荐分享或虚构更新时间。
- Robots 默认允许公开内容抓取，限制私人路径，包含推荐分享路径；不添加覆盖全局限制的单独 AI bot Allow 组。
- 工作区、API、运营、邀请与追踪路径增加 `X-Robots-Tag: noindex, nofollow, noarchive`；推荐页面已有更严格的私有缓存、referrer 与 noindex 响应头，保持原行为。
- Robots/noindex 是搜索控制，不是访问控制；已有账号、归属、分享令牌等校验不变。被 robots 禁止的 URL 不保证能被爬虫读取 noindex，私人 URL 不出现在公开 sitemap 与导航。
- Organization、WebSite、SoftwareApplication、Offer、FAQPage 与指南 Article/Breadcrumb JSON-LD。FAQ 与可见正文同源；不捏造评分、客户证言或奖项，也不承诺 FAQ 富结果展示。
- 首页、产品、价格、指南相互提供真实链接；重要内容存在于服务端 HTML 中，不需要爬虫先点击场景页签。
- 识别 ChatGPT、Perplexity、Claude、Copilot、Gemini 和 Bing 来源，保留显式广告/活动归因优先级；页面入口归因沿既有 session store 保留至产品入口。没有 referrer/UTM 的访问仍不可可靠归因；Google AI 与普通 Google 自然流量未伪造拆分。

参考：[Google AI features and your website](https://developers.google.com/search/docs/appearance/ai-features) 明确说明 SEO 基础、可抓取正文与内容一致的结构化数据仍适用，AI 文本文件不是展示前提，抓取、索引和展示均不保证。

## 验证与发布边界

本轮是代码与本地生产构建准备，不代表已部署或已被搜索/AI 产品采用。Git 推送 main 会触发项目现有自动发布链路，必须与正式发布决定一起执行。

复现本地生产包验证（独立输出目录，避免影响已有开发服务）：

```bash
NEXT_DIST_DIR=.next-seo-build npm run build
NEXT_DIST_DIR=.next-seo-build npm run start -- --hostname 127.0.0.1 --port 3200
PLAYWRIGHT_CHANNEL=chrome PLAYWRIGHT_BASE_URL=http://127.0.0.1:3200 PLAYWRIGHT_REUSE_SERVER=1 npx playwright test e2e/seo.spec.ts e2e/landing.spec.ts --project=chromium --workers=1 --reporter=line --retries=0
```

最终生产构建（含 TypeScript）、ESLint 与 10 项真实 Chrome 回归通过；342 项单元测试中 340 项通过，2 项既有本地 Postgres 计费集成测试按其环境门控跳过。本轮不把这些回归当作计费真实链路验收。截图位于本地忽略目录 `output/seo-geo/`。

测试覆盖九个页面的服务端 HTML、唯一标题/描述、canonical/分享 URL、内链、sitemap、FAQ 可见一致性、定价、纯文本摘要、私人 noindex、未知/废弃路径 404、www 308、实际 Chrome 页面导航、试用入口与归因。浏览器验证止于真实登录表单，不代表 OAuth、支付或 Agent 工作已重新验收。单元回归不替代真实业务链路。

初始开发模式检查有一次首次编译时的 CTA 导航等待失败；生产包检查不依赖开发即时编译。旧的登录标题断言已按当前真实页面 `Start with your private AI assistant` 更新。

## 上线后验收

1. 部署后逐个回读上述九个公开 URL、robots、sitemap、llms、分享图；检查 www 308 与私人响应头。真实 User-Agent 请求只能证明该请求可达，不能证明抓取者身份或已收录。
2. 在拥有权限的 Google Search Console 属性中确认站点验证、提交 `https://hirelix.online/sitemap.xml`、检查首页与产品页并请求重新抓取。已有 Google 验证 meta 保留；meta 存在不等于已验证账号权限。本轮未提交。
3. 在 Bing Webmaster Tools 确认站点权限并提交同一 sitemap；本轮未提交。若之后使用 IndexNow，提交接受也不等于收录。
4. 记录旧定位是否已更新。2026-10-08 的网页搜索仍返回旧首页的 “AI sourcing and screening for technical recruiters” 摘要，而实时 HTTP 首页已经是 Personal Agent；因此外部索引存在旧内容证据，不能宣称 GEO 已完成生效。
5. 以英文无品牌问题建立自然发现基线，例如 “What AI tools can help an independent headhunter maintain candidate relationships over time?”、“What assistant can help a boutique recruiter work with their existing candidate pool?”。单独记录平台、日期、原始问题、是否自发提到 Hirelix、引用 URL、定位是否准确。含品牌/指定 URL 的问题只验证理解与读取，不当作自然推荐。
6. 分别观察 Search Console 的索引、英文市场展示/点击，以及 AI/referral 来源进入产品的转化。当前没有新内容的排名、AI 自然推荐或新增客户证据；本轮未创建定时监控或对外发布品牌宣传。

## 2026-10-19：按当前 Personal Agent 能力补强

### 本轮发现

生产首页、产品页、robots、sitemap 和 llms.txt 直读均为 200，首页 canonical 正确，实时首页已不是旧寻访定位。但本轮搜索 `"Hirelix" "AI"` 与 `"hirelix.online"` 返回的首页索引仍是 “AI Sourcing and Screening for Technical Recruiters”，第三方目录也仍描述外部寻访。这是搜索返回内容过时的证据，不等于网站不可抓取或完全未收录。该次品牌搜索不能当作无品牌 GEO 推荐实验。

### 已实现的增量

- 保持 Personal AI Agent 主标题，首屏副标题改成明确的工作结果：按 JD 比较自己的人选、准备推荐、跨会话续接；不宣传已下线的外部人才寻访。
- 首页增加一个职位、两三份 CV 的可操作起点，分别链接候选人重访、推荐准备、逐人反馈指南。链接与关键正文均在服务端 HTML 中。
- 新指南 `/guides/candidate-feedback` 用明确标注的虚构例子解释：反馈与人选/职位关联、来源日期、意向与排期、协调与直属管理、跨会话续接和邮箱不可用时如何提供材料。不是客户案例或成功率证明。
- 新页面纳入 canonical/OG/Twitter、Article/Breadcrumb、公开内链、sitemap 和 llms.txt。沿用现有结构，不增加另一套 SEO 数据模型。
- 首页 FAQ、产品页、机器可读摘要同步公开邮箱边界；FAQ 与 JSON-LD 同源，价格继续使用 AGENT_PLAN。没有虚构评价、推荐背书、搜索量或 freshness 日期。
- `/auth/` 从 robots 抓取范围排除，认证恢复页补 `X-Robots-Tag: noindex, nofollow, noarchive`。保留私人资料、推荐链接及 API 的已有边界，未新增覆盖全局规则的 AI crawler Allow 组。

### 搜索意图与落地页

| 用户问题 / 搜索意图 | 主要承接页 | 可核验回答 |
| --- | --- | --- |
| personal AI agent / AI recruiting assistant for independent headhunters | `/`、`/product` | 产品对象、自己的资料库、可执行工作与限制 |
| how to rediscover candidates in an existing database | `/guides/candidate-rediscovery` | JD 对比、过去资料与当前意愿的边界 |
| how to prepare a candidate recommendation for a client | `/guides/candidate-submissions` | 候选证据、私密资料、审核与交付 |
| how to track client feedback for multiple candidates | `/guides/candidate-feedback` | 逐人反馈、后续行动、跨会话续接 |
| Hirelix pricing / free trial / email integration | `/pricing`、首页 FAQ、`/product` | 统一产品常量与当前邮箱能力，不承诺无条件可用 |

以上为内容意图映射，未购买关键词数据，未声明流量规模或排名。

### 发布后的外部工作

本次变更先在本地验证并提交；未授权新的生产发布时不推送 main。新指南必须实际部署可达后，才适合提交相应 URL。随后在有权限的 Search Console / Bing Webmaster Tools 复查 sitemap、索引和旧摘要；提交回执不是收录或排名证明。第三方旧目录描述需在有权管理的账号内单独更正，本轮没有对外发帖、留言或冒充目录所有者。

GEO 观察应把三项分开：指定 URL 能读到新事实、品牌问题能正确解释产品、无品牌需求是否自然提到并引用 Hirelix。记录问题、平台、时间、引用与定位错误；不能用品牌提示得到的一次回答代表自然推荐。现有归因已覆盖 AI/referral，不新增冗余分析系统；无 referrer 的访问仍不能可靠归因。

官方依据：[Google 的 AI 搜索指南](https://developers.google.com/search/docs/appearance/ai-features) 与[生成式搜索优化指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)强调 SEO 基础、可抓取的有用正文和内容一致性，不存在需要专门添加的 GEO schema。`llms.txt` 仅作为便利摘要，不是展示资格或推荐保证。

### 本轮本地验收结果

- `NEXT_DIST_DIR=.next-seo-release npm run build`：通过，包含 TypeScript 检查和新指南静态生成。
- 变更相关文件 ESLint：通过。
- 生产包在 `127.0.0.1:3200` 运行，真实 Chrome 执行 `e2e/seo.spec.ts` 与 `e2e/landing.spec.ts`：11 项通过。覆盖 10 个公开页面的元信息、结构化数据、sitemap、私有路径边界、FAQ 与正文一致性，以及内容页到定价和登录的路径。
- Chrome 目视检查新增首页首个委托区块和反馈指南：桌面布局、阅读层级与链接正常。截图保存在本地 `output/seo-geo/first-assignment.png` 与 `output/seo-geo/candidate-feedback.png`。
- 本轮为本地生产包验收，未推送或部署，不代表新内容已被搜索引擎收录或 AI 自然引用。

### 持续目标首轮外部基线（2026-10-19）

- 当前本地提交为 `0b375b16`，工作分支领先已知 origin/main 两个提交；未执行推送。
- 实时 HTTP：首页 200，标题为 `Hirelix | Your Personal AI Agent for Headhunting`；新 `/guides/candidate-feedback` 为 404，生产 sitemap 未包含该指南。证明本地新内容尚未上线，不能开始提交该 URL 促收录。
- 本轮网页检索查询为 `"AI assistant" "independent headhunters"` 与 `"Hirelix" "personal"`。工具合并返回结果，因此不能为单条结果归因到其中一个查询，不能据此报告无品牌排名或命中率。
- 返回的 [Hirelix 首页](https://hirelix.online/) 搜索摘要仍使用旧标题 `AI Sourcing and Screening for Technical Recruiters`，与实时首页不同；这进一步支持优先处理部署后的索引刷新，而不是继续堆积关键词页面。
- 品牌检索还返回其他域名的同名组织。只把 `hirelix.online` 及有明确来源的产品引用计为本产品；同名组织不计为曝光、用户或推荐证据。
- 尚无 Search Console/Bing 展示点击数据，也没有独立 AI 平台无品牌推荐实测结果。网页搜索结果不能替代 AI 自然推荐。

下一动作：获得本轮生产发布授权后发布当前已验证内容，逐项回读新指南、sitemap、结构化数据及登录路径，再通过具有权限的站长平台检查索引。此轮未操作站长平台、提交 URL、修改外部目录或建立定时任务。

### 注册与流量归因审计

代码检查确认 `GrowthTracker` 保存当前会话的来源，`analytics.ts` 对 AI/Bing referrer 按 hostname 判定，并优先尊重显式 campaign；已有浏览器验收覆盖 Perplexity 来源在指南、定价、登录之间保留。这个证据只证明来源传递，不证明真实新用户注册落库。

`ops-conversion.ts` 将 `signup_success` 按会话去重后显示为“登录成功”；`AuthProvider.tsx` 的 Google 回调还受近期注册时间与登录开始标记约束。因此不能直接将该事件数当成全部登录、独立新增用户或有效注册。SEO/GEO 的获客验收应依次区分：来源访问、登录尝试、已确认新建用户、首个真实委托成功、后续回访。后面三项尚无本轮真实获客证据，不能由点击测试推断。

待修复的可复现归因风险：`analytics.ts` 普通 Google/LinkedIn/Reddit/Hacker News/Product Hunt 来源仍对完整 referrer 使用 includes；其他域名的 URL 路径或查询包含这些名称时可能误分类。AI/Bing 已有 hostname 边界，普通来源需统一边界，并保留合法区域搜索域名支持。修复前不以这部分来源的精确计数作为 SEO 成效结论。

### 来源误分类修复与验证

普通来源现已统一按解析后的 hostname 及子域边界判断，查询参数、路径和相似域名中的品牌文本不再被当作搜索或社交流量。Google 区域域名使用 [Google 官方 supported_domains](https://www.google.com/supported_domains) 的本地快照（2026-10-19），保留区域域名支持，不在用户页面运行时请求该列表。显式 UTM/traffic_source 优先级保持不变；它们是提交者声明的归因，不是来源身份认证。

验证：8 项 analytics 单元测试通过；ESLint 与 diff 检查通过；真实 Chrome 对 Google UK、含 Google 查询文本的其他域名、Reddit 相似域名执行 3 项浏览器回归，均通过，并确认从产品页进入指南后来源保持。浏览器测试设置 referrer 来覆盖边界，不代表已有这些真实访客，也未证明新注册或激活。未部署本次修复。
