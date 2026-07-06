# JD Sourcing Smoke Report

本报告记录首轮 2 个 JD cold-start sourcing smoke。目标不是证明 PMF，而是验证 benchmark runner、provider 编排、成本账本、候选人卡片、light screen、lane diagnosis 和 provider value table 能端到端工作。

## 运行配置

- 时间：2026-07-05
- Benchmark run：`runs/sourcing-benchmark/benchmark-2026-07-05T15-56-50-778Z-4dbb49ee`
- JD：`JD-01`、`JD-02`
- 模式：`live`
- Providers：`serper,exa,firecrawl,github`
- Bright：未启用，`bright_budget_usd=0`
- 总预算上限：`$0.20`
- 单 JD 预算上限：`$0.05`
- 每 provider query 上限：1
- 每 query results 上限：3
- Firecrawl URL 抽取上限：1

命令：

```bash
npm run sourcing:benchmark -- --live --allow-paid --limit=2 --providers=serper,exa,firecrawl,github --max-queries-per-provider=1 --max-results-per-query=3 --max-firecrawl-urls=1 --total-budget-usd=0.20 --per-jd-budget-usd=0.05 --bright-budget-usd=0
```

## 总结果

| 指标 | 结果 |
| --- | ---: |
| JD 数量 | 2 |
| 完成数量 | 2 |
| 错误数量 | 0 |
| 实际外部成本 | `$0.0160` |
| 估算外部成本 | `$0.0160` |
| raw leads | 12 |
| enriched leads | 12 |
| deduped leads | 12 |
| candidate cards | 12 |
| light screen yes | 3 |
| light screen maybe | 7 |
| light screen no | 2 |

## 单 JD 结果

| JD | Cards | Yes | Maybe | No | Actual cost |
| --- | ---: | ---: | ---: | ---: | ---: |
| `JD-01` Backend Platform Engineer | 6 | 1 | 4 | 1 | `$0.0080` |
| `JD-02` Full-Stack Product Engineer | 6 | 2 | 3 | 1 | `$0.0080` |

## Provider 表现

| Provider | Success | Error | Returned | Actual cost | Avg latency |
| --- | ---: | ---: | ---: | ---: | ---: |
| Exa | 2 | 0 | 6 | `$0.0100` | 1980 ms |
| Firecrawl | 2 | 0 | 2 | `$0.0040` | 7280 ms |
| Serper | 2 | 0 | 6 | `$0.0020` | 10873 ms |

GitHub adapter 已通过单独 smoke，可对 GitHub repo URL 拉取公开用户和 repo 证据；本次 2 个 JD 的 discovery 结果没有产生 GitHub URL，所以 provider value table 没有 GitHub 记录。

## 观察

- Benchmark runner 可以从 `benchmark-jds.md` 解析 JD，批量执行 `run-cold-start`，并聚合 `benchmark-summary.json`、`provider-value-table.csv` 和 `benchmark-report.md`。
- 低成本 SERP + Exa + Firecrawl 组合能形成候选卡片和统一 light screen 输出。
- 本次样本太小，不能作为数据源路线结论；它只证明实验链路可跑。
- `yes` 样本需要人工抽查校准，避免 LLM 在公开证据不足时过度乐观。
- Bright 没有被调用；后续如测试 Bright，只能使用极小 probe，并受当前 `$8.96` 左右余额和 `$1` 子预算约束。

## 下一步

1. 选择是否做 10 个 JD 的低成本 live benchmark，建议先不启用 Bright。
2. 把 provider value table 扩展为按 JD、provider、lane 的 reviewable/contact-worthy 成本视图。
3. 做人工抽样校准，重点看 `yes` 和 `maybe`。
4. 用 `npm run sourcing:decision-report` 基于完整 benchmark 生成路线判断；当前 2 JD smoke 只能证明链路可跑，不能证明数据源路线成立。

## 10 JD Dry Benchmark

已追加跑完整 10 JD dry benchmark，用于验证所有固定 JD 都能生成 sourcing plan、provider plan 和成本估算。该 run 不触发外部 provider，不创建 Bright snapshot。

命令：

```bash
npm run sourcing:benchmark -- --dry-run --providers=serper,exa,firecrawl,github,bright --max-queries-per-provider=2 --max-results-per-query=5 --max-firecrawl-urls=2 --total-budget-usd=50 --per-jd-budget-usd=5 --bright-budget-usd=0.50 --bright-records-limit=25
```

结果：

| 指标 | 结果 |
| --- | ---: |
| Benchmark run | `runs/sourcing-benchmark/benchmark-2026-07-05T15-59-40-510Z-8a5964ab` |
| JD 数量 | 10 |
| planned | 10 |
| errors | 0 |
| actual external cost | `$0.0000` |
| estimated external cost | `$1.0250` |
| planned Serper calls | 20 |
| planned Exa calls | 18 |
| planned Firecrawl extractions | 10 |
| planned Bright probes | 14 |

结论：10 个固定 JD 都能进入 benchmark runner；下一步才是低成本 live benchmark 和人工质量校准。

## 10 JD Live Benchmark

已完成一轮不启用 Bright 的 10 JD live benchmark：

- Benchmark run：`runs/sourcing-benchmark/benchmark-2026-07-05T16-41-40-341Z-d05df7cc`
- Providers：`serper,exa,firecrawl,github`
- Bright：未启用
- actual external cost：`$0.1450`
- completed / error：10 / 0
- candidate cards：168
- LLM yes / maybe / no：50 / 53 / 65

该结果说明低成本外部 discovery 技术链路可跑通，但不能直接证明产品路线成立。当前 contact-worthy 主要来自 Serper，且仍是 LLM 判断，下一步必须人工抽查 yes/maybe，确认搜索摘要没有被过度判为可联系候选人。
