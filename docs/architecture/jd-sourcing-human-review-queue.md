# JD Sourcing Human Review Queue

本队列用于把 assistant_strict 校准结果转成人工/猎头视角的最小复核任务。它不是新的模型判断，也不调用任何外部 provider。

## Review Rules

- `contact_worthy`：证据已经足够，真实猎头会放进 outreach 或 shortlist。
- `research_more`：方向可能对，但缺 Profile/履历/技能证据，需要补全后再判断。
- `reject`：不适合该 JD，或者只是关键词、title、项目名重合。
- 不要为了让指标好看把 snippet-only 候选填成 `contact_worthy`。

## Scope

- 输入校准表：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-calibration-assistant-strict.csv`
- Bright plan：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-bright-probe-plan.json`
- 队列行数：24
- Buckets：confirm_assistant_contact_worthy=7, bright_probe_gate=8, serper_snippet_risk=5, github_profile_needed=2, negative_control=2

## Queue

| ID | Priority | Bucket | JD | Candidate | LLM | Assistant | URL | Review question |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HR-001 | P0 | confirm_assistant_contact_worthy | JD-03 普通技术岗：Data Engineer | Divyansh Mishra | yes | contact_worthy | https://in.linkedin.com/in/divyansh-mishra-3606b716b | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-002 | P0 | confirm_assistant_contact_worthy | JD-03 普通技术岗：Data Engineer | Chaithra Chandru | yes | contact_worthy | https://in.linkedin.com/in/chaithra-c | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-003 | P0 | confirm_assistant_contact_worthy | JD-05 高级基础架构：Engineering Manager, Platform | Tim Hwang | yes | contact_worthy | https://www.linkedin.com/in/timwhwang | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-004 | P0 | confirm_assistant_contact_worthy | JD-05 高级基础架构：Engineering Manager, Platform | Masudur Rahman | yes | contact_worthy | https://www.linkedin.com/in/rahmanmasudur | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-005 | P0 | confirm_assistant_contact_worthy | JD-09 ML / Research：ML Infrastructure Engineer | Ekaterina (Katya) Gonina | yes | contact_worthy | https://www.linkedin.com/in/ekaterina-katya-gonina-0b61828 | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-006 | P0 | confirm_assistant_contact_worthy | JD-10 非典型相邻背景：Technical Solutions Engineer to Product Engineer | Emmanuel Nkasi | yes | contact_worthy | https://ng.linkedin.com/in/emmanuelnkasi | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-007 | P0 | confirm_assistant_contact_worthy | JD-10 非典型相邻背景：Technical Solutions Engineer to Product Engineer | Aviral Malik | yes | contact_worthy | https://in.linkedin.com/in/aviral-malik-3a6859205 | 严格站在猎头视角，这个人是否已经证据足够、可以直接进入 outreach/shortlist？ |
| HR-008 | P0 | bright_probe_gate | JD-01 普通技术岗：Backend Platform Engineer | Raul Murguia | yes | research_more | https://www.linkedin.com/in/raulmurguia | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-009 | P0 | bright_probe_gate | JD-01 普通技术岗：Backend Platform Engineer | Suraj kumar | yes | research_more | https://in.linkedin.com/in/suraj-kumar-605aa2108 | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-010 | P0 | bright_probe_gate | JD-01 普通技术岗：Backend Platform Engineer | Azhar Ahmad | yes | research_more | https://in.linkedin.com/in/azhar-ahmad-bb0661149 | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-011 | P0 | bright_probe_gate | JD-08 Location 严格：Senior Backend Engineer, NYC Onsite | Lucas Chaufournier | yes | research_more | https://www.linkedin.com/in/lucas-ch | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-012 | P0 | bright_probe_gate | JD-08 Location 严格：Senior Backend Engineer, NYC Onsite | Oskar W. | yes | research_more | https://www.linkedin.com/in/oskarwong | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-013 | P0 | bright_probe_gate | JD-08 Location 严格：Senior Backend Engineer, NYC Onsite | Ambareesh Pandit, MS | yes | research_more | https://www.linkedin.com/in/ambareeshpandit | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-014 | P0 | bright_probe_gate | JD-08 Location 严格：Senior Backend Engineer, NYC Onsite | Daniel Lanoff | maybe | research_more | https://www.linkedin.com/in/daniellanoff | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-015 | P0 | bright_probe_gate | JD-01 普通技术岗：Backend Platform Engineer | Daniel Chen | maybe | research_more | https://my.linkedin.com/in/daniel-chen-qr | 这个 LinkedIn URL 是否值得消耗 Bright 做 profile completion？ |
| HR-016 | P1 | serper_snippet_risk | JD-02 普通技术岗：Full-Stack Product Engineer | Grant Schaeffer | yes | research_more | https://www.linkedin.com/in/grant-schaeffer-webdev | 这是 Serper/Google 摘要误判，还是值得补证据的候选？ |
| HR-017 | P1 | serper_snippet_risk | JD-03 普通技术岗：Data Engineer | Konduru Sindhu | yes | research_more | https://in.linkedin.com/in/konduru-sindhu-06b766405 | 这是 Serper/Google 摘要误判，还是值得补证据的候选？ |
| HR-018 | P1 | serper_snippet_risk | JD-07 极窄技能：Healthcare Interoperability Engineer | Luis E Silva | yes | research_more | https://www.linkedin.com/in/luis-e-silva-26425b39a | 这是 Serper/Google 摘要误判，还是值得补证据的候选？ |
| HR-019 | P1 | serper_snippet_risk | JD-07 极窄技能：Healthcare Interoperability Engineer | Vivian Sendling | yes | research_more | https://www.linkedin.com/in/viviansendlingortiz | 这是 Serper/Google 摘要误判，还是值得补证据的候选？ |
| HR-020 | P1 | serper_snippet_risk | JD-09 ML / Research：ML Infrastructure Engineer | Elliot Zhang | yes | research_more | https://www.linkedin.com/in/elliot-zhang | 这是 Serper/Google 摘要误判，还是值得补证据的候选？ |
| HR-021 | P1 | github_profile_needed | JD-02 普通技术岗：Full-Stack Product Engineer | Peter Adel | maybe | research_more | https://github.com/0PeterAdel/AI-Chat | GitHub 项目证据是否足以继续找 profile，还是和职业候选人不相关？ |
| HR-022 | P1 | github_profile_needed | JD-02 普通技术岗：Full-Stack Product Engineer | Mohd Aasim Ansari | maybe | research_more | https://github.com/aasimansari1/chatnova-ai | GitHub 项目证据是否足以继续找 profile，还是和职业候选人不相关？ |
| HR-023 | P2 | negative_control | JD-04 高级基础架构：Staff Infrastructure Engineer | Sagar Kakkala | maybe | reject | https://pt.linkedin.com/in/sagar-kakkala | 这个 reject 是否确实不应联系？ |
| HR-024 | P2 | negative_control | JD-05 高级基础架构：Engineering Manager, Platform | Patrick Bucaria | no | reject | https://www.linkedin.com/in/patrick-bucaria-45946278 | 这个 reject 是否确实不应联系？ |

## Bucket Intent

- `confirm_assistant_contact_worthy`：先确认 assistant_strict 认为可联系的正例，决定 benchmark 是否有真实 PMF 信号。
- `bright_probe_gate`：真实 Bright probe 前的花钱门控，只批准补全后能产生判断价值的 LinkedIn URL。
- `serper_snippet_risk`：检验 Serper/Google 摘要是否让 LLM yes 偏乐观。
- `github_profile_needed`：判断 GitHub 证据是否值得继续找职业 profile。
- `negative_control`：少量负例对照，防止只审正例导致偏差。

## How To Use

1. 填写 CSV 里的 `human_decision`、`reviewer_type`、`human_reason`、`human_notes`。
2. 先完成 P0 行，再看 P1；P2 只做少量边界校准。
3. 如果 `bright_probe_gate` 行没有人工通过，不要执行真实 Bright probe。
4. 人审完成后，再用人工结果更新 benchmark decision report。

