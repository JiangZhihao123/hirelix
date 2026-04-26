# Competitive Analysis Snapshots · 2026-04-27

本目录是 2026-04-27 那次竞品调研的原始数据归档，作为主报告 `competitive-analysis-2026.md` 的事实证据。

## 抓取方法

- **Firecrawl MCP**：抓取定价页与主要叙事页，输出 markdown
- **search_web + Reddit / Crunchbase 等**：抓融资、用户真实评价

## 抓取范围（8 家核心竞品）

| 竞品 | 定价页 | 已抓取 |
|------|--------|--------|
| Juicebox / PeopleGPT | https://juicebox.ai/pricing | ✅ `juicebox-pricing.md` |
| Pin | https://www.pin.com/pricing | ✅ `pin-pricing.md` |
| HeroHunt.ai | https://www.herohunt.ai/ (主页，pricing 404) | ✅ `herohunt-landing.md` |
| GoPerfect (Perfect) | https://www.goperfect.com/pricing | ✅ `goperfect-pricing.md` |
| hireEZ | https://hireez.com/pricing/ | ⚠️ 重定向到 contact sales（无公开定价） |
| Fetcher | https://fetcher.ai/pricing | ✅ `fetcher-pricing.md` |
| SeekOut | https://www.seekout.com/pricing | ✅ `seekout-pricing.md` |
| LinkedIn Recruiter | https://business.linkedin.com/talent-solutions/recruiter | ✅ `linkedin-recruiter-landing.md` |

## 关键发现（在主报告里有详细分析）

1. **Juicebox 已不是 $30M Series A**——2026-03 完成 **$80M Series B at $850M valuation**（DST Global / Sequoia / Coatue / YC）
2. **hireEZ 已撤掉公开定价**，全部走 contact sales（信号：不希望透明对比）
3. **HeroHunt 是 unfunded**（Amsterdam，2021 创立），但博客内容产出极强（多篇 30+ min read 深度文章）
4. **GoPerfect (Perfect) 拿了 $23M Seed**（Hanaco Ventures + Samsung's Young Sohn）
5. **Pin 只有 $3M seed**，但执行闭环完整度反超大部分对手
6. **SeekOut 总融资 $189M**，企业级，最近 ARR ~$25M（186 人团队）
7. **Fetcher 总融资 $40M**（$27M Series B），从 2014 年的 Caliber 转型而来

## 用户声音（Reddit 反复出现的痛点）

| 竞品 | 高频抱怨 |
|------|----------|
| **hireEZ** | "first year great，then quadruple price"、"$2,500/yr → $12k/yr 续约"、"renewal = price hike trap"——这是 Reddit 上最一致的负面信号 |
| Juicebox | "decent，but not always perfect for niche searches"、Chrome 插件触发 LinkedIn 封号 |
| Pin | 部分用户反馈"功能多但仍不够深"，但整体口碑较新 |
| SeekOut | "phone numbers and emails rarely correct"、"steep learning curve" |
| Fetcher | 相对正面，"AI + 人审"路线 |
| LinkedIn Recruiter | InMail 回复率低、"manual search 工具卖到 $9k+/年" |
