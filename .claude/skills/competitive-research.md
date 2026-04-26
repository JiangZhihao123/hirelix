---
name: competitive-research
description: 写或更新 docs/competitive-analysis/*.md 时使用。强制走 search_web → 用户 review 名单 → Playwright 抓真实定价 → 代码锚定 file:line 的研究流程，避免遗漏新玩家或引用过期数据。
---

# Competitive Research Skill

这份 skill 是 `.windsurf/workflows/competitive-research.md` 的 Claude Code 镜像。两份文件**保持内容同步**，更新一份时必须同步另一份。

## 何时触发

满足以下任一条件：

- 用户要求写或更新 `docs/competitive-analysis/*.md`
- 用户提到"竞品分析"、"竞争格局"、"对标报告"等关键词
- 距上次报告 > 6 个月 / 赛道出现新融资 / 上游 API 政策变动 / Hirelix 定价或核心功能调整

## 强制步骤

### 0. 不要继承既有文档的竞品集

仓库里可能有上一版报告或他人写的市场扫描——**这些是污染源**，不是研究起点。即使要参考，也只在最后一步拿来交叉验证，不能在 §1 阶段就读。

### 1. 用 search_web 做至少 4 次正交查询

固定模板（按赛道关键词替换）：

```
1. "<赛道关键词> alternative <year>"          # 找替代品的对比文
2. "<赛道关键词> reddit"                       # 找真实用户讨论
3. "<已知头部对手> alternative pricing"        # 反向找谁把谁视作威胁
4. "<赛道关键词> startup YC <year>"            # 找新入场的 well-funded 玩家
```

每次至少看前 5 个结果，统计**出现 ≥2 次**的产品名。

### 2. 列名单先给用户 review

把第 1 步的候选名单（含"为什么入选"）贴给用户确认。**这一步不能跳。** 用户能在 30 秒内告诉你哪些遗漏，比你自己调研半小时高效。

### 3. 用 read_url_content 抓 1–2 篇深度对比文

通常一篇竞品自己写的 alternative 文（例如 herohunt.ai 的 `juicebox-alternatives-2026`）就涵盖了 80% 信息。读完后用 view_content_chunk 看具体段落（pricing、feature matrix、user complaints）。

### 4. 用 Playwright MCP 抓真实定价页

对每个保留的核心竞品，用 `mcp0_browser_navigate` 打开 pricing 页（juicebox.ai/pricing、pin.com/pricing 等），然后：

- `mcp0_browser_snapshot` 拿无障碍树（结构化）
- `mcp0_browser_take_screenshot` 截图归档到 `docs/competitive-analysis/snapshots/YYYY-MM-DD/`

**为什么必须做**：博客对比文经常滞后 3–6 个月。真实页面 > 二手博客。

### 5. 用 Firecrawl MCP（如已安装）做结构化抽取

如果安装了 Firecrawl，对动态 pricing 页直接抽 JSON。否则跳过，靠 Playwright snapshot 手抄。

### 6. 锚定本产品的真实能力

报告中每个关于 Hirelix 自身的断言，必须附 `@/absolute/path/file.ts:line` 引用。工具：`code_search`、`grep_search`、`read_file`。

**如果某个营销断言无法在代码里找到对应实现，必须删掉或降级为"路线图中"。**

### 7. 报告结构强制项

| 章节 | 强制内容 |
|------|---------|
| §0 研究方法 | 列出本次用了哪些 search_web 查询、抓了哪些 URL、用了 Playwright 抓哪些定价页 |
| §1 真实定位（基于代码） | 含 `@file:line` 锚定 |
| §X 竞品分层 | 至少 3 层：直接 / 邻接 / 不重叠 |
| §X 每个直接竞品 | SWOT + 攻防剧本 + "必须警惕的事" |
| §X 风险登记册 | 至少 3 条**致命级**风险 |
| §X 90 天行动（ICE 排序） | 必须给 Top-3 启动顺序 |
| §X 复审节点 | 4–6 周后什么条件下回看 |

### 8. 自查清单（写完读一遍）

- [ ] 第一梯队竞品是否包含至少 3 个 AI-native 新玩家（YC / 近 2 年融资）？
- [ ] 每个竞品定价是否有日期标注？是否抓了真实定价页截图？
- [ ] Hirelix 自身的断言是否都有 `@file:line` 引用？
- [ ] 风险登记册是否标了**致命级**而不是只有"中"和"高"？
- [ ] 是否承认了 Hirelix 真实的劣势，而不是只列优势？
- [ ] 是否给出了 Top-3 行动顺序，而不是只列了 10 条平铺的 todo？

## 反模式（必须避免）

| 反模式 | 危害 | 替代 |
|--------|------|------|
| 沿用既有报告的竞品集 | 漏掉新玩家 | 重新做 §1–§2 |
| 只读分析师榜单（G2 / Gartner） | 漏掉 YC / 早期对手 | 必读 Reddit + alternative 对比文 |
| 跳过用户 review 直接写完 | 失误代价被放大到全文 | §2 必须做 |
| 只用 read_url_content 不用 Playwright | 定价数据滞后 | §4 强制 |
| 报告全是 Hirelix 优点 | 失去战略价值 | §7 强制写真实劣势 |

## 历史背景

这份 skill 是 2026-04 那次踩坑（漏掉 Juicebox、Pin、HeroHunt，引用过期 LinkedIn Lite 定价）后的固化补救。详见 `docs/competitive-analysis/competitive-analysis-2026.md` §0 研究方法。
