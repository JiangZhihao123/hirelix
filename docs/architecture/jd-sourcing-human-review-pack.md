# JD Sourcing Human Review Pack

本复核包用于按猎头视角判断候选人是否值得联系，或是否值得消耗 Bright 做 profile completion。它只来自本地 review queue，不调用外部 provider。

## Review Standard

- `contact_worthy`：已有证据足够，真实猎头会放进 outreach 或 shortlist。
- `research_more`：方向可能对，但需要补 LinkedIn/Profile/履历证据后才能判断。
- `reject`：不适合该 JD，或者只是关键词、title、项目名重合。
- `uncertain`：当前证据无法判断，且不能合理归入前三类。
- `reviewer_type` 必须写清楚，例如 `human_headhunter`、`human_recruiter`、`codex_headhunter`。

## Scope

- Review queue：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-human-review-queue.csv`
- Included priorities：P0, P1
- Rows：22
- P0 rows：15
- Buckets：confirm_assistant_contact_worthy=7, bright_probe_gate=8, serper_snippet_risk=5, github_profile_needed=2

## P0 Checklist

| Review ID | Bucket | JD | Candidate | Current assistant decision | Needed answer |
| --- | --- | --- | --- | --- | --- |
| HR-001 | confirm_assistant_contact_worthy | JD-03 普通技术岗：Data Engineer | Divyansh Mishra | contact_worthy | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-002 | confirm_assistant_contact_worthy | JD-03 普通技术岗：Data Engineer | Chaithra Chandru | contact_worthy | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-003 | confirm_assistant_contact_worthy | JD-05 高级基础架构：Engineering Manager, Platform | Tim Hwang | contact_worthy | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-004 | confirm_assistant_contact_worthy | JD-05 高级基础架构：Engineering Manager, Platform | Masudur Rahman | contact_worthy | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-005 | confirm_assistant_contact_worthy | JD-09 ML / Research：ML Infrastructure Engineer | Ekaterina (Katya) Gonina | contact_worthy | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-006 | confirm_assistant_contact_worthy | JD-10 非典型相邻背景：Technical Solutions Engineer to Product Engineer | Emmanuel Nkasi | contact_worthy | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-007 | confirm_assistant_contact_worthy | JD-10 非典型相邻背景：Technical Solutions Engineer to Product Engineer | Aviral Malik | contact_worthy | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-008 | bright_probe_gate | JD-01 普通技术岗：Backend Platform Engineer | Raul Murguia | research_more | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-009 | bright_probe_gate | JD-01 普通技术岗：Backend Platform Engineer | Suraj kumar | research_more | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-010 | bright_probe_gate | JD-01 普通技术岗：Backend Platform Engineer | Azhar Ahmad | research_more | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-011 | bright_probe_gate | JD-08 Location 严格：Senior Backend Engineer, NYC Onsite | Lucas Chaufournier | research_more | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-012 | bright_probe_gate | JD-08 Location 严格：Senior Backend Engineer, NYC Onsite | Oskar W. | research_more | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-013 | bright_probe_gate | JD-08 Location 严格：Senior Backend Engineer, NYC Onsite | Ambareesh Pandit, MS | research_more | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-014 | bright_probe_gate | JD-08 Location 严格：Senior Backend Engineer, NYC Onsite | Daniel Lanoff | research_more | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-015 | bright_probe_gate | JD-01 普通技术岗：Backend Platform Engineer | Daniel Chen | research_more | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |

## JD-03 普通技术岗：Data Engineer

### HR-001 P0 confirm_assistant_contact_worthy

- Candidate：Divyansh Mishra
- Headline：Divyansh Mishra - Data Engineer @Petco Python| Snowflake| DBT
- URL：https://in.linkedin.com/in/divyansh-mishra-3606b716b
- LLM decision：yes
- Assistant strict decision：contact_worthy
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：high
- Missing evidence：None
- Evidence summary：Divyansh Mishra - Data Engineer @Petco Python| Snowflake| DBT Data Engineer @Petco Python| Snowflake| DBT| Airflow| Flask| SQL| AWS. Petco ... 4+ years of industrial experience specializing in Python-based software ...
- Review question：严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？
- Standard：必须有 JD 核心职责、资历、技能或领域的直接证据；只靠 title/headline 不够。
- Expected action：确认 contact_worthy 后用于校准 LLM yes precision；否则降为 research_more 或 reject。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: contact_worthy
- `reviewer_type`: codex_headhunter
- `human_reason`: Data Engineer profile directly shows 4+ years plus Python, SQL, Snowflake, dbt, and Airflow, matching the JD core requirements.
- `human_notes`: Snippet-only evidence, but the stack and seniority evidence are specific enough for outreach calibration.

### HR-002 P0 confirm_assistant_contact_worthy

- Candidate：Chaithra Chandru
- Headline：Chaithra Chandru - Data Engineer | ETL/ELT pipelines | Python | SQL
- URL：https://in.linkedin.com/in/chaithra-c
- LLM decision：yes
- Assistant strict decision：contact_worthy
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：high
- Missing evidence：None
- Evidence summary：Chaithra Chandru - Data Engineer | ETL/ELT pipelines | Python | SQL Data Engineer | ETL/ELT pipelines | Python | SQL | PySpark | Apache Airflow | Databricks | DBT | Jil | Autosys | AWS · With 4+ years of experience as a Data ...
- Review question：严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？
- Standard：必须有 JD 核心职责、资历、技能或领域的直接证据；只靠 title/headline 不够。
- Expected action：确认 contact_worthy 后用于校准 LLM yes precision；否则降为 research_more 或 reject。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: contact_worthy
- `reviewer_type`: codex_headhunter
- `human_reason`: Data Engineer profile shows 4+ years plus ETL/ELT, Python, SQL, PySpark, Airflow, Databricks, dbt, and AWS.
- `human_notes`: Snippet-only evidence, but it directly covers the JD's data engineering stack.

### HR-017 P1 serper_snippet_risk

- Candidate：Konduru Sindhu
- Headline：Konduru Sindhu - Data Engineer | 4+ yrs | Python, SQL, Snowflake ...
- URL：https://in.linkedin.com/in/konduru-sindhu-06b766405
- LLM decision：yes
- Assistant strict decision：research_more
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：high
- Missing evidence：None
- Evidence summary：Konduru Sindhu - Data Engineer | 4+ yrs | Python, SQL, Snowflake ... Konduru Sindhu. Data Engineer | 4+ yrs | Python, SQL, Snowflake, Azure, ADF ... Experienced in Azure Data Factory, Databricks, PySpark, dbt, and workflow ...
- Review question：这是 Serper/Google 摘要误判，还是值得补证据的候选？
- Standard：如果摘要已经显示核心匹配但缺履历细节，填 research_more；如果只是关键词堆叠，填 reject。
- Expected action：用于收紧 LLM yes 门槛和决定是否继续依赖 Serper/X-ray。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: 
- `reviewer_type`: 
- `human_reason`: 
- `human_notes`: 


## JD-05 高级基础架构：Engineering Manager, Platform

### HR-003 P0 confirm_assistant_contact_worthy

- Candidate：Tim Hwang
- Headline：Tim Hwang - Engineering Manager, Backend | LinkedIn
- URL：https://www.linkedin.com/in/timwhwang
- LLM decision：yes
- Assistant strict decision：contact_worthy
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：high
- Missing evidence：None
- Evidence summary：Tim Hwang - Engineering Manager, Backend | LinkedIn Engineering Manager, Backend. Fubo. Jul 2024 - Present 2 years 1 month. New York, United States. Lead and mentor a team of seven backend engineers who build and ...
- Review question：严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？
- Standard：必须有 JD 核心职责、资历、技能或领域的直接证据；只靠 title/headline 不够。
- Expected action：确认 contact_worthy 后用于校准 LLM yes precision；否则降为 research_more 或 reject。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: contact_worthy
- `reviewer_type`: codex_headhunter
- `human_reason`: Engineering Manager, Backend at Fubo leading seven backend engineers directly matches the JD's backend management scope.
- `human_notes`: Architecture depth still needs confirmation, but this is outreach-worthy for a platform EM search.

### HR-004 P0 confirm_assistant_contact_worthy

- Candidate：Masudur Rahman
- Headline：Masudur Rahman - Engineering Manager, Platform | LinkedIn
- URL：https://www.linkedin.com/in/rahmanmasudur
- LLM decision：yes
- Assistant strict decision：contact_worthy
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：high
- Missing evidence：Exact team size
- Evidence summary：Masudur Rahman - Engineering Manager, Platform | LinkedIn Nov 2024 - Present 1 year 8 months. New York, New York, United States. Engineering Manager for Platform Team with a focus on Shared Services, APIs & ...
- Review question：严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？
- Standard：必须有 JD 核心职责、资历、技能或领域的直接证据；只靠 title/headline 不够。
- Expected action：确认 contact_worthy 后用于校准 LLM yes precision；否则降为 research_more 或 reject。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: contact_worthy
- `reviewer_type`: codex_headhunter
- `human_reason`: Engineering Manager, Platform focused on shared services and APIs aligns with a platform team manager role.
- `human_notes`: Exact team size is missing, but the platform/API management signal is strong enough for outreach.


## JD-09 ML / Research：ML Infrastructure Engineer

### HR-005 P0 confirm_assistant_contact_worthy

- Candidate：Ekaterina (Katya) Gonina
- Headline：Ekaterina (Katya) Gonina - AI/ML Infrastructure Engineer - LinkedIn
- URL：https://www.linkedin.com/in/ekaterina-katya-gonina-0b61828
- LLM decision：yes
- Assistant strict decision：contact_worthy
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：high
- Missing evidence：None
- Evidence summary：Ekaterina (Katya) Gonina - AI/ML Infrastructure Engineer - LinkedIn ... Google/DeepMind Research and Twitter. PhD in Computer Science from UC ... AI/ML Infrastructure Engineer | Ex-Google, Ex-Twitter | Berkeley EECS PhD ...
- Review question：严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？
- Standard：必须有 JD 核心职责、资历、技能或领域的直接证据；只靠 title/headline 不够。
- Expected action：确认 contact_worthy 后用于校准 LLM yes precision；否则降为 research_more 或 reject。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: contact_worthy
- `reviewer_type`: codex_headhunter
- `human_reason`: AI/ML Infrastructure Engineer with Google/DeepMind, Twitter, and Berkeley EECS PhD signals direct fit for ML infrastructure outreach.
- `human_notes`: Specific framework and serving evidence should be checked later, but the role/title and background clear the outreach bar.

### HR-020 P1 serper_snippet_risk

- Candidate：Elliot Zhang
- Headline：Elliot Zhang - ML Infrastructure Engineer @ Character.AI - LinkedIn
- URL：https://www.linkedin.com/in/elliot-zhang
- LLM decision：yes
- Assistant strict decision：research_more
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：high
- Missing evidence：None
- Evidence summary：Elliot Zhang - ML Infrastructure Engineer @ Character.AI - LinkedIn Elliot Zhang. ML Infrastructure Engineer @ Character.AI | LLM Inference · KV Cache · Disaggregated Serving · vLLM · GPU Autoscaling. Character.AI ...
- Review question：这是 Serper/Google 摘要误判，还是值得补证据的候选？
- Standard：如果摘要已经显示核心匹配但缺履历细节，填 research_more；如果只是关键词堆叠，填 reject。
- Expected action：用于收紧 LLM yes 门槛和决定是否继续依赖 Serper/X-ray。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: 
- `reviewer_type`: 
- `human_reason`: 
- `human_notes`: 


## JD-10 非典型相邻背景：Technical Solutions Engineer to Product Engineer

### HR-006 P0 confirm_assistant_contact_worthy

- Candidate：Emmanuel Nkasi
- Headline：Emmanuel Nkasi - Product Engineer | TypeScript, Node.js, Python
- URL：https://ng.linkedin.com/in/emmanuelnkasi
- LLM decision：yes
- Assistant strict decision：contact_worthy
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：medium
- Missing evidence：None
- Evidence summary：Emmanuel Nkasi - Product Engineer | TypeScript, Node.js, Python Product Engineer | TypeScript, Node.js, Python | Microservices | Rust · Product-focused Software Engineer with over 4 years of experience building scalable ...
- Review question：严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？
- Standard：必须有 JD 核心职责、资历、技能或领域的直接证据；只靠 title/headline 不够。
- Expected action：确认 contact_worthy 后用于校准 LLM yes precision；否则降为 research_more 或 reject。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: research_more
- `reviewer_type`: codex_headhunter
- `human_reason`: Strong Product Engineer coding stack, but current evidence does not show customer-facing workflow or customer integration ownership.
- `human_notes`: Do not count as contact-worthy yet for the Technical Solutions to Product Engineer JD.

### HR-007 P0 confirm_assistant_contact_worthy

- Candidate：Aviral Malik
- Headline：Aviral Malik - AI Product Engineer | React, NestJS, Python, TypeScript
- URL：https://in.linkedin.com/in/aviral-malik-3a6859205
- LLM decision：yes
- Assistant strict decision：contact_worthy
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：medium
- Missing evidence：None
- Evidence summary：Aviral Malik - AI Product Engineer | React, NestJS, Python, TypeScript AI Product Engineer | React, NestJS, Python, TypeScript | Building Scalable SaaS Products · I'm a Software Engineer with 4 years of experience in building ...
- Review question：严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？
- Standard：必须有 JD 核心职责、资历、技能或领域的直接证据；只靠 title/headline 不够。
- Expected action：确认 contact_worthy 后用于校准 LLM yes precision；否则降为 research_more 或 reject。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: contact_worthy
- `reviewer_type`: codex_headhunter
- `human_reason`: AI Product Engineer with React, NestJS, Python, TypeScript, SaaS product building, and 4 years of software experience fits the product engineer target.
- `human_notes`: Customer-facing workflow evidence is still thin, but product engineering and AI/SaaS signals are enough for initial outreach.


## JD-01 普通技术岗：Backend Platform Engineer

### HR-008 P0 bright_probe_gate

- Candidate：Raul Murguia
- Headline：Raul Murguia - Senior Backend / Platform Engineer - LinkedIn
- URL：https://www.linkedin.com/in/raulmurguia
- LLM decision：yes
- Assistant strict decision：research_more
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：medium
- Missing evidence：Redis/queues/event-driven systems; AWS/GCP/Kubernetes
- Evidence summary：Raul Murguia - Senior Backend / Platform Engineer - LinkedIn Senior Backend / Platform Engineer | Distributed Systems | AI-Enabled Data Platforms ... js (App Router), TypeScript, Prisma, and PostgreSQL. Built a batch ...
- Review question：这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？
- Standard：只有当补全后有机会决定 contact/reject，才批准进入 Bright probe；明显不合适就不要花钱。
- Expected action：通过则进入 $1 以内 Bright URL/Profile completion；不通过则从 Bright probe plan 移除。
- Bright probe candidate：yes: LLM 原判 yes，但严格校准认为证据不足; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：Redis/queues/event-driven systems; AWS/GCP/Kubernetes

Decision fields to fill:

- `human_decision`: research_more
- `reviewer_type`: codex_headhunter
- `human_reason`: Backend/platform profile has TypeScript, Prisma, PostgreSQL, distributed systems, and AI data platform signals, but cloud and queue evidence is missing.
- `human_notes`: Approve Bright completion because added profile detail can decide contact versus reject.

### HR-009 P0 bright_probe_gate

- Candidate：Suraj kumar
- Headline：Suraj kumar | Node.js , Kafka, PostgreSQL, Mongodb , AWS | LinkedIn
- URL：https://in.linkedin.com/in/suraj-kumar-605aa2108
- LLM decision：yes
- Assistant strict decision：research_more
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：medium
- Missing evidence：Redis or queues (Kafka is event-driven, acceptable); TypeScript not explicitly mentioned but Node.js implies
- Evidence summary：Suraj kumar | Node.js , Kafka, PostgreSQL, Mongodb , AWS | LinkedIn Senior Backend / Platform Engineer with 6+ years of experience building scalable, high-availability backend systems and event-driven platforms.
- Review question：这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？
- Standard：只有当补全后有机会决定 contact/reject，才批准进入 Bright probe；明显不合适就不要花钱。
- Expected action：通过则进入 $1 以内 Bright URL/Profile completion；不通过则从 Bright probe plan 移除。
- Bright probe candidate：yes: LLM 原判 yes，但严格校准认为证据不足; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：Redis or queues (Kafka is event-driven, acceptable); TypeScript not explicitly mentioned but Node.js implies

Decision fields to fill:

- `human_decision`: contact_worthy
- `reviewer_type`: codex_headhunter
- `human_reason`: 6+ years backend/platform experience with Node.js, Kafka, PostgreSQL, MongoDB, AWS, and event-driven systems directly matches the backend platform JD.
- `human_notes`: Approve Bright completion mainly to confirm profile freshness and fill structured fields.

### HR-010 P0 bright_probe_gate

- Candidate：Azhar Ahmad
- Headline：Azhar Ahmad - Backend/Platform Engineer (TypeScript, gRPC ...
- URL：https://in.linkedin.com/in/azhar-ahmad-bb0661149
- LLM decision：yes
- Assistant strict decision：research_more
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：medium
- Missing evidence：PostgreSQL/MySQL; Redis/queues/event-driven
- Evidence summary：Azhar Ahmad - Backend/Platform Engineer (TypeScript, gRPC ... Azhar Ahmad. Backend/Platform Engineer (TypeScript, gRPC, WebRTC) • AWS/Azure, Terraform • Built distributed multi‑tenant backends, AI Orchestration ...
- Review question：这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？
- Standard：只有当补全后有机会决定 contact/reject，才批准进入 Bright probe；明显不合适就不要花钱。
- Expected action：通过则进入 $1 以内 Bright URL/Profile completion；不通过则从 Bright probe plan 移除。
- Bright probe candidate：yes: LLM 原判 yes，但严格校准认为证据不足; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：PostgreSQL/MySQL; Redis/queues/event-driven

Decision fields to fill:

- `human_decision`: research_more
- `reviewer_type`: codex_headhunter
- `human_reason`: Backend/platform evidence includes TypeScript, gRPC, AWS/Azure, Terraform, and distributed multi-tenant systems, but database and queue evidence is incomplete.
- `human_notes`: Approve Bright completion because the missing details are exactly what profile completion may resolve.

### HR-015 P0 bright_probe_gate

- Candidate：Daniel Chen
- Headline：Daniel Chen - Backend / Platform Engineer | Java, AWS, Kubernetes
- URL：https://my.linkedin.com/in/daniel-chen-qr
- LLM decision：maybe
- Assistant strict decision：research_more
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：low
- Source confidence：medium
- Missing evidence：TypeScript/Node.js; PostgreSQL/MySQL; Redis/queues/event-driven
- Evidence summary：Daniel Chen - Backend / Platform Engineer | Java, AWS, Kubernetes Backend / Platform Engineer building distributed systems, payment infrastructure, and production-grade cloud services. I specialize in secure API design, ...
- Review question：这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？
- Standard：只有当补全后有机会决定 contact/reject，才批准进入 Bright probe；明显不合适就不要花钱。
- Expected action：通过则进入 $1 以内 Bright URL/Profile completion；不通过则从 Bright probe plan 移除。
- Bright probe candidate：yes: LLM 原判 maybe，适合验证补全能否转正或排除; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：TypeScript/Node.js; PostgreSQL/MySQL

Decision fields to fill:

- `human_decision`: reject
- `reviewer_type`: codex_headhunter
- `human_reason`: Current evidence points to Java/AWS/Kubernetes backend work and misses the JD's TypeScript/Node.js, PostgreSQL/MySQL, and queue requirements.
- `human_notes`: Do not spend Bright on this row in the first probe; the core stack mismatch is too large.


## JD-08 Location 严格：Senior Backend Engineer, NYC Onsite

### HR-011 P0 bright_probe_gate

- Candidate：Lucas Chaufournier
- Headline：Lucas Chaufournier - Senior Backend Engineer | ex-Block (Square)
- URL：https://www.linkedin.com/in/lucas-ch
- LLM decision：yes
- Assistant strict decision：research_more
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：high
- Missing evidence：Python or Go; PostgreSQL; distributed systems; location in NYC
- Evidence summary：Lucas Chaufournier - Senior Backend Engineer | ex-Block (Square) I'm a senior backend engineer who builds high-scale platform systems that power real-world commerce and marketplaces. Most recently at Block (Square), ...
- Review question：这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？
- Standard：只有当补全后有机会决定 contact/reject，才批准进入 Bright probe；明显不合适就不要花钱。
- Expected action：通过则进入 $1 以内 Bright URL/Profile completion；不通过则从 Bright probe plan 移除。
- Bright probe candidate：yes: LLM 原判 yes，但严格校准认为证据不足; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：Python or Go; PostgreSQL

Decision fields to fill:

- `human_decision`: research_more
- `reviewer_type`: codex_headhunter
- `human_reason`: Senior backend ex-Block profile has strong fintech-adjacent platform signal, but NYC location, Python/Go, and PostgreSQL evidence are missing.
- `human_notes`: Approve Bright completion to verify location and stack before treating as contact-worthy.

### HR-012 P0 bright_probe_gate

- Candidate：Oskar W.
- Headline：Oskar W. - Senior Backend Engineer (FinTech/Payments) - LinkedIn
- URL：https://www.linkedin.com/in/oskarwong
- LLM decision：yes
- Assistant strict decision：research_more
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：high
- Missing evidence：Python or Go; PostgreSQL; distributed systems; location in NYC
- Evidence summary：Oskar W. - Senior Backend Engineer (FinTech/Payments) - LinkedIn I'm a Senior Backend Engineer with 15+ years of experience building secure, high-availability systems in FinTech/payments and e-commerce. I specialize in ...
- Review question：这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？
- Standard：只有当补全后有机会决定 contact/reject，才批准进入 Bright probe；明显不合适就不要花钱。
- Expected action：通过则进入 $1 以内 Bright URL/Profile completion；不通过则从 Bright probe plan 移除。
- Bright probe candidate：yes: LLM 原判 yes，但严格校准认为证据不足; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：Python or Go; PostgreSQL

Decision fields to fill:

- `human_decision`: research_more
- `reviewer_type`: codex_headhunter
- `human_reason`: Senior backend fintech/payments profile has strong domain and seniority signal, but NYC location and Python/Go/PostgreSQL evidence are missing.
- `human_notes`: Approve Bright completion because the profile could become contact-worthy if location and stack check out.

### HR-013 P0 bright_probe_gate

- Candidate：Ambareesh Pandit, MS
- Headline：Ambareesh Pandit, MS - Senior Backend Engineer | FinTech ...
- URL：https://www.linkedin.com/in/ambareeshpandit
- LLM decision：yes
- Assistant strict decision：research_more
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：high
- Missing evidence：Python or Go; PostgreSQL; distributed systems
- Evidence summary：Ambareesh Pandit, MS - Senior Backend Engineer | FinTech ... Ambareesh Pandit, MS. Senior Backend Engineer | FinTech | Compliance & Risk. New York City Metropolitan Area. 512 followers 404 connections.
- Review question：这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？
- Standard：只有当补全后有机会决定 contact/reject，才批准进入 Bright probe；明显不合适就不要花钱。
- Expected action：通过则进入 $1 以内 Bright URL/Profile completion；不通过则从 Bright probe plan 移除。
- Bright probe candidate：yes: LLM 原判 yes，但严格校准认为证据不足; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：Python or Go; PostgreSQL

Decision fields to fill:

- `human_decision`: research_more
- `reviewer_type`: codex_headhunter
- `human_reason`: Senior backend fintech/compliance profile is in the NYC metro area, but stack and distributed systems evidence are incomplete.
- `human_notes`: Approve Bright completion because location and domain are strong enough to justify one profile lookup.

### HR-014 P0 bright_probe_gate

- Candidate：Daniel Lanoff
- Headline：Daniel Lanoff - Senior Software Engineer | Data-Intensive Systems
- URL：https://www.linkedin.com/in/daniellanoff
- LLM decision：maybe
- Assistant strict decision：research_more
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：low
- Source confidence：medium
- Missing evidence：Python or Go; PostgreSQL; distributed systems; financial domain; location in NYC
- Evidence summary：Daniel Lanoff - Senior Software Engineer | Data-Intensive Systems Since then, I've worked as a Senior Backend Engineer across fintech and e-commerce, focusing on scalable, data-intensive systems and analytics tooling. My ...
- Review question：这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？
- Standard：只有当补全后有机会决定 contact/reject，才批准进入 Bright probe；明显不合适就不要花钱。
- Expected action：通过则进入 $1 以内 Bright URL/Profile completion；不通过则从 Bright probe plan 移除。
- Bright probe candidate：yes: LLM 原判 maybe，适合验证补全能否转正或排除; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：Python or Go; PostgreSQL

Decision fields to fill:

- `human_decision`: research_more
- `reviewer_type`: codex_headhunter
- `human_reason`: Backend/data-intensive systems evidence is directionally relevant, but stack, location, and financial infrastructure evidence are still too thin.
- `human_notes`: Approve Bright completion as a lower-confidence probe sample; do not count as contact-worthy before completion.


## JD-02 普通技术岗：Full-Stack Product Engineer

### HR-016 P1 serper_snippet_risk

- Candidate：Grant Schaeffer
- Headline：Grant Schaeffer - Full-Stack Product Engineer | Ex-Dropbox | LinkedIn
- URL：https://www.linkedin.com/in/grant-schaeffer-webdev
- LLM decision：yes
- Assistant strict decision：research_more
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：high
- Source confidence：high
- Missing evidence：Backend stack not explicitly mentioned, but Dropbox experience implies backend skills.
- Evidence summary：Grant Schaeffer - Full-Stack Product Engineer | Ex-Dropbox | LinkedIn I'm a full-stack product engineer with 3+ years of professional experience building production software at Dropbox, with a focus on React, TypeScript, ...
- Review question：这是 Serper/Google 摘要误判，还是值得补证据的候选？
- Standard：如果摘要已经显示核心匹配但缺履历细节，填 research_more；如果只是关键词堆叠，填 reject。
- Expected action：用于收紧 LLM yes 门槛和决定是否继续依赖 Serper/X-ray。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: 
- `reviewer_type`: 
- `human_reason`: 
- `human_notes`: 

### HR-021 P1 github_profile_needed

- Candidate：Peter Adel
- Headline：Peter Adel
- URL：https://github.com/0PeterAdel/AI-Chat
- LLM decision：maybe
- Assistant strict decision：research_more
- Provider mix：exa
- Source types：github
- Snippet-only risk：no
- Profile completeness：low
- Source confidence：low
- Missing evidence：Professional experience; Product engineer role; SQL; API design; product analytics; product judgment
- Evidence summary：Peter Adel l will sacrifice the life I live, for the life I want to live💫🤍 AI-Chat | TypeScript | 20 stars | A full-stack AI-powered chatbot web application built with React, TypeScript, and Node.js. Integrates with the Gemini API to provide intelligent, real-time conversations.
- Review question：GitHub 项目证据是否足以继续找 profile，还是和职业候选人不相关？
- Standard：只看项目不能确认职业经历；除非项目强相关且有明确身份线索，否则不进入外部付费补全。
- Expected action：决定 GitHub 是否只保留为 evidence enrichment，而不是候选召回入口。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: 
- `reviewer_type`: 
- `human_reason`: 
- `human_notes`: 

### HR-022 P1 github_profile_needed

- Candidate：Mohd Aasim Ansari
- Headline：Mohd Aasim Ansari
- URL：https://github.com/aasimansari1/chatnova-ai
- LLM decision：maybe
- Assistant strict decision：research_more
- Provider mix：exa
- Source types：github
- Snippet-only risk：no
- Profile completeness：low
- Source confidence：low
- Missing evidence：Professional experience; Product engineer role; SQL; API design; product analytics; product judgment
- Evidence summary：Mohd Aasim Ansari 🚀 Aspiring Data Scientist & AI Engineer | Python • React • FastAPI • LangChain • CrewAI • RAG • LangGraph chatnova-ai | JavaScript | 0 stars | 🤖 Full-stack AI chatbot platform — React + Node.js + MongoDB + OpenAI | Real-time chat, auth, dark mode
- Review question：GitHub 项目证据是否足以继续找 profile，还是和职业候选人不相关？
- Standard：只看项目不能确认职业经历；除非项目强相关且有明确身份线索，否则不进入外部付费补全。
- Expected action：决定 GitHub 是否只保留为 evidence enrichment，而不是候选召回入口。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: 
- `reviewer_type`: 
- `human_reason`: 
- `human_notes`: 


## JD-07 极窄技能：Healthcare Interoperability Engineer

### HR-018 P1 serper_snippet_risk

- Candidate：Luis E Silva
- Headline：Luis E Silva - Healthcare Interoperability Engineer & Founder ...
- URL：https://www.linkedin.com/in/luis-e-silva-26425b39a
- LLM decision：yes
- Assistant strict decision：research_more
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：high
- Missing evidence：Strong Python, Java, or TypeScript; Experience with secure data handling, audit logs, and compliance-heavy systems
- Evidence summary：Luis E Silva - Healthcare Interoperability Engineer & Founder ... Luis E Silva. Healthcare Interoperability Engineer & Founder, CodeFhir | HL7, X12, C-CDA → FHIR | CMS-0057-F Compliance | 18+ Years in Healthcare IT | Ex-VA ...
- Review question：这是 Serper/Google 摘要误判，还是值得补证据的候选？
- Standard：如果摘要已经显示核心匹配但缺履历细节，填 research_more；如果只是关键词堆叠，填 reject。
- Expected action：用于收紧 LLM yes 门槛和决定是否继续依赖 Serper/X-ray。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: 
- `reviewer_type`: 
- `human_reason`: 
- `human_notes`: 

### HR-019 P1 serper_snippet_risk

- Candidate：Vivian Sendling
- Headline：Vivian Sendling-Ortiz - Certified Healthcare Interoperability Engineer ...
- URL：https://www.linkedin.com/in/viviansendlingortiz
- LLM decision：yes
- Assistant strict decision：research_more
- Provider mix：serper
- Source types：linkedin
- Snippet-only risk：yes
- Profile completeness：medium
- Source confidence：high
- Missing evidence：Strong Python, Java, or TypeScript; Experience with secure data handling, audit logs, and compliance-heavy systems
- Evidence summary：Vivian Sendling-Ortiz - Certified Healthcare Interoperability Engineer ... Certified Healthcare Interoperability Engineer, specializing in HL7v2, HL7v3, and FHIR with various integration engines. · Senior Interoperability Engineer ...
- Review question：这是 Serper/Google 摘要误判，还是值得补证据的候选？
- Standard：如果摘要已经显示核心匹配但缺履历细节，填 research_more；如果只是关键词堆叠，填 reject。
- Expected action：用于收紧 LLM yes 门槛和决定是否继续依赖 Serper/X-ray。
- Bright probe candidate：no

Decision fields to fill:

- `human_decision`: 
- `reviewer_type`: 
- `human_reason`: 
- `human_notes`: 

## Validation

填完 CSV 后运行：

```bash
npm run sourcing:validate-human-review
```

如果要强制要求 P0 全部完成，运行：

```bash
npm run sourcing:validate-human-review -- --require-p0-complete
```

