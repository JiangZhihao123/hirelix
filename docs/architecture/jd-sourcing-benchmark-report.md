# JD Sourcing Benchmark Decision Report

本报告由 benchmark 产物生成，用于判断 Hirelix 的 JD-to-candidate 数据源路线是否足够进入下一阶段。它不是人工背书；如果样本量不足或不是 live run，结论必须保持为不可决策。

## 结论

- 判断：**需要人工校准**
- 建议动作：**先抽查 yes/maybe，再决定是否进入 UI 原型**

核心理由：
- 10 JD live benchmark 已跑通，但 contact-worthy 仍是 LLM light screen 结果，不是人工确认结果。
- LLM contact-worthy rate 为 29.8%，足够支持继续验证，但不能直接当作 PMF 证据。
- cost per LLM-contact-worthy 为 $0.0029，说明成本压力暂时不是主瓶颈。

## 风险标记

- 人工校准尚未完成；当前 yes/maybe 只能代表 LLM 评审，不代表真实猎头愿意联系。
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

## Provider 贡献

| Provider | Calls | Returned | Errors | Blocked | Cards | Reviewable | Contact-worthy | Actual cost | Cost/contact-worthy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| exa | 17 | 85 | 0 | 0 | 85 | 23 | 3 | $0.0850 | $0.0283 |
| firecrawl | 20 | 20 | 0 | 0 | 0 | 0 | 0 | $0.0400 | N/A |
| github | 11 | 9 | 2 | 0 | 0 | 0 | 0 | $0.0000 | N/A |
| serper | 20 | 91 | 0 | 0 | 83 | 80 | 47 | $0.0200 | $0.0004 |

## 下一步

- 从 review-samples.csv 抽查每个 JD 的 yes 和 maybe，标注人工是否真的会联系。
- 重点检查 LinkedIn/Google snippet-only 候选是否被过度判 yes。
- 用人工确认后的 contact-worthy rate 重新生成报告，传入 --manual-review-done。

## 判定阈值

- 最小 live JD 数：10
- 最小 contact-worthy rate：12.0%
- 最大 cost per contact-worthy：$5.00
- 最大 provider error rate：20.0%
- 人工校准完成：no
