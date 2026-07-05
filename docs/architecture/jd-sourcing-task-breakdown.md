# Hirelix JD Sourcing 任务拆分

本文把 `data-pipeline-optimization.md` 拆成可执行任务。当前口径是零基设计：不兼容旧链路，不先做完整产品化重构，不先建设大规模 profile index。下一阶段唯一目标是验证：

> 一个真实 JD 进来后，Hirelix 能否在可控成本内找到值得联系的人。

首轮工作只服务冷启动 sourcing 原型和 10 个 JD benchmark。正式 UI、完整索引、用户级权限、生产调度和复杂 billing 都放到 benchmark 证明路线成立之后。

## 当前实现状态

截至当前原型提交，已完成第一批可执行闭环：

- `S0-1` 已完成：10 个固定 benchmark JD 记录在 `docs/architecture/benchmark-jds.md`。
- `S0-2` 已完成基础版：统一 light-screen rubric 已进入 `scripts/sourcing/llm.ts`，人工校准样本表记录在 `docs/architecture/jd-sourcing-calibration-samples.csv`。
- `S0-3` 已部分完成：实验账本先用 `cost-ledger.jsonl` 和 run directory 表达；还未建设 benchmark 聚合表。
- `S0-4` 已完成基础版：`--allow-paid`、总预算和 Bright 子预算 guardrail 已进入 CLI。
- `S0-5` 已完成：`scripts/sourcing/check-provider-readiness.ts` 可只读检查 provider key，并可通过 `--network` 查询 Bright 余额。
- `S1-1` 到 `S1-6` 已完成基础版：`scripts/sourcing/run-cold-start.ts` 支持 JD 输入、run directory、LLM parsing、lane generation、provider plan 和成本账本。
- `S2-1` 已完成基础版：Serper discovery adapter 可执行 X-ray URL discovery，并把结果转成 `CandidateLead`。
- `S2-2` 已完成基础版：Exa semantic discovery adapter 可执行语义网页发现，并把结果转成 `CandidateLead`。
- `S2-3` 已完成基础版：Firecrawl 作为 top URL extraction 层接入，只抽 discovery 后的非 LinkedIn top leads。
- `S2-4` 已完成基础版：GitHub evidence adapter 可对 GitHub user/repo URL 拉取公开用户和 repo 证据，不作为主召回。
- `S2-5` 已完成 adapter 基础版：Bright probe 可生成保守 Dataset Filter，并受 `brightBudgetUsd`、`brightRecordsLimit` 和 `--allow-paid` 保护；尚未在本轮触发真实 Bright snapshot。
- `S2-6` 已完成基础版：provider error/blocked ledger 会记录 `failure_type`，区分 auth、rate limit、timeout、bad query、budget blocked、no result 和 provider error。
- `S3-1`、`S3-3`、`S3-4` 已完成基础版：支持 URL lead 归一化、URL 去重、Firecrawl evidence pack 和候选人卡片。
- `S3-2` 已完成基础版：候选卡片按 LinkedIn/GitHub URL 强合并，按姓名+标题弱合并，并保留 `identity_key` 和 `identity_confidence`。
- `S3-5` 已完成基础版：Firecrawl/GitHub evidence 支持 URL cache，可用 `--no-evidence-cache` 关闭。
- `S4-1` 已完成基础版：DeepSeek light screen 输出统一 `would_advance` rubric，并明确 snippet-only 证据不足时不能轻易给 `yes`。
- `S4-2` 已完成基础版：lane diagnosis 可按 lane 解释 query、provider、预算和覆盖问题。
- `S4-3` 已完成基础版：light screen 后会导出 `candidate-explanations.md`，给出招聘人员可读的推进理由、风险和缺失证据。
- `S4-4` 已完成基础版：LLM 本地 cache 写入 `runs/sourcing/.llm-cache`，重复 dry-run 可命中缓存。
- `S4-5` 已完成基础版：light screen 后导出 `review-samples.csv`，并可通过 `scripts/sourcing/build-calibration-samples.ts` 聚合成 benchmark 级校准表。
- `S5-1` 已完成基础版：2 个 JD live smoke 已跑通，报告记录在 `docs/architecture/jd-sourcing-smoke-report.md`。
- `S5-2` 已完成：`scripts/sourcing/run-benchmark.ts` 可批量解析 `benchmark-jds.md` 并执行 cold/live benchmark；10 JD dry benchmark 和 10 JD live benchmark 均已通过。
- `S5-3` 已完成基础版：`scripts/sourcing/compare-warm-rerun.ts` 可对比 cold/warm benchmark 目录；`--llm-cache-dir` 支持跨 benchmark 复用 LLM cache。tracked 报告见 `docs/architecture/jd-sourcing-warm-comparison.md`。当前只证明 LLM cache，不等于 profile/provider index。
- `S5-4` 已完成基础版：benchmark runner 会输出 `provider-value-table.csv` 和 `provider-lane-value-table.csv`，包含 provider/lane 成本、成功/错误、返回数、平均延迟、reviewable/contact-worthy 和单个可联系人成本。
- `S5-5` 已完成报告骨架：`scripts/sourcing/build-benchmark-decision-report.ts` 可生成 `docs/architecture/jd-sourcing-benchmark-report.md`；当前基于 10 JD live benchmark 的结论是“需要人工校准”，不能直接进入产品化。
- Bright/Profile dry probe plan 已完成：`scripts/sourcing/build-bright-probe-plan.ts` 会从 assistant_strict 校准结果中选择最值得补全的 LinkedIn snippet-only 样本，并生成 `docs/architecture/jd-sourcing-bright-probe-plan.md` / `.json`。该脚本只读本地 benchmark 产物，不调用 Bright，不创建 snapshot。

尚未完成：真人复核 assistant_strict 校准结果、基于真人确认结果更新 contact-worthy 成本、执行真实 Bright 极小 probe 对照。

## 执行边界

- 外部总预算：10 个 JD benchmark 不超过 `$50`。
- Bright 约束：当前余额约 `$9`，首轮 Bright 子预算建议不超过 `$5`，超过必须单独确认。
- 不做真实付费调用前，先打印预计 provider、query、record 数和最大花费。
- DeepSeek v4 flash 可以积极使用，质量优先，不因为省 token 降低候选人判断质量。
- 内部 ATS/CSV/简历库只作为增强项，不作为外部 sourcing 做不好的解释。
- 任务验收以 benchmark 数据为准，不以“代码写完”作为成功标准。

## Milestone 0：实验协议和任务脚手架

目标：把验证边界、输入输出、成本账本和评审口径固定下来。

| ID | 任务 | 产出 | 验收标准 |
| --- | --- | --- | --- |
| S0-1 | 固定 10 个 JD 样本 | `docs/architecture/benchmark-jds.md` 或 JSON fixture | 覆盖普通技术岗、高级基础架构、窄技能、location 严格、ML/research、相邻背景 |
| S0-2 | 定义统一评审表 | `would_advance` rubric schema | `yes/no/maybe`、风险、缺失证据、来源可信度、下一步动作都有字段 |
| S0-3 | 定义实验账本 schema | JSONL/SQLite/Postgres 任选其一，优先简单 | 能记录 search、lane、provider、query、raw result、normalized lead、LLM decision、cost、latency |
| S0-4 | 增加预算 guardrail | 原型运行前检查预算 | 没有 `--allow-paid` 或明确预算参数时，不触发 Bright/Data provider 付费调用 |
| S0-5 | 增加账号 readiness check | `scripts/sourcing/check-provider-readiness.ts` | 只读检查 DeepSeek、Serper、Exa、Firecrawl、Bright env 是否存在；Bright 先查余额，不创建 snapshot |

完成标志：可以在不花钱的情况下跑 readiness check，并知道哪些 provider 可以参与首轮实验。

## Milestone 1：冷启动原型最小闭环

目标：输入一个 JD，输出 sourcing lanes、候选线索、轻筛结果、候选人卡片和成本账本。

| ID | 任务 | 产出 | 验收标准 |
| --- | --- | --- | --- |
| S1-1 | 搭建 CLI 原型入口 | `scripts/sourcing/run-cold-start.ts` | 支持传入 JD 文件、预算、provider allowlist、dry-run |
| S1-2 | JD parsing | `ParsedSearchIntent` JSON | 能输出 role family、seniority、must-have、nice-to-have、location、target companies、avoid 条件 |
| S1-3 | Sourcing lane generation | `SourcingLane[]` | 每个 JD 生成 4 到 8 条 lane，每条 lane 有目标、query 策略、放宽规则、停止条件 |
| S1-4 | Provider query planner | provider-specific query plan | Serper/Exa/Bright/GitHub 的 query 不混在一起，能记录每条 query 属于哪条 lane |
| S1-5 | Cost ledger | `cost-ledger.jsonl` | 每次 provider 调用前后记录 estimated/actual cost、latency、returned、error |
| S1-6 | Result bundle | `runs/<run_id>/` | 每次运行保存输入 JD、lanes、raw payload、normalized leads、screening、report |

完成标志：dry-run 能完整生成计划；小额真实运行能形成可复盘 run directory。

## Milestone 2：Provider 接入和分层召回

目标：先用低成本 discovery 找线索，再只对高潜线索做补全；Bright 只做小样本对照和结构化 probe。

| ID | 任务 | 产出 | 验收标准 |
| --- | --- | --- | --- |
| S2-1 | Serper discovery adapter | `SerperDiscoveryProvider` | 支持 X-ray LinkedIn、个人网站、GitHub、公司 team/blog 查询；返回 URL lead |
| S2-2 | Exa semantic discovery adapter | `ExaDiscoveryProvider` | 用于语义网页发现和 hidden-gem 线索；记录命中原因 |
| S2-3 | Firecrawl extraction adapter | `FirecrawlExtractor` | 只抓 top URL；能抽取 title、summary、profile text、source evidence |
| S2-4 | GitHub evidence adapter | `GitHubEvidenceProvider` | 只作为技术证据补充，不作为主召回；能按 username/repo/org 获取公开证据 |
| S2-5 | Bright dataset probe adapter | `BrightProbeProvider` | 默认 hard cap 25 到 100 records；首轮总 Bright 子预算不超过 `$5` |
| S2-6 | Provider failure taxonomy | 错误分类和报告字段 | 能区分 no result、rate limit、auth failure、bad query、budget blocked、provider unavailable |

完成标志：至少 Serper + Exa/Firecrawl + Bright probe 三类来源可以在同一个 JD run 中被比较。

## Milestone 3：Lead 归一化、去重和候选卡片

目标：把不同来源的 URL、公开文本和结构化 profile 变成可评审候选人。

| ID | 任务 | 产出 | 验收标准 |
| --- | --- | --- | --- |
| S3-1 | `CandidateLead` normalizer | 标准 lead schema | 支持 URL lead、LinkedIn lead、GitHub lead、Bright record、网页证据 |
| S3-2 | 临时 identity resolver | strong/weak identity merge | LinkedIn URL、email、GitHub URL 强合并；姓名+公司+标题只做弱聚类 |
| S3-3 | Evidence pack builder | `ProfileEvidence[]` | 每个候选人能看到来源 URL、摘取文本、时间戳、provider |
| S3-4 | Candidate card builder | 候选人卡片 JSON/Markdown | 卡片包含姓名、当前/最近职位、公司、location、匹配理由、风险、缺失证据、来源 mix |
| S3-5 | Reusable cache policy | run cache / evidence cache | 同一 URL 和同一 Bright filter hash 可复用；benchmark 独立评测时可禁用跨 provider 污染 |

完成标志：不同 provider 的结果可以进入同一候选人卡片，但 benchmark 仍能追溯每个 provider 的独立贡献。

## Milestone 4：LLM 轻筛和质量评审

目标：让 DeepSeek v4 flash 判断“是否值得推进”，而不是只做关键词匹配。

| ID | 任务 | 产出 | 验收标准 |
| --- | --- | --- | --- |
| S4-1 | Light screen prompt | JSON schema prompt | 输出 `would_advance`、`reason`、`deal_breaker`、`missing_evidence`、`source_confidence`、`profile_completeness` |
| S4-2 | Lane diagnosis prompt | lane-level 诊断 | 能解释 lane 质量差是因为 query、数据源覆盖、预算、地点还是 JD 过窄 |
| S4-3 | Candidate explanation | 候选人短解释 | 每个 top candidate 给出招聘人员能看懂的推进理由和风险 |
| S4-4 | LLM cache | prompt/input hash cache | 重跑同一 run 不重复消耗 LLM；缓存命中率进入账本 |
| S4-5 | 校准样本导出 | review CSV/Markdown | 导出 top yes/maybe/reject 样本，方便人工抽查 |

完成标志：Top 20 候选人都有统一 rubric 结果，`maybe` 不计入 contact-worthy。

## Milestone 5：Benchmark 运行和决策报告

目标：用固定 10 个 JD 回答数据源路线是否成立。

| ID | 任务 | 产出 | 验收标准 |
| --- | --- | --- | --- |
| S5-1 | 2 个 JD smoke test | smoke report | 先验证端到端格式、预算日志、provider 权限，不追求结论 |
| S5-2 | 10 个 JD cold benchmark | benchmark runs | 每个 JD 记录 Internal-only、Bright-only、SERP+补全、Exa/Firecrawl、Hybrid |
| S5-3 | Warm index rerun | cold vs warm 对比 | 同一批 JD 在写入临时 cache 后重跑，比较成本、速度、质量 |
| S5-4 | Provider value table | provider 实测矩阵 | 记录 reviewable rate、contact-worthy rate、cost per contact-worthy、latency、failure modes |
| S5-5 | 决策报告 | `docs/architecture/jd-sourcing-benchmark-report.md` | 明确选择：继续外部 sourcing、转混合定位、换 provider、或砍范围 |

完成标志：不是“感觉能做”，而是有 10 个 JD 的成本、速度、质量数据。

## Milestone 6：通过 benchmark 后才做的产品化工程

这些任务不应该抢在 benchmark 前面做。

| ID | 任务 | 触发条件 |
| --- | --- | --- |
| P1-1 | Postgres `pgvector` / `pg_trgm` / 全文索引 | Benchmark 证明至少一组数据源组合能稳定产出可联系人 |
| P1-2 | Canonical profile index schema | 已确认哪些 profile/evidence 字段真的影响候选人质量 |
| P1-3 | 正式搜索 UI | 候选卡片和不足解释已经在原型里验证有效 |
| P1-4 | 外部 sourcing 编排服务 | CLI 原型跑通，provider 策略稳定 |
| P1-5 | 用户导入 ATS/CSV/简历库 | 外部 sourcing 主体验成立后，作为增强项接入 |
| P1-6 | 生产预算和 billing 约束 | 单次搜索成本模型已有实测数据 |

## 推荐执行顺序

1. 做 S0-1 到 S0-5，锁定实验协议和预算 guardrail。
2. 做 S1-1 到 S1-6，先让 dry-run 和 run directory 成立。
3. 做 S2-1、S2-2、S2-3，先跑低成本 discovery。
4. 做 S4-1、S4-3，让候选人先能被评审。
5. 做 S3-1 到 S3-4，把 provider 结果统一成候选卡片。
6. 做 S2-5，加入 Bright 极小 probe 作为对照，不先扩量。
7. 做 S5-1，跑 2 个 JD smoke。
8. 修正明显问题后跑 S5-2 到 S5-5。
9. 只有 benchmark 通过，再进入 Milestone 6。

## 下一批任务拆分

当前不要再扩工程设施，下一批只做验证路线的最小闭环：

| 优先级 | 任务 | 是否付费 | 验收标准 |
| --- | --- | --- | --- |
| P0 | 跑完整 10 JD live benchmark，不启用 Bright | 已完成；实际外部成本 `$0.145` | 10 个 JD 全部 completed，已生成 provider/lane 质量归因表 |
| P0 | 人工抽查 yes/maybe 样本 | 校准表已生成，不花钱 | 填写 `jd-sourcing-calibration-samples.csv` 的 `reviewer_decision`，确认 snippet-only 没有误判为 contact-worthy |
| P0 | 生成正式决策报告 | 否 | `jd-sourcing-benchmark-report.md` 从“不能决策”更新为基于 10 JD live 数据的结论 |
| P1 | 用 shared LLM cache 做 cold/warm 对比 | 已完成；不花钱 | `jd-sourcing-warm-comparison.md` 明确区分 LLM cache 收益和 provider/profile index 缺口 |
| P1 | Bright/Profile dry probe plan | 已完成；不花钱 | 选出 2 个 JD、10 个 LinkedIn snippet-only 候选，预计真实 Bright 成本 `$0.1500`，计划见 `jd-sourcing-bright-probe-plan.md` |
| P1 | Bright 极小真实 probe 对照 | 是，必须单独确认；当前余额约 `$9` | 默认只按 dry plan 执行；首轮建议 cap `$1`，验证 Bright URL/Profile completion 和 Dataset Filter 对照，不验证泛语义召回 |
| P2 | 根据结果决定是否做临时 profile/evidence index | 否 | 只有当外部 sourcing 产出稳定 contact-worthy，才进入 Milestone 6 |

## 最新 10 JD Live Benchmark 结果

- Run：`runs/sourcing-benchmark/benchmark-2026-07-05T16-41-40-341Z-d05df7cc`
- Providers：`serper,exa,firecrawl,github`
- Bright：未启用，`bright_budget_usd=0`
- JD：10 个全部 completed，0 个 run error
- 实际外部成本：`$0.145`
- Candidate cards：168
- LLM yes / maybe / no：50 / 53 / 65
- LLM contact-worthy rate：29.8%
- cost per LLM-contact-worthy：`$0.0029`
- assistant_strict 校准样本：56 条
- assistant_strict contact-worthy：7 条，research_more：35 条，reject：14 条
- assistant_strict LLM yes precision：26.9%
- assistant_strict 投影 cost per contact-worthy：`$0.0112`

## Bright/Profile Dry Probe Plan

- 脚本：`npm run sourcing:bright-probe-plan`
- 产物：`docs/architecture/jd-sourcing-bright-probe-plan.md` 和 `docs/architecture/jd-sourcing-bright-probe-plan.json`
- 模式：dry plan only，不调用 Bright，不创建 snapshot。
- 输入：`docs/architecture/jd-sourcing-calibration-assistant-strict.csv`
- 选择口径：`reviewer_decision=research_more`、`snippet_only_risk=yes`、优先 LinkedIn URL、优先 Serper/Exa discovery。
- 当前选中：2 个 JD、10 个候选人。
- 预计 URL/Profile completion 成本：`$0.0250`。
- 预计 Dataset Filter 对照成本：`$0.1250`。
- 预计总 Bright 成本：`$0.1500`，低于建议首轮 cap `$1`。
- 解释：这不是 Bright 召回扩量计划，而是验证 Bright 能否把 Serper/Google 摘要型候选补成可判断 profile 的最小实验。

## Cold/Warm 对比结论

- 脚本：`npm run sourcing:compare-warm`
- 产物：`docs/architecture/jd-sourcing-warm-comparison.md` 和 `docs/architecture/jd-sourcing-warm-comparison.json`
- 当前对比：1 个 JD dry-run cold/warm 配对。
- LLM cache hits：0 -> 2。
- LLM latency：9256ms -> 0ms。
- 外部 provider 成本：`$0` -> `$0`，候选卡片：0 -> 0。
- 结论：当前证据只证明 LLM cache 对重复解析/筛选有用，不能证明 warm profile index 或 provider result cache 已经能降低外部 sourcing 成本，也不能证明本地索引能满足 JD。

关键风险：

- 当前 contact-worthy 是 LLM light screen 结果，不是人工确认结果。
- assistant_strict 显示 LLM yes 明显偏乐观，必须真人复核后才能决定是否进入产品化。
- Serper 贡献 47/50 个 LLM contact-worthy，路线高度依赖 Google-style discovery；必须人工确认这些不是搜索摘要误判。
- Exa 当前 contact-worthy rate 只有 3.5%，更像补充发现源，不像主数据源。
- Firecrawl 当前只做 evidence extraction，不直接产生候选；它的价值要看人工校准后是否提升确认率。

## 第一批应该立刻开始的任务

如果现在开始写代码，第一批只做 5 个任务：

1. `S0-5`：provider readiness check，确认 key、余额和权限，不花钱。
2. `S1-1`：CLI 原型入口和 run directory。
3. `S1-2` + `S1-3`：JD parsing 和 sourcing lanes。
4. `S2-1`：Serper discovery adapter。
5. `S4-1`：DeepSeek light screen rubric。

这 5 个任务完成后，就能用一个 JD 做低成本 smoke test。不要一开始就做完整数据库 schema、正式页面或大规模 Bright 拉取。
