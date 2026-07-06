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

## Human Review Queue

为避免 56 条样本从头人工扫一遍，当前已经生成最小复核队列：

- Markdown：`docs/architecture/jd-sourcing-human-review-queue.md`
- CSV：`docs/architecture/jd-sourcing-human-review-queue.csv`
- 生成命令：`npm run sourcing:human-review-queue`

队列共 24 行，按以下 bucket 排序：

- `confirm_assistant_contact_worthy`：7 行，先确认 assistant_strict 认为可联系的正例。
- `bright_probe_gate`：8 行，真实 Bright probe 前的花钱门控。
- `serper_snippet_risk`：5 行，检查 Serper/Google 摘要误判。
- `github_profile_needed`：2 行，判断 GitHub 证据是否值得继续找职业 profile。
- `negative_control`：2 行，少量负例对照。

使用方式：

1. 先阅读 `docs/architecture/jd-sourcing-human-review-pack.md`，它按 JD 展开了 P0/P1 候选证据。
2. 填写 `jd-sourcing-human-review-queue.csv` 中的 `human_decision`、`reviewer_type`、`human_reason`、`human_notes`。
3. `reviewer_type` 必须写清楚来源，例如 `human_headhunter`、`human_recruiter`、`codex_headhunter`。
4. 先完成 P0 bucket，尤其是 `confirm_assistant_contact_worthy` 和 `bright_probe_gate`。
5. 如果 `bright_probe_gate` 没有人审通过，不执行真实 Bright probe。
6. 人审完成后，再把结果合并回 benchmark 决策报告。

复核包生成命令：

```bash
npm run sourcing:human-review-pack
```

复核字段校验命令：

```bash
npm run sourcing:validate-human-review -- --out-md=docs/architecture/jd-sourcing-human-review-validation.md --out-json=docs/architecture/jd-sourcing-human-review-validation.json
```

强制检查 P0 是否全部完成：

```bash
npm run sourcing:validate-human-review -- --require-p0-complete
```

当前校验状态：

- Validation status：valid
- Reviewed rows：15 / 24
- P0 reviewed：15 / 15
- Bright gate reviewed：8 / 8
- Warnings：7 条 snippet-only `contact_worthy`，需要后续 profile completion 或真人猎头复核确认。
- 当前 P0 复核来源：`codex_headhunter`，不是真人猎头或真实招聘方反馈。

合并命令：

```bash
npm run sourcing:merge-human-review
```

默认会读取：

- `docs/architecture/jd-sourcing-calibration-samples.csv`
- `docs/architecture/jd-sourcing-human-review-queue.csv`

并输出：

- `docs/architecture/jd-sourcing-calibration-human-reviewed.csv`

注意：默认只合并 `human_decision` 已填写的行，未人工填写的行会保持空白，不会把 `assistant_strict` 当成人工结果。如果确实要把未人工复核的 assistant_strict 一起带入报告，需要显式加 `--include-unreviewed-assistant-strict`，但该模式不能作为真实人工校准。

人审合并后生成决策报告：

```bash
npm run sourcing:decision-report -- --benchmark-dir=runs/sourcing-benchmark/benchmark-2026-07-05T16-41-40-341Z-d05df7cc --calibration-csv=docs/architecture/jd-sourcing-calibration-human-reviewed.csv --manual-review-done --out=docs/architecture/jd-sourcing-benchmark-report.md
```

## Readiness Check

真实 Bright probe 前必须跑 readiness check：

```bash
npm run sourcing:human-review-readiness -- --out-md=docs/architecture/jd-sourcing-human-review-readiness.md --out-json=docs/architecture/jd-sourcing-human-review-readiness.json
```

当前状态：

- Reviewed rows：15 / 24
- P0 reviewed：15 / 15
- Bright gate reviewed：8 / 8
- Bright probe allowed：yes
- Approved Bright candidates：7

只有报告里 `Bright probe allowed: yes` 时，才允许进入真实 Bright probe。默认要求全部 P0 行完成；`--allow-partial-p0` 只能用于局部检查，不能作为完整人工校准依据。

## Bright Probe Runner

dry-run 预检命令：

```bash
npm run sourcing:bright-probe -- --dry-run --out-md=docs/architecture/jd-sourcing-bright-probe-run-report.md --out-json=docs/architecture/jd-sourcing-bright-probe-run-report.json
```

当前 dry-run 结果：

- Status：planned
- URL completion count：7
- Dataset filter count：2
- Estimated total cost：`$0.1425`
- Provider readiness checked：yes
- Provider readiness OK：yes
- Bright network checked：yes
- Bright balance：`$8.96`
- Block reason：无 dry-run 阻塞；当前仍是 dry-run，`Allow paid: no`，没有真实 Bright 调用。

真实执行必须显式使用：

```bash
npm run sourcing:bright-probe -- --live --allow-paid --max-budget-usd=1
```

只有 readiness report 放行后才允许运行该命令。

真实执行前还应重新生成 provider readiness 网络报告：

```bash
npx tsx scripts/sourcing/check-provider-readiness.ts --network --out-md=docs/architecture/jd-sourcing-provider-readiness.md --out-json=docs/architecture/jd-sourcing-provider-readiness.json
```

该命令只读查询 Bright 余额，不创建 snapshot。
