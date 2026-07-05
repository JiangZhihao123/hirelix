# JD Sourcing Benchmark Decision Report

本报告由 benchmark 产物生成，用于判断 Hirelix 的 JD-to-candidate 数据源路线是否足够进入下一阶段。它不是人工背书；如果样本量不足或不是 live run，结论必须保持为不可决策。

## 结论

- 判断：**需要人工复核**
- 建议动作：**用 assistant_strict 结果缩小人工校准范围，不进入产品化**

核心理由：
- assistant_strict 已审 56 条，样本 contact-worthy rate 为 12.5%。
- 投影 cost per contact-worthy 为 $0.0112。
- 该结果是模型辅助校准，不是真实猎头确认，不能直接作为 PMF 证据。

## 风险标记

- 人工校准尚未完成；当前 yes/maybe 只能代表 LLM 评审，不代表真实猎头愿意联系。
- 已审 LLM yes precision 只有 26.9%，说明 LLM 对 contact-worthy 的判断偏乐观。
- serper 贡献了 94.0% 的 contact-worthy；数据源路线高度依赖单一 discovery 来源，需要人工确认它不是搜索摘要误判。
- Exa contact-worthy rate 只有 3.5%，当前更像补充发现源，不像主数据源。
- Firecrawl 当前只做补全文本，不直接归因 candidate；后续要判断它是否提升人工确认率，而不是只看 provider 表里的 0。

## Benchmark 输入

- Benchmark：`benchmark-2026-07-05T16-41-40-341Z-d05df7cc`
- 目录：`/Users/noah/projects/hirelix/runs/sourcing-benchmark/benchmark-2026-07-05T16-41-40-341Z-d05df7cc`
- 模式：`live`
- Providers：`serper,exa,firecrawl,github`
- JD 数量：10
- 完成：10，planned：0，error：0

## 总体指标

| 指标 | 数值 |
| --- | ---: |
| actual cost | $0.1450 |
| estimated cost | $0.1450 |
| raw leads | 176 |
| deduped leads | 168 |
| candidate cards | 168 |
| reviewable candidates | 103 |
| contact-worthy candidates | 50 |
| reviewable rate | 61.3% |
| contact-worthy rate | 29.8% |
| cost per contact-worthy | $0.0029 |
| provider error rate | 2.9% |
| reviewed calibration rows | 56 / 56 |
| calibration review mode | assistant_strict |
| manually confirmed contact-worthy | 7 |
| manual contact-worthy rate on reviewed rows | 12.5% |
| manual yes precision on reviewed yes | 26.9% |
| projected cost per manual contact-worthy | $0.0112 |

## 单 JD 结果

| JD | Status | Cards | Yes | Maybe | No | Actual cost |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| JD-01 普通技术岗：Backend Platform Engineer | completed | 13 | 6 | 5 | 2 | $0.0110 |
| JD-02 普通技术岗：Full-Stack Product Engineer | completed | 15 | 5 | 8 | 2 | $0.0160 |
| JD-03 普通技术岗：Data Engineer | completed | 20 | 6 | 6 | 8 | $0.0160 |
| JD-04 高级基础架构：Staff Infrastructure Engineer | completed | 20 | 5 | 4 | 11 | $0.0160 |
| JD-05 高级基础架构：Engineering Manager, Platform | completed | 20 | 2 | 6 | 12 | $0.0160 |
| JD-06 极窄技能：Blockchain Indexing Engineer | completed | 6 | 0 | 3 | 3 | $0.0110 |
| JD-07 极窄技能：Healthcare Interoperability Engineer | completed | 15 | 3 | 7 | 5 | $0.0110 |
| JD-08 Location 严格：Senior Backend Engineer, NYC Onsite | completed | 19 | 5 | 5 | 9 | $0.0160 |
| JD-09 ML / Research：ML Infrastructure Engineer | completed | 20 | 8 | 5 | 7 | $0.0160 |
| JD-10 非典型相邻背景：Technical Solutions Engineer to Product Engineer | completed | 20 | 10 | 4 | 6 | $0.0160 |

## 人工校准

- 校准文件：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-calibration-assistant-strict.csv`
- 校准方式：assistant_strict
- 已审样本：56 / 56
- 人工确认 contact-worthy：7
- 人工确认 reviewable：42
- 人工 reject：14
- 已审样本 contact-worthy rate：12.5%
- 已审 LLM yes precision：26.9%
- 投影 contact-worthy 数：13
- 投影 cost per contact-worthy：$0.0112

## Provider 贡献

| Provider | Calls | Returned | Errors | Blocked | Cards | Reviewable | Contact-worthy | Actual cost | Cost/contact-worthy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| exa | 17 | 85 | 0 | 0 | 85 | 23 | 3 | $0.0850 | $0.0283 |
| firecrawl | 20 | 20 | 0 | 0 | 0 | 0 | 0 | $0.0400 | N/A |
| github | 11 | 9 | 2 | 0 | 0 | 0 | 0 | $0.0000 | N/A |
| serper | 20 | 91 | 0 | 0 | 83 | 80 | 47 | $0.0200 | $0.0004 |

## 下一步

- 优先人工复核 assistant_strict 标为 contact_worthy 的行。
- 抽查 assistant_strict 标为 research_more 的 Serper snippet-only 行，确认是否需要 Bright/Profile 补全。
- 人工复核后重新生成报告，并传入 --manual-review-done。

## 判定阈值

- 最小 live JD 数：10
- 最小 contact-worthy rate：12.0%
- 最大 cost per contact-worthy：$5.00
- 最大 provider error rate：20.0%
- 人工校准完成：no
