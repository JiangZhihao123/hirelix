# JD Sourcing Benchmark 样本

这 10 个 JD 用于首轮 cold-start sourcing benchmark。样本覆盖普通技术岗、高级基础架构、窄技能、location 严格、ML/research、相邻背景等难度层级。Benchmark 期间不要临时替换样本；如果某个 JD 写得不合理，应记录问题并新增版本，而不是直接覆盖历史样本。

每个 JD 都按相同 provider 组合评估：Internal-only、Bright-only、SERP discovery + 补全、Exa/Firecrawl public evidence、Hybrid。`contact-worthy` 仍按统一 rubric 判断，`maybe` 只能算 reviewable。

## JD-01 普通技术岗：Backend Platform Engineer

类型：普通技术岗  
地点：Remote US / Canada  
难点：主流岗位，验证基础召回是否稳定。

JD:

```text
We are hiring a Backend Platform Engineer to build high-throughput APIs and shared services for a B2B workflow SaaS product.

Responsibilities:
- Design and operate backend services in TypeScript or Node.js.
- Own API reliability, database performance, observability, and CI/CD.
- Work with product engineers to turn ambiguous product requirements into durable platform APIs.

Requirements:
- 4+ years backend engineering experience.
- Strong production experience with TypeScript or Node.js.
- PostgreSQL or MySQL experience.
- Redis, queues, or event-driven systems.
- Experience operating services in AWS, GCP, or Kubernetes.

Nice to have:
- Multi-tenant SaaS experience.
- Experience with usage metering, billing, or workflow automation.
```

## JD-02 普通技术岗：Full-Stack Product Engineer

类型：普通技术岗  
地点：Remote Americas  
难点：title 宽，必须避免只召回前端泛化人选。

JD:

```text
We need a Full-Stack Product Engineer for an AI productivity tool. The person should ship user-facing features quickly while owning backend data flows.

Requirements:
- 3+ years professional software engineering experience.
- React and TypeScript in production.
- Backend experience with Node.js, Python, or Go.
- Comfortable with SQL schemas, API design, and product analytics.
- Strong product judgment and ability to work without detailed specs.

Nice to have:
- Built AI-assisted workflows or LLM features.
- Worked at an early-stage SaaS startup.
```

## JD-03 普通技术岗：Data Engineer

类型：普通技术岗  
地点：US remote  
难点：数据工程 title 清晰，验证 skills 和平台证据。

JD:

```text
We are looking for a Data Engineer to build reliable pipelines for customer analytics and internal reporting.

Requirements:
- 4+ years data engineering experience.
- Strong Python and SQL.
- Production experience with Airflow, dbt, Dagster, or similar orchestration tools.
- Experience with Snowflake, BigQuery, Redshift, or Databricks.
- Comfortable owning data quality, lineage, and monitoring.

Nice to have:
- SaaS metrics, billing analytics, or product analytics experience.
- Experience with streaming data or Kafka.
```

## JD-04 高级基础架构：Staff Infrastructure Engineer

类型：高级/基础架构岗  
地点：Remote US  
难点：seniority 和 scope 判断，避免召回普通 DevOps。

JD:

```text
We are hiring a Staff Infrastructure Engineer to lead reliability and developer platform work for a fast-growing cloud product.

Requirements:
- 8+ years engineering experience with at least 3 years in infrastructure, platform, or SRE.
- Deep Kubernetes production experience.
- Strong Terraform or infrastructure-as-code background.
- Experience designing multi-region reliability, incident response, and observability.
- Ability to influence engineering teams without direct authority.

Nice to have:
- Built internal developer platforms.
- Experience with SOC2, regulated environments, or enterprise SaaS.
```

## JD-05 高级基础架构：Engineering Manager, Platform

类型：高级/基础架构岗  
地点：New York hybrid or Remote US East  
难点：管理岗，需要区分 hands-on lead 和纯项目经理。

JD:

```text
We need an Engineering Manager for our platform team. This person will manage 6-8 engineers while staying close to architecture.

Requirements:
- Managed backend, infrastructure, or platform engineering teams.
- Prior hands-on background in distributed systems, APIs, or cloud infrastructure.
- Experience hiring, performance management, and technical planning.
- Strong communication with product, security, and customer-facing teams.

Nice to have:
- New York startup experience.
- Experience scaling a platform team from 5 to 20 engineers.
```

## JD-06 极窄技能：Blockchain Indexing Engineer

类型：极窄技能岗  
地点：Remote global  
难点：技能窄，容易 0 召回或召回泛 Web3。

JD:

```text
We are hiring a Blockchain Indexing Engineer to build real-time indexing and query systems for EVM chains.

Requirements:
- Production experience indexing blockchain data.
- Strong TypeScript, Go, or Rust.
- Experience with EVM logs, traces, RPC nodes, and reorg handling.
- PostgreSQL, ClickHouse, or similar analytical storage.
- Ability to debug data correctness issues in production.

Nice to have:
- Built subgraphs, explorers, portfolio analytics, or DeFi data products.
- Open-source Web3 infrastructure contributions.
```

## JD-07 极窄技能：Healthcare Interoperability Engineer

类型：极窄行业/技能岗  
地点：US remote  
难点：domain 约束强，普通 backend 不够。

JD:

```text
We need a Healthcare Interoperability Engineer to build integrations with hospital and payer systems.

Requirements:
- Backend engineering experience with healthcare data.
- Production experience with HL7, FHIR, or EDI integrations.
- Strong Python, Java, or TypeScript.
- Experience with secure data handling, audit logs, and compliance-heavy systems.
- Comfortable debugging messy partner integrations.

Nice to have:
- Epic, Cerner, Athenahealth, payer, or digital health startup experience.
- Experience with integration engines or healthcare APIs.
```

## JD-08 Location 严格：Senior Backend Engineer, NYC Onsite

类型：location 严格岗位  
地点：New York City onsite 4 days/week  
难点：地点硬约束，不能用 remote 候选人填数。

JD:

```text
We are hiring a Senior Backend Engineer for a fintech infrastructure startup in New York City. This is onsite 4 days per week.

Requirements:
- Currently based in NYC or willing to work onsite in NYC.
- 5+ years backend engineering experience.
- Strong Python or Go.
- PostgreSQL and distributed systems experience.
- Experience building financial, payments, trading, risk, or ledger systems.

Nice to have:
- Startup experience.
- Low-latency systems, event sourcing, or financial reconciliation.
```

## JD-09 ML / Research：ML Infrastructure Engineer

类型：ML / research / data-heavy  
地点：Remote US / Europe  
难点：GitHub、论文、公开技术证据可能比 LinkedIn 更有价值。

JD:

```text
We are hiring an ML Infrastructure Engineer to build training, evaluation, and deployment systems for LLM-powered products.

Requirements:
- Strong Python engineering background.
- Experience with model training, inference, evaluation, or ML platform work.
- PyTorch, JAX, TensorFlow, or similar framework experience.
- Kubernetes, GPUs, distributed jobs, or model serving experience.
- Ability to work with research scientists and product engineers.

Nice to have:
- Open-source ML infrastructure contributions.
- Papers, technical blogs, or conference talks.
- Experience with LLM evals or retrieval systems.
```

## JD-10 非典型相邻背景：Technical Solutions Engineer to Product Engineer

类型：非典型相邻背景  
地点：Remote US  
难点：允许相邻背景，但必须防止漂移成售前/支持岗。

JD:

```text
We are open to a Technical Solutions Engineer, Forward Deployed Engineer, or Sales Engineer who wants to move into a Product Engineer role.

Requirements:
- Strong coding ability in TypeScript, Python, or JavaScript.
- Has built internal tools, customer integrations, or production prototypes.
- Can work directly with customers and translate workflows into product features.
- Comfortable owning implementation, not only requirements gathering.
- 3+ years technical customer-facing or engineering experience.

Nice to have:
- SaaS, data tools, or AI workflow experience.
- Prior product engineering or startup experience.
```
