# Hirelix 候选人索引与排序最终方案

**日期**：2026-07-15  
**状态**：首版实施方案  
**目标**：使用 Bright Dataset 建设 Hirelix 自有候选人索引，并针对每个 JD 找到 3 到 5 个招聘者真正愿意联系的人。

## 1. 当前决策

首版只解决一条核心链路：

```text
Bright Dataset
  -> 本地候选人库
  -> 候选人和工作经历双层索引
  -> JD 混合检索
  -> 绝对合格门槛
  -> Facemash 式成对比较
  -> 最终候选人交付
```

当前明确采用以下约束：

- 外部候选人 profile 只来自 Bright Dataset。
- Bright 负责提供履历原料，不负责理解 JD、搜索和最终排序。
- Hirelix 自己保存数据、建立索引并复用。
- 不使用 Serper、Exa、GitHub、Firecrawl 或 Bright URL Scraper 作为首版核心链路。
- 不考虑数据刷新、数据时效、历史版本和多数据源身份归并。
- 不引入 Elasticsearch、OpenSearch 或独立向量数据库。
- 第一阶段只选择 1 个真实 JD，从 Bright 最多召回 500 人验证完整链路。

## 2. 已验证的数据基础

2026-07-15 对 Bright LinkedIn Dataset Filter 进行了 100 人实测：

| 指标 | 结果 |
| --- | ---: |
| 请求 / 返回 | 100 / 100 |
| 唯一 LinkedIn URL | 100 |
| 姓名、职位、当前公司、地点 | 100% |
| 有工作经历 | 98% |
| 有任职时间 | 97% |
| 有经历描述 | 54% |
| 有教育经历 | 94% |
| 有 About | 68% |
| 有原始 skills 数组 | 0% |
| 平均职位经历 | 4.72 段 |
| 中位职位经历 | 5 段 |

测试快照：`snap_mrlenfyic8e40akmj`。

结论：Bright Dataset 足以作为本地人才库的 profile 原料，但技能必须从 About 和工作经历中提取。Bright URL Scraper 对相同 profile 返回过 `position=null`、`experience=null`，因此不进入首版方案。

## 3. 技术栈

第一阶段统一使用 PostgreSQL 17：

| 能力 | 技术 |
| --- | --- |
| 主数据和事务 | PostgreSQL |
| 精确字段和范围过滤 | B-tree |
| 数组和标签检索 | GIN |
| title、公司模糊匹配 | `pg_trgm` |
| 工作经历关键词检索 | PostgreSQL Full Text Search |
| 语义检索 | `pgvector` + HNSW |
| 履历结构化和最终判断 | LLM |
| 多路排名合并 | Reciprocal Rank Fusion，简称 RRF |
| 成对比较汇总 | Bradley-Terry 模型 |

`pgvector` 已经提供向量数据库的核心近邻检索能力。首版将结构化过滤、全文检索、向量检索和业务数据放在同一个数据库中，避免双写和索引一致性问题。

## 4. 核心数据模型

### 4.1 `profiles`

候选人的长期主档案，一人一行，以 `linkedin_id` 或规范化 LinkedIn URL 去重。

```text
id
linkedin_id
linkedin_url
name

current_title
current_company
seniority
years_experience

role_families[]
adjacent_roles[]
skills[]
domains[]
capabilities[]

country_code
state_or_region
city
metro_area

highest_degree
schools[]
fields_of_study[]

profile_summary
search_text
search_vector
embedding

raw_profile JSONB
created_at
```

### 4.2 `profile_experiences`

将 Bright 的 `experience[].positions[]` 展开为真实职位记录，一段任职一行。

```text
id
profile_id
title
company
start_date
end_date
location
description

normalized_text
search_vector
embedding
```

### 4.3 搜索运行数据

首版搜索需要保存三个运行对象：

- `searches`：原始 JD、解析后的搜索意图和状态。
- `search_candidates`：候选人在当前 JD 下的召回来源、证据、判断和最终名次。
- `candidate_comparisons`：当前 JD 下每次 A/B 比较的候选人、胜负、置信度和理由。

候选人质量永远属于特定 `(JD, profile)`，不保存全局好候选人或坏候选人标签。

## 5. Bright 数据导入

导入流程如下：

```text
Bright Snapshot JSON
  -> 字段校验
  -> LinkedIn URL 规范化和去重
  -> 保存 raw_profile
  -> 展开 experience.positions
  -> 计算当前职位和工作年限
  -> 规范化地域和学历
  -> LLM 提取招聘语义
  -> 生成全文文档
  -> 生成整体和经历向量
  -> 写入索引
```

具体规则：

1. `linkedin_id` 优先作为唯一键，没有时使用规范化 LinkedIn URL。
2. 原始 Bright JSON 完整保存在 `raw_profile`，任何派生结果都能回到原始证据。
3. 有 `positions[]` 时按职位展开；没有时将 experience group 本身作为一段经历。
4. 当前职位优先取结束时间为 `Present` 的职位，并用 Bright 顶层当前公司信息校验。
5. 工作年限根据去重后的时间区间计算，避免并行任职被重复累计。
6. 地域拆成国家、州、城市和 metro area，不使用 embedding 判断地点。
7. 学历提取最高学位、学校和专业，不根据学校名气推断能力。

## 6. 候选人招聘语义表示

这是整个方案最关键的处理步骤。不能简单生成一段营销式简介，也不能只对原始 JSON 做 embedding。

### 6.1 LLM 结构化输出

LLM 阅读完整履历后输出严格 JSON：

```json
{
  "role_families": [
    "backend_engineering",
    "platform_engineering"
  ],
  "adjacent_roles": [
    "infrastructure_engineering"
  ],
  "seniority": "senior",
  "skills": [
    "TypeScript",
    "PostgreSQL",
    "Kafka"
  ],
  "domains": [
    "payments",
    "B2B SaaS"
  ],
  "capabilities": [
    "event-driven architecture",
    "production reliability",
    "multi-tenant API design"
  ],
  "evidence": [
    {
      "claim": "Has owned multi-tenant backend systems",
      "experience_ref": "Senior Backend Engineer at Company A",
      "detail": "Designed tenant isolation and billing APIs"
    }
  ]
}
```

提取规则：

- 每项技能、领域和能力必须能指向具体经历。
- 不根据 title 或公司名自动推断职责。
- 区分长期生产经验、短期接触和仅被提及的技术。
- 最近且持续时间长的经历权重更高。
- 允许一个人具有多个 role family 和相邻岗位方向。
- 缺少信息表示未知，不能推断为不具备。
- 这里不判断候选人是否优秀，也不生成全局匹配分。

### 6.2 Profile Search Document

候选人整体 embedding 使用固定结构的搜索文档：

```text
Primary and adjacent roles:
Backend engineering; platform engineering; infrastructure engineering

Seniority and scope:
Senior; 7 years; owned production systems and cross-team platform work

Core capabilities:
Event-driven architecture; production reliability; multi-tenant API design

Technical evidence:
TypeScript and Node.js services; PostgreSQL performance; Kafka pipelines; AWS operations

Domains:
B2B SaaS; payments

Education:
Bachelor degree in Computer Science
```

这份文档强调职业方向和可验证能力，不使用空泛的个性评价。

### 6.3 Experience Search Document

每段工作经历单独生成固定格式文本和 embedding：

```text
Role: Senior Backend Engineer
Company: Company A
Period: 2021-2024
Domain: Payments
Responsibilities: Designed tenant isolation, billing APIs and Kafka event pipelines
Technologies: TypeScript, PostgreSQL, Kafka, AWS
```

整体向量负责理解职业方向，经历向量负责保留容易被整体摘要遗漏的具体证据。原始经历全文始终保留在全文索引中。

## 7. 数据库索引

| 数据 | 索引 | 用途 |
| --- | --- | --- |
| `country_code`、`city`、`metro_area`、`seniority` | B-tree | 硬条件过滤 |
| `role_families`、`skills`、`domains`、`schools` | GIN | 标签召回和加权 |
| profile 和 experience 的 `search_vector` | GIN FTS | 精确词和具体证据 |
| title 和 company | `pg_trgm` | 拼写、别名和模糊匹配 |
| profile `embedding` | HNSW | 整体职业语义召回 |
| experience `embedding` | HNSW | 具体工作经历语义召回 |

技能来自 LLM 提取，而 Bright 只有 54% 的样本具有经历描述。首版技能标签用于召回和加权，不能因为缺少某项技能标签就直接淘汰候选人。

## 8. JD 表示

JD 必须转换成与候选人相同的招聘语义空间：

```json
{
  "target_roles": [],
  "acceptable_adjacent_roles": [],
  "seniority": "",
  "must_have_capabilities": [],
  "skills": [],
  "domains": [],
  "work_model": "remote | hybrid | onsite",
  "allowed_countries": [],
  "required_city_or_metro": null,
  "location_strictness": "hard | soft",
  "minimum_degree": null,
  "required_fields_of_study": []
}
```

同时生成与 Profile Search Document 同构的 JD Search Document 和 embedding。

只有用户或 JD 明确声明的条件才能成为硬条件：

- Onsite 城市或 metro。
- Remote 的允许国家范围。
- 法规、研究或专业岗位明确要求的学历和专业。
- 明确且合理的最低职级或工作年限。

普通工程岗位的学校、学历和缺失技能默认是软信号。

## 9. 混合检索

混合检索指多种检索方法并行召回，不是多数据源。

```text
JD 结构化条件过滤
  + Profile 全文检索 Top 300
  + Experience 全文检索 Top 300
  + Profile 向量检索 Top 300
  + Experience 向量检索 Top 300
  -> RRF 合并
  -> 按 profile_id 去重
  -> 约 300-500 人
```

各通道分工：

- 结构化过滤保证地域和明确学历条件。
- 全文检索保证 FHIR、Kafka、PostgreSQL 等精确证据不丢失。
- Profile 向量发现整体职业方向相近的人。
- Experience 向量发现 title 不同但做过同类工作的相邻候选人。
- RRF 合并不同分数量纲，避免手工硬加 BM25 和 cosine score。

检索阶段的目标是高召回，不产生最终匹配分。

## 10. 检索后的证据包

对每个召回候选人整理当前 JD 专属 evidence pack：

```text
结构化条件：地点、职级、学历
全文命中：具体关键词和所在经历
Profile 向量命中：整体职业方向
Experience 向量命中：具体职位和职责
原始履历：用于最终复核
```

命中的具体经历必须随候选人进入后续判断，不能只传递一个向量相似度。

## 11. 绝对合格门槛

Facemash 式比较之前必须先判断候选人是否达到最低联系标准，否则一组不合格候选人也会产生冠军。

第一步使用确定性代码检查可靠硬条件：

- 地域范围。
- 明确学历和专业要求。
- 明显不符合的职级或年限。

第二步使用轻量 JD-specific LLM 判断：

```text
advance        证据足够，进入成对比较
maybe          可能合适但证据不足
reject         有明确不匹配证据
```

LLM 必须输出支持证据、缺失信息和拒绝原因。`unknown` 不能自动等于 `reject`。

混合检索得到的 300-500 人经过此阶段后，保留约 40-60 人进入成对比较。

## 12. Facemash 式成对比较

### 12.1 比较问题

每场比较只回答：

> 对于当前 JD，如果招聘者只能优先联系 A 或 B，谁更值得联系？

输出格式：

```json
{
  "decision": "candidate_a | candidate_b | tie | both_unqualified",
  "confidence": 0.78,
  "decisive_dimensions": [
    "core_capability",
    "seniority_scope"
  ],
  "reason": "...",
  "evidence": [],
  "risks": []
}
```

比较维度包括：

- 核心职责和能力。
- 岗位相关性。
- Seniority、scope 和影响力。
- 技能的生产证据。
- 领域经验。
- 地点和明确学历条件。
- 证据完整度。

### 12.2 配对方法

- 每个候选人首版参加约 5 次比较。
- 首轮按初步排名分层随机配对。
- 后续优先比较排名接近、模型不确定的人。
- 允许 `tie` 和 `both_unqualified`，不强迫产生赢家。
- 抽取 10%-20% 的场次交换 A/B 顺序复测，检查位置偏差。
- 不比较所有组合，避免 `O(n^2)` 成本。

### 12.3 排名汇总

首版直接使用 Bradley-Terry 模型汇总成对比较结果：

- 输入所有成对胜负和置信度。
- 估计每个候选人在当前 JD 下的相对胜出概率。
- 生成当前 JD 内的相对排名。
- 排名不能跨 JD 复用。

Bradley-Terry 排名只决定合格候选人的优先顺序，不替代绝对合格门槛。

## 13. 最终深度判断与交付

成对比较后，对 Top 15-20 读取完整 Bright 履历和 evidence pack，生成最终候选人判断：

```json
{
  "decision": "contact | review | hold | reject",
  "match_reasons": [],
  "evidence": [],
  "risks": [],
  "missing_information": [],
  "recommended_next_action": "contact"
}
```

最终页面重点展示：

- 为什么适合当前 JD。
- 哪一段经历提供了证据。
- 哪些硬条件已经确认。
- 哪些风险和信息仍需确认。
- 推荐联系顺序。

最终漏斗：

```text
本地候选人库
  -> 混合检索 300-500
  -> 绝对门槛 40-60
  -> 成对比较排名
  -> 深度判断 15-20
  -> 优先联系 3-5
```

## 14. 第一阶段验证

首轮不建设 1 万人索引，也不同时测试 10 个 JD。只选择 1 个真实 JD，从 Bright Dataset 最多召回 500 人，完整验证一次端到端链路。

真实 JD 优先由目标招聘用户提供；如果暂时没有用户 JD，则选择一个当前公开招聘、职责和地点明确的完整 JD，并冻结原文作为本轮唯一输入。

### 14.1 Bright 召回

500 人是总预算上限，不是每条查询的额度。Bright 过滤条件应比最终 JD 要求更宽，避免在数据源侧提前淘汰相邻背景：

```text
真实 JD
  -> 解析 role、地点、核心职责和相邻背景
  -> 生成少量宽召回条件
  -> Bright Dataset 总计最多返回 500 人
  -> 按 LinkedIn URL 去重
  -> 导入本地索引
```

按当前 Bright Filter API 价格估算，500 records 的数据成本约为 `$1.25`。真实执行前仍需读取余额并设置 500 条硬上限。

### 14.2 端到端验证

对这批最多 500 人执行：

1. Bright 数据导入和经历展开。
2. 候选人结构化语义提取。
3. Profile 和 Experience 全文及向量索引。
4. 使用同一个 JD 运行混合检索。
5. 执行绝对合格门槛。
6. 对合格候选人执行成对比较。
7. 对 Top 15-20 做完整履历判断。

人工复核不需要评完 500 人，首轮检查三个区域：

- Top 20：判断最终 precision 和 contact-worthy 数量。
- 排名 21-50：检查排序边界是否合理。
- 随机抽取约 30 个低排名或 reject：检查是否漏掉明显好人。

### 14.3 核心指标

| 指标 | 要回答的问题 |
| --- | --- |
| `Precision@20` | 前 20 中真正值得联系的比例 |
| Contact-worthy count | 当前 JD 是否有 3-5 个值得联系的人 |
| Sampled false-negative rate | 低排名抽样中是否存在明显漏召回 |
| Pairwise agreement | 成对判断与人工选择的一致率 |
| Order-swap consistency | A/B 交换位置后是否保持判断 |
| Both-unqualified rate | 排名系统是否能识别没有合格人选 |
| Cost per JD | Bright、结构化、embedding 和判断成本 |
| Search latency | 从 JD 到候选人池的耗时 |

### 14.4 对照实验

首轮只做对结论有直接帮助的四组对照：

1. Bright 原始返回顺序。
2. 仅结构化过滤和全文检索。
3. 混合检索但不做成对比较。
4. 完整混合检索加成对比较。

如果向量检索或成对比较没有提高 `Precision@20`、人工选择一致率或候选人解释质量，首版应删除对应复杂度。

### 14.5 通过标准

- 当前真实 JD 能找到至少 3 个 contact-worthy candidates，目标为 3-5 个。
- Top 20 的人工 precision 明显优于 Bright 原始顺序和全文检索基线。
- 低排名随机样本中没有大量明显被漏掉的好候选人。
- 成对比较优于绝对数字打分，并且 A/B 顺序偏差可控。
- 每个结论都能指向具体工作经历，不依赖空泛总结。
- 单次 JD 的成本和延迟能够进入产品可接受范围。

单个 JD 通过只能证明这条技术链路值得继续，不能证明对所有岗位都有效。首轮成功后再逐个增加不同类型 JD，而不是一次性扩大到 10 个。

## 15. 实施顺序

### P1：Bright 导入和基础表

- 安装 `pgvector`、`pg_trgm`。
- 创建 `profiles` 和 `profile_experiences`。
- 选择并冻结 1 个真实 JD。
- 从 Bright 最多召回并导入 500 条 profile。
- 完成 LinkedIn URL 去重、经历展开、地域和学历规范化。

### P2：候选人表示和索引

- 定义 LLM 严格 JSON schema。
- 生成人才搜索语义字段。
- 生成 Profile 和 Experience search documents。
- 建立全文、标签和 HNSW 索引。

### P3：JD 混合检索

- 定义 JD Search Intent schema。
- 实现结构化过滤、全文和双层向量召回。
- 使用 RRF 合并并输出命中证据。

### P4：合格门槛和成对排序

- 实现硬条件检查。
- 实现轻量 JD-specific qualification。
- 实现成对比较、位置交换检查和 Bradley-Terry 汇总。

### P5：Benchmark 决策

- 跑 1 个真实 JD 的 500 人端到端验证。
- 完成人工复核和四组对照实验。
- 决定是否扩大 Bright 数据规模以及是否进入正式产品开发。

## 16. 首版明确不做

- 数据自动刷新和 freshness score。
- Bright URL Scraper 增量补全。
- Serper 或其他外部 discovery。
- ATS、CSV 和客户私有数据导入。
- 多来源身份归并。
- Elasticsearch、OpenSearch、Pinecone、Milvus、Weaviate、Qdrant。
- 全局候选人好坏分数。
- 跨 JD 复用 Bradley-Terry 排名。
- 在 benchmark 通过前建设大规模产品 UI 和复杂调度系统。

## 17. 最终结论

Hirelix 首版的核心不是调用 Bright 搜人，也不是对候选人生成一个固定分数，而是：

> 将 Bright Dataset 的完整履历转换成结构化条件、完整经历全文、候选人整体向量和经历级向量；使用多路召回保证不漏人，使用绝对门槛排除不合格人，再通过 Facemash 式成对比较确定同一 JD 下的联系优先级。

技术上先使用 PostgreSQL 17、Full Text Search、`pg_trgm` 和 `pgvector`。只有在 1 个真实 JD、最多 500 人的端到端验证证明质量成立后，才增加新的 JD、扩大 Bright 数据规模或拆分独立搜索基础设施。
