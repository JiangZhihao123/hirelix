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
