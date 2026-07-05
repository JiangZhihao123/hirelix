# JD Sourcing Calibration Guide

本文件说明如何校准 `docs/architecture/jd-sourcing-calibration-samples.csv`。当前校准目标不是证明 Hirelix 已经可以卖，而是验证 LLM 标记的 `yes/maybe` 里，真实猎头视角下到底有多少人值得联系。

## Reviewer Decision

在 `reviewer_decision` 填以下值之一：

| 值 | 含义 |
| --- | --- |
| `contact_worthy` | 证据足够，真实猎头会放进 outreach 或 shortlist |
| `research_more` | 方向可能对，但证据不足，需要补 Profile/简历后再决定 |
| `reject` | 不适合该 JD，或者只有关键词重合 |
| `uncertain` | 当前信息无法判断，且不能合理归入上面三类 |

`contact_worthy` 要求比较高：候选人必须对 JD 的核心职责、资历、关键技能或领域约束有直接证据。搜索摘要、LinkedIn headline 或泛化 title 不够时，优先填 `research_more`，不要为了让指标好看填 `contact_worthy`。

## Recommended Process

1. 按 `jd_id` 分组检查样本。
2. 先看 `llm_decision=yes` 的候选人，重点关注 `snippet_only_risk=yes` 的行。
3. 再看 `llm_decision=maybe`，判断是否只是证据不足，还是实际不匹配。
4. `reviewer_reason` 用一句话写清楚为什么联系、为什么需要补证据或为什么拒绝。
5. 填完后运行：

```bash
npm run sourcing:decision-report -- --benchmark-dir=runs/sourcing-benchmark/benchmark-2026-07-05T16-41-40-341Z-d05df7cc --calibration-csv=docs/architecture/jd-sourcing-calibration-samples.csv --manual-review-done --out=docs/architecture/jd-sourcing-benchmark-report.md
```

报告会输出人工确认后的样本 contact-worthy rate、LLM yes precision、投影 contact-worthy 数和投影单个可联系人成本。

## Assistant Strict Baseline

仓库同时保留一份模型辅助的严格校准表：

`docs/architecture/jd-sourcing-calibration-assistant-strict.csv`

它不是人工确认结果，只用于缩小人工复核范围。当前结果显示：

- 已审样本：56 / 56
- `contact_worthy`：7
- `research_more`：35
- `reject`：14
- LLM yes precision：26.9%
- 投影 contact-worthy 数：13
- 投影 cost per contact-worthy：`$0.0112`

这个结果说明 LLM light screen 明显偏乐观，尤其是 Serper/LinkedIn snippet-only 候选。下一步应优先人工复核 assistant_strict 标为 `contact_worthy` 的 7 行，再抽查 `research_more` 中的 Serper 行，判断是否需要 Bright/Profile 补全。
