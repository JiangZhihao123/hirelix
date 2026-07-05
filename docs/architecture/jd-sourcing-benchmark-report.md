# JD Sourcing Benchmark Decision Report

本报告由 benchmark 产物生成，用于判断 Hirelix 的 JD-to-candidate 数据源路线是否足够进入下一阶段。它不是人工背书；如果样本量不足或不是 live run，结论必须保持为不可决策。

## 结论

- 判断：**不能决策**
- 建议动作：**进入完整 10 JD live benchmark 前，不改变产品方向**

核心理由：
- 当前只有 2 个 JD，低于 10 个 JD 的最小决策样本。

## Benchmark 输入

- Benchmark：`benchmark-2026-07-05T15-56-50-778Z-4dbb49ee`
- 目录：`/Users/noah/projects/hirelix/runs/sourcing-benchmark/benchmark-2026-07-05T15-56-50-778Z-4dbb49ee`
- 模式：`live`
- Providers：`serper,exa,firecrawl,github`
- JD 数量：2
- 完成：2，planned：0，error：0

## 总体指标

| 指标 | 数值 |
| --- | ---: |
| actual cost | $0.0160 |
| estimated cost | $0.0160 |
| raw leads | 12 |
| deduped leads | 12 |
| candidate cards | 12 |
| reviewable candidates | 10 |
| contact-worthy candidates | 3 |
| reviewable rate | 83.3% |
| contact-worthy rate | 25.0% |
| cost per contact-worthy | $0.0053 |
| provider error rate | 0.0% |

## 单 JD 结果

| JD | Status | Cards | Yes | Maybe | No | Actual cost |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| JD-01 普通技术岗：Backend Platform Engineer | completed | 6 | 1 | 4 | 1 | $0.0080 |
| JD-02 普通技术岗：Full-Stack Product Engineer | completed | 6 | 2 | 3 | 1 | $0.0080 |

## Provider 贡献

| Provider | Calls | Returned | Errors | Blocked | Cards | Reviewable | Contact-worthy | Actual cost | Cost/contact-worthy |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| exa | 2 | 6 | 0 | 0 | N/A | N/A | N/A | $0.0100 | N/A |
| firecrawl | 2 | 2 | 0 | 0 | N/A | N/A | N/A | $0.0040 | N/A |
| serper | 2 | 6 | 0 | 0 | N/A | N/A | N/A | $0.0020 | N/A |

说明：当前 benchmark 产物缺少 provider-level candidate attribution；需要用当前 runner 重新跑 live benchmark，才能填充 provider/lane 到 candidate quality 的贡献。

## 下一步

- 先跑完整 10 JD live benchmark，默认不启用 Bright，保持单 JD 和总预算上限。
- 抽查 yes/maybe 样本，确认 LLM light screen 没有把搜索摘要误判成可联系候选人。
- 用 provider-lane-value-table.csv 找到高产 lane，再决定是否做 Bright 极小 probe。

## 判定阈值

- 最小 live JD 数：10
- 最小 contact-worthy rate：12.0%
- 最大 cost per contact-worthy：$5.00
- 最大 provider error rate：20.0%
