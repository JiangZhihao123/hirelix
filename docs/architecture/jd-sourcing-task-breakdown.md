# Hirelix JD Sourcing 实施任务拆分

本文是 `data-pipeline-optimization.md` 的实施拆分，不替代主方案。主方案负责描述完整数据管线；本文负责把它拆成可执行任务组，并说明每组任务在整体方案中解决什么问题、主要做什么、做到什么程度才算完成。

任务数量不是目标。后续任务可以继续拆分、合并或删除，但每个任务都必须能回到同一个总目标：

> 用户给一个 JD，Hirelix 能在合理时间和合理成本内找到 3 到 5 个招聘者愿意联系的人，并解释这些人为什么值得看、风险在哪里、还缺什么证据。

## 总体执行判断

当前阶段是“路线验证 + 原型收敛”，不是完整产品化。

- 完整方案仍然包括外部 sourcing、内部 ATS/CSV/简历导入、长期 profile index、JD-aware scoring 和 Candidate Research。
- 当前最核心的不确定性是数据源路线：低成本 discovery + 少量补全，能不能稳定产生 contact-worthy candidates。
- 当前不能直接进入完整 profile index、正式 UI、生产调度和 billing，因为数据源路线还没有被证明。
- 当前也不能把 Bright、Serper、Exa、Firecrawl 或某个脚本当成目标本身；它们只是数据管线的组件。

所有任务最终都要服务三个判断：

| 判断维度 | 要回答的问题 | 当前通过线 |
| --- | --- | --- |
| 质量 | 一个真实 JD 能否稳定得到 3 到 5 个 contact-worthy candidates | 10 个 JD 中至少 6 个达标 |
| 价格 | 每个 contact-worthy candidate 的外部数据成本是否可接受 | 总 benchmark 外部成本不超过 `$50`，Bright 首轮 cap `$1` |
| 速度 | 用户是否能在可接受等待内看到结果 | 3 分钟内出现前 5 个 reviewable profiles，8 分钟内形成首批候选池 |

## 完整数据管线路径

任务拆分必须贴着这条链路走：

```text
JD
  -> JD 解析 / headhunter brief / advancement rubric
  -> 已有资产覆盖判断：内部数据、已有 profile、缓存、历史证据
  -> sourcing lanes / provider-specific query plan
  -> 外部发现层：SERP、Exa、GitHub、公开网页、论文/专利等
  -> 补全层：Bright / LinkedIn URL completion / URL extraction
  -> lead 标准化、身份归并、evidence pack
  -> JD-aware light screen / deep score / lane diagnosis
  -> 候选人池交付：ready to review / needs evidence / insufficient coverage
  -> 用户选择后触发 Candidate Research
  -> 有价值数据沉淀到长期 profile index
```

当前任务只做到能够验证这条链路是否成立。长期 profile index、内部数据导入、正式 UI 和生产调度属于路线成立后的产品化任务。

## 当前证据状态

已经证明的事情：

- 冷启动 CLI 原型能从 JD 生成 sourcing lanes、调用低成本 discovery、生成候选卡片和成本账本。
- 10 JD live benchmark 已跑通，未启用 Bright，外部成本 `$0.145`，生成 168 张 candidate cards。
- Serper 当前是主要发现层，Exa/Firecrawl/GitHub 更像补充发现和证据层。
- DeepSeek light screen、candidate explanations、lane diagnosis、LLM cache、provider value report 已有基础版。
- Bright readiness 已完成只读网络检查，余额 `$8.96`；guarded runner 只有 dry-run，未执行付费调用。

还没有证明的事情：

- LLM raw yes 不能代表真实 contact-worthy；assistant_strict 显示 LLM yes precision 只有 26.9%。
- 当前 P0 复核是 `codex_headhunter`，不是真人猎头或真实用户反馈。
- Bright 还没有真实验证能否把高潜 LinkedIn URL 补成可判断 profile。
- warm index 只证明 LLM cache，不证明长期 profile index 能降低 sourcing 成本。
- Progressive delivery 的真实产品体验尚未验证。

## 任务组总览

这些是当前建议的任务组，不是固定数量。后续如果某组过大，可以继续拆；如果某组证明不需要，可以合并或删除。

| 任务组 | 它在整体里解决什么 | 当前状态 | 下一步 |
| --- | --- | --- | --- |
| G1 成功标准和 UX contract | 定义什么叫“产品成立”，以及用户应该看到什么 | 基础完成 | 作为所有后续任务验收口径 |
| G2 数据契约和边界 | 固定 Lead / Profile / Candidate / Evidence 的概念，避免后续返工 | 方案定义，原型部分完成 | 只保留必要接口，不先做大索引 |
| G3 JD 理解和 sourcing strategy | 把 JD 变成 sourcing thesis、lanes 和 provider queries | 基础完成 | 用误判样本修 prompt 和 lane 生成 |
| G4 数据源发现层 | 低成本找到候选线索和公开证据 | 基础完成 | 诊断 Serper 依赖、Exa 低产、GitHub error |
| G5 数据源补全层 | 只把高潜 leads 补成结构化 profile | dry-run 完成 | Bright live probe 需单独授权 |
| G6 标准化、去重和候选人卡片 | 把不同来源变成 recruiter 可评审候选人 | 基础完成 | 补强身份置信和证据完整度 |
| G7 JD-aware scoring 和解释 | 让质量来自 JD-specific 判断，不靠关键词 patch | 基础完成 | 做误判诊断后再改 rubric |
| G8 成本质量账本和 benchmark | 用实测比较质量、价格、速度 | 基础完成 | 用校准结果重算 provider value |
| G9 数据源路线决策 | 决定继续外部 sourcing、换 provider、转混合定位还是砍范围 | 未完成 | 二轮 benchmark 后更新主方案结论 |
| G10 产品化工程 | 路线成立后才做 profile index、ATS 导入、正式 UI、调度和 billing | 未开始 | 暂不启动 |

## G1：成功标准和 UX Contract

**这个任务组在整体里做什么**

它定义“Hirelix 做出来了”到底是什么意思。没有这组标准，后续很容易把 raw result count、LLM yes 数量、provider 返回数误认为产品成立。

**主要做什么**

- 固定 10 个代表性 JD：普通技术岗、高级基础架构、窄技能、location 严格、ML/research、相邻背景。
- 固定质量指标：reviewable profile、contact-worthy candidate、top 20 precision、lane drift、dedupe rate。
- 固定成本指标：external spend、cost per reviewable、cost per contact-worthy、Bright spend、LLM cost 分账。
- 固定速度指标：time to first 5 reviewable、time to first pool。
- 固定首版体验：10 秒内 brief，30-60 秒看到 lanes 和数据源状态，1-3 分钟看到首批 candidates，3-8 分钟形成解释和扩展建议。

**产出**

- `docs/architecture/benchmark-jds.md`
- 统一评审表和 calibration CSV
- UX contract 写入主方案
- benchmark 报告和 provider value report

**验收**

任何数据源、prompt、lane 或补全策略，都能用同一组 JD 和同一套指标比较。

## G2：数据契约和边界

**这个任务组在整体里做什么**

它固定数据管线里的核心对象，避免把 URL、lead、profile、search candidate 和长期人才库混成一层。

**主要做什么**

- 定义 `CandidateLead`、`CanonicalProfile`、`ProfileSource`、`ProfileIdentity`、`ProfileEvidence`、`SearchCandidate`。
- 定义内部数据和外部公开数据的可见性：`tenant_private`、`workspace_shared`、`global_public`、`restricted`。
- 明确内部 ATS/CSV/简历库是增强体验，不是外部 sourcing 做不好的兜底借口。
- 明确 profile index 是资产沉淀层，不是当前路线验证前置条件。

**产出**

- 数据契约
- source / identity / evidence 的最小字段
- 未来 profile index / internal ingestion 的接口边界

**验收**

当前 cold-start 原型能跑；将来接入 profile index 或 ATS/CSV 时，不需要重写 JD-aware scoring 和 candidate card 逻辑。

## G3：JD 理解和 Sourcing Strategy

**这个任务组在整体里做什么**

它把 JD 转成招聘搜索策略。这个任务组做不好，后面所有数据源都会被错误 query 带偏。

**主要做什么**

- 输出 `hiring_brief`、`headhunter_brief`、`sourcing_plan`、`recall_spec`、`advancement_rubric`。
- 区分 hard constraints、nice-to-have、可放宽项和误召风险。
- 生成 4 到 8 条 sourcing lanes：primary exact、primary relaxed、target company、adjacent authorized、exploration、public evidence 等。
- 为不同 provider 生成不同 query，不把 Bright filter、SERP X-ray、Exa semantic query 混成一套。
- 每条 lane 有目标、预算、放宽规则、停止条件和诊断字段。

**产出**

- `ParsedSearchIntent`
- `SourcingLane[]`
- provider-specific query plan
- lane diagnosis report

**验收**

每条 lane 的结果都能单独统计 returned、deduped、reviewable、contact-worthy、cost、latency 和失败原因。

## G4：数据源发现层

**这个任务组在整体里做什么**

它负责低成本找到候选线索，不负责最终 profile 质量。SERP、Exa、GitHub、公开网页、论文/专利都属于发现层或证据层。

**主要做什么**

- Serper / DataForSEO：Google-style X-ray、LinkedIn URL、个人网站、公司 team page、speaker page。
- Exa：语义网页发现、技术文章、hidden-gem 线索。
- Firecrawl：已知 URL 的页面抽取，不作为主搜索引擎。
- GitHub / OpenAlex / Semantic Scholar / USPTO：技术、学术、专利证据源。
- 记录每个 provider 的 minimum commit、unit price、free trial、time to first result、reviewable rate、failure modes。

**产出**

- discovery adapters
- normalized `CandidateLead`
- provider value table
- provider-lane value table

**验收**

发现层能证明哪些来源可以稳定带来 reviewable leads，哪些只是噪声或证据补充。

## G5：数据源补全层

**这个任务组在整体里做什么**

它把高潜 leads 补成可评分 profile。补全层不能变成大规模盲抓，也不能替代 Hirelix 自己的 sourcing strategy。

**主要做什么**

- Bright Dataset Filter 只做小额 lane probe，不做 JD 语义召回引擎。
- Bright LinkedIn URL/profile completion、LinkdAPI、Apify actors 等只用于 top leads。
- 每次补全记录 provider、source_url、lane、cost、fetched_at、profile completeness、identity confidence。
- 当前 Bright 只允许 dry-run；真实 live probe 必须显式授权，cap `$1`。

**产出**

- Bright dry/live probe report
- completed profile records
- completion value report

**验收**

能回答：补全是否把 `needs evidence` 候选转成 `contact-worthy` 或明确 `reject`，以及每个有效补全花多少钱。

## G6：标准化、去重和候选人卡片

**这个任务组在整体里做什么**

它把不同来源的 URL、公开文本和结构化数据变成 recruiter 能评审的候选人，而不是 raw provider payload。

**主要做什么**

- 标准化 `CandidateLead`。
- 强身份合并：LinkedIn URL、verified email、互相印证的 GitHub URL。
- 弱身份只聚类：姓名 + 公司、姓名 + title + location。
- 禁止仅凭姓名或 LLM 判断自动合并。
- 生成 candidate card：name、title、company、location、source mix、evidence links、risk flags、missing evidence、next action。

**产出**

- normalized leads
- identity key / identity confidence
- evidence pack
- candidate cards JSON/Markdown

**验收**

候选人卡片能去重、可解释、可追溯，但不会因为弱证据把不同人误合并成一个 profile。

## G7：JD-aware Scoring 和解释

**这个任务组在整体里做什么**

它让质量来自 JD-specific 判断，而不是关键词、title、公司名或人工 hard-code patch。

**主要做什么**

- Light screen 输出 `would_advance`、reason、deal_breaker、missing_evidence、source_confidence、profile_completeness。
- Deep score 聚焦 top 30 到 80，生成风险、外联角度和更强解释。
- Lane diagnosis 判断 lane 是太窄、太宽、漂移、重复还是质量不足。
- 缓存 JD parsing、rubric、profile schema 和重复 prompt。

**产出**

- light screen results
- deep score / explanation
- lane diagnosis
- LLM cost and cache ledger

**验收**

`contact-worthy` 定义严格：不是“看起来相关”，而是招聘者愿意加入 outreach / shortlist。`maybe` 只能算 reviewable。

## G8：成本质量账本和 Benchmark

**这个任务组在整体里做什么**

它把数据源讨论从感觉变成实测。没有这组账本，就无法判断到底是数据源问题、query 问题、补全问题还是评分问题。

**主要做什么**

- 记录 search、lane、provider、query、raw result、normalized lead、LLM decision、cost、latency。
- 记录 returned、inserted、deduped、reviewable、contact-worthy、duplicates、failure_type。
- 分开统计 external data cost、LLM cost、completion cost。
- 跑 10 JD cold benchmark。
- 抽查 top candidates、maybe、reject、每条 lane 前 10 个 rejected samples。
- 区分 LLM 预评、Codex 猎头视角复核、真人猎头/真实用户反馈。

**产出**

- run directory
- cost-ledger.jsonl
- calibration samples
- provider value report
- benchmark decision report

**验收**

能用质量、价格、速度三个维度比较 Bright-only、SERP+补全、Exa/Firecrawl、GitHub/evidence 和 Hybrid。

## G9：数据源路线决策

**这个任务组在整体里做什么**

它决定 Hirelix 下一步到底做什么，而不是继续无限优化局部。

**主要做什么**

- 汇总 benchmark、provider value、calibration、quality gap、Bright probe 结果。
- 明确当前路线是否能稳定产出 3 到 5 个 contact-worthy candidates。
- 判断 Bright 是补全源、结构化 profile 原料、低优先级补充，还是应该暂时放弃。
- 判断 Serper/Exa/Firecrawl/GitHub 是否足够支撑冷启动。
- 判断是否需要继续找新的 underlying people data provider。
- 判断是否转成“外部 sourcing + 用户内部库增强”的混合定位。

**可选结论**

- 继续 SERP + 补全 hybrid。
- Bright 只保留为 URL/profile completion 或极低优先级结构化源。
- 继续找新的 underlying data providers。
- 转成外部 sourcing + 用户内部库增强的混合定位。
- 砍掉外部 sourcing，转 JD-aware rediscovery / evaluation。
- 进入 profile index 和产品化工程。

**验收**

结论必须回答质量、价格、速度，不能只说“继续优化”。

## G10：产品化工程

**这个任务组在整体里做什么**

它在数据源路线成立后，把原型变成正式产品能力。现在不应该抢跑。

**主要做什么**

- Postgres `pgvector`、`pg_trgm`、全文索引。
- canonical profile schema、profile sources、identities、experiences、evidence、embeddings。
- ATS/CSV/简历/LinkedIn URL ingestion。
- 正式 search UI 和 progressive delivery。
- 外部 sourcing 编排服务、队列、重试、provider 策略。
- billing、预算、per-user quota 和 production observability。

**启动条件**

- G9 证明至少一种数据源组合能稳定产出 contact-worthy candidates。
- 已确认哪些 profile/evidence 字段真的影响候选人质量。
- 已确认 cost per contact-worthy candidate 能进入产品毛利模型。

**验收**

产品不只是能跑一次 search，而是每次外部支出都能沉淀成 Hirelix 自己的可复用数据资产。

## 当前推荐执行切片

现在不要继续扩写架构，也不要马上做 profile index / UI / ATS 导入。

推荐先做一个非付费质量诊断切片：

1. 基于已有 10 JD benchmark 和校准样本，输出 quality gap report。
2. 明确哪些误判来自 Serper snippet-only、Exa 低产、GitHub error、lane drift、JD parsing 或 LLM rubric。
3. 只改 G3 / G6 / G7 里真正影响质量的部分，不做具体人名、公司、关键词 hard-code patch。
4. 再跑一次 no-Bright 二轮 10 JD benchmark。
5. 用 G9 做路线判断：是否值得授权 Bright 极小 live probe、是否要找新 provider、是否转混合定位。

Bright 真实调用不是默认下一步。当前 Bright 余额 `$8.96`，首轮 live probe 必须单独授权，cap `$1`。
