# JD Sourcing Quality Gap Report

本报告用于执行 `jd-sourcing-task-breakdown.md` 的当前推荐切片：先做非付费质量诊断，再决定是否修 G3/G6/G7、进入二轮 no-Bright benchmark，或申请 Bright 极小 live probe。

## 总判断

- 当前不是产品化阶段，仍是数据源路线和候选人质量验证阶段。
- 主要问题不是 LLM 成本，也不是 UI/schema，而是低成本 discovery 结果能否通过补证和 JD-aware 判断变成 contact-worthy candidates。
- 本报告不调用任何外部服务，不消耗 Bright。

## 输入证据

- Benchmark：`benchmark-2026-07-05T16-41-40-341Z-d05df7cc`
- Benchmark dir：`/Users/noah/projects/hirelix/runs/sourcing-benchmark/benchmark-2026-07-05T16-41-40-341Z-d05df7cc`
- Calibration：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-calibration-human-reviewed.csv`
- Review queue：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-human-review-queue.csv`
- Providers：`serper,exa,firecrawl,github`
- Actual external cost：$0.1450
- Candidate cards：168
- Raw LLM yes / maybe / no：50 / 53 / 65

## 校准状态

- 已复核样本：15/56
- 复核来源：codex_headhunter=15
- 已复核 yes precision：53.8%
- contact_worthy / research_more / reject：7 / 7 / 1
- snippet-only reviewed / research_more：15 / 7
- review queue P0：15/15
- Bright gate：8/8 reviewed，approved 7

## Provider 诊断

| Provider | Returned | Cards | Raw contact-worthy | Raw rate | Cost | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| exa | 85 | 85 | 3 | 3.5% | $0.0850 | 0 |
| firecrawl | 20 | 0 | 0 | 0.0% | $0.0400 | 0 |
| github | 9 | 0 | 0 | 0.0% | $0.0000 | 2 |
| serper | 91 | 83 | 47 | 56.6% | $0.0200 | 0 |

## Quality Gaps

### QG-01 P0 LLM yes 过于乐观，不能直接当作 contact-worthy

- Area：G7
- Impact：如果直接用 raw yes 进入二轮 benchmark 或产品化，会高估 provider 质量和真实可联系人数。
- Evidence：
  - Codex 猎头视角已复核 yes precision：53.8%。
  - Codex 猎头视角样本：15/56，复核来源：codex_headhunter=15。
  - assistant_strict yes precision：26.9%。
- Recommended change：提高 light screen 的 yes 门槛：snippet-only 候选默认最多 research_more；yes 必须有 JD 核心职责、资历、技能或领域的直接证据。
- Next validation：重新生成 calibration samples，比较 yes precision 和 research_more 数量变化。

### QG-02 P0 Serper/LinkedIn snippet-only 是最大证据缺口

- Area：G6
- Impact：Google 摘要能发现人，但不足以稳定判断是否值得联系；如果不补证据，会把搜索摘要误判成 profile 质量。
- Evidence：
  - snippet-only research_more：7。
  - review queue 中 snippet-only contact_worthy warning：7。
  - Bright gate approved：7/8。
- Recommended change：candidate card 增加更硬的 evidence completeness 标记；LinkedIn snippet-only 候选默认进入 needs evidence，不直接进入 ready to review。
- Next validation：用不付费方式先重算 snippet-only 风险；Bright URL completion 只有在用户授权后做极小 probe。

### QG-03 P1 Exa 当前更像补充发现源，不像主召回来源

- Area：G4
- Impact：如果二轮继续给 Exa 同等预算，会把钱花在低产语义网页结果上，拉低 time/cost per useful candidate。
- Evidence：
  - Exa cards：85。
  - Exa raw contact-worthy：3，raw rate：3.5%。
  - Exa zero-yield paid lanes：14。
- Recommended change：Exa 不做主候选枚举；只保留 public evidence / hidden-gem lanes，并降低默认结果数，优先用于补证据。
- Next validation：二轮 benchmark 单独对比 Exa evidence-only query 是否提升 research_more -> contact/reject 的判断率。

### QG-04 P1 GitHub 不能作为初始候选交付来源

- Area：G4
- Impact：当前 GitHub 结果无法稳定映射到职业 profile；作为主召回会制造 404、身份不确定和无候选卡片。
- Evidence：
  - GitHub returned：9。
  - GitHub cards：0。
  - GitHub errors：2。
- Recommended change：GitHub 降级为技术证据 enrichment；只有已存在候选人身份时再拉 repo/user 证据。
- Next validation：二轮 benchmark 不把 GitHub 计入初始候选交付，只统计它是否提升 top candidates 的证据强度。

### QG-05 P1 Firecrawl 当前只有抽取成本，没有直接候选归因

- Area：G4
- Impact：Firecrawl 的价值不能按 direct candidate count 评估；它应服务证据补强，而不是主召回。
- Evidence：
  - Firecrawl cost：$0.0400。
  - Firecrawl cards：0。
- Recommended change：Firecrawl 只抓 top non-LinkedIn URLs，并把输出写入 evidence pack；二轮报告统计 evidence upgrade，而非 direct contact-worthy。
- Next validation：用 candidate card completeness 对比抓取前后 needs evidence 是否下降。

### QG-06 P1 部分付费 lane 有结果但没有 raw contact-worthy

- Area：G3
- Impact：这些 lane 可能太宽、语义漂移或 query 目标不清；继续扩量会增加成本但不提升候选质量。
- Evidence：
  - zero-yield paid lanes：16。
  - 代表 lane：JD-02/exa/lane-5 cards=10 cost=$0.0100; JD-03/exa/lane-4 cards=5 cost=$0.0050; JD-04/exa/lane-3 cards=5 cost=$0.0050; JD-04/exa/lane-5 cards=5 cost=$0.0050; JD-05/exa/lane-3 cards=5 cost=$0.0050。
- Recommended change：对 zero-yield paid lanes 默认 stop 或 revise_query；只有能说明具体证据增益时才保留。
- Next validation：二轮 benchmark 对每条保留 lane 输出 stop/revise/expand 诊断和原因。

### QG-07 P2 当前路线高度依赖 Serper/X-ray

- Area：G9
- Impact：短期可继续用 Serper 证明冷启动，但这不是长期数据壁垒；需要补全层和 profile index 把一次性搜索资产沉淀下来。
- Evidence：
  - Serper raw contact-worthy：47/50。
  - Serper cards：83。
- Recommended change：二轮仍可保留 Serper 为默认 discovery，但报告必须区分 discovery success 和 profile quality success。
- Next validation：二轮 benchmark 分别统计 Serper raw lead、补全后 profile、最终 contact-worthy 三层转化。

## Recommended Execution

- Immediate slice：非付费质量诊断后，先修 G3/G6/G7，再跑 no-Bright 二轮 benchmark。

Do now：
- 收紧 light screen yes 门槛，snippet-only 默认 needs evidence/research_more。
- 把 candidate card 的 evidence completeness 和 snippet-only risk 作为显式字段参与排序。
- 对 zero-yield paid lanes 默认 stop/revise_query，减少 Exa broad semantic lane 默认预算。
- GitHub/Firecrawl 只作为 evidence enrichment，不作为初始候选交付来源。

Do not do yet：
- 不执行 Bright live probe，除非用户明确授权并接受 $1 cap。
- 不做 profile index、ATS 导入、正式 UI 或生产调度。
- 不通过 hard-code 具体人名、公司名、title 关键词修质量。

Next report：先产出 G3/G6/G7 修正 diff 和二轮 no-Bright benchmark plan。

## No-Bright 二轮 Benchmark 前置修正

| 对应任务组 | 修正方向 | 验证方式 |
| --- | --- | --- |
| G3 JD 理解和 sourcing strategy | 对 zero-yield paid lanes 默认 stop/revise_query，保留高意图 X-ray lane | lane diagnosis 中输出 stop/revise/expand 和原因 |
| G6 标准化、去重和候选人卡片 | snippet-only 显式标记 needs evidence，不直接作为 ready to review | candidate card completeness 和 snippet-only risk 进入排序/报告 |
| G7 JD-aware scoring | 收紧 yes 门槛，缺核心证据时输出 research_more | 新 calibration yes precision 必须高于当前 26.9% |
| G4 数据源发现层 | Exa/GitHub/Firecrawl 先作为 evidence/enrichment，不作为主交付来源 | 二轮 provider value 分开统计 discovery 和 evidence value |
