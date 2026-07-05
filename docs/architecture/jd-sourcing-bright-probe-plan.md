# JD Sourcing Bright/Profile Dry Probe Plan

本计划只基于已有 benchmark、校准 CSV 和 run directory 生成，不调用 Bright，不创建 snapshot，也不产生外部费用。

## 结论

- 模式：`dry_plan_only`
- 校准来源：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-calibration-assistant-strict.csv`
- 选中 JD：2
- 选中候选人：10
- 预计 Bright URL/Profile completion 成本：$0.0250
- 预计 Bright Dataset Filter 对照成本：$0.1250
- 预计总 Bright 成本：$0.1500
- 预算 cap：$1.00，是否在 cap 内：yes

## 选择口径

- 只选 `assistant_strict` 标为 `research_more` 的行。
- 只选 `snippet_only_risk=yes` 的行，因为它们最能验证 profile 补全是否有价值。
- 优先 LinkedIn URL 候选，因为 Bright 的高价值验证应是 URL/profile completion，不是泛召回。
- 每个 JD 限制候选数量，避免单个 JD 把小额预算吃完。

## 为什么不是直接跑 Bright 召回

Bright 当前应被验证为结构化 profile 原料或 LinkedIn URL 补全源，而不是 JD 语义召回引擎。Dataset Filter 对照只能回答“这些字段过滤是否能补到类似人”，不能证明 Bright 能理解 JD 并完成 recruiter sourcing。

## 总体统计

| 指标 | 数值 |
| --- | ---: |
| calibration rows | 56 |
| eligible rows | 33 |
| selected JDs | 2 |
| selected candidates | 10 |
| linkedin URL candidates | 10 |
| excluded: not research_more | 21 |
| excluded: not snippet_only | 2 |
| excluded: not preferred source | 0 |
| excluded: no LinkedIn URL | 0 |

## JD-01 普通技术岗：Backend Platform Engineer

- Run dir：`/Users/noah/projects/hirelix/runs/sourcing-benchmark/benchmark-2026-07-05T16-41-40-341Z-d05df7cc/runs/JD-01/sourcing-2026-07-05T16-41-40-499Z-7f65d1df`
- 选中候选人：5
- URL/Profile completion 预计成本：$0.0125
- Dataset Filter 对照：enabled，预计成本 $0.0625
- 对照 lane：lane-1

| Candidate | LLM | Source | LinkedIn URL | 为什么值得补全 |
| --- | --- | --- | --- | --- |
| Raul Murguia | yes | serper | https://www.linkedin.com/in/raulmurguia | LLM 原判 yes，但严格校准认为证据不足; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：Redis/queues/event-driven systems; AWS/GCP/Kubernetes |
| Suraj kumar | yes | serper | https://in.linkedin.com/in/suraj-kumar-605aa2108 | LLM 原判 yes，但严格校准认为证据不足; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：Redis or queues (Kafka is event-driven, acceptable); TypeScript not explicitly mentioned but Node.js implies |
| Azhar Ahmad | yes | serper | https://in.linkedin.com/in/azhar-ahmad-bb0661149 | LLM 原判 yes，但严格校准认为证据不足; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：PostgreSQL/MySQL; Redis/queues/event-driven |
| Daniel Chen | maybe | serper | https://my.linkedin.com/in/daniel-chen-qr | LLM 原判 maybe，适合验证补全能否转正或排除; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：TypeScript/Node.js; PostgreSQL/MySQL |
| Stephanye Blakely | maybe | serper | https://www.linkedin.com/in/stephanye-blakely | LLM 原判 maybe，适合验证补全能否转正或排除; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：4+ years backend experience; PostgreSQL/MySQL |

Dataset Filter preview:

```json
{
  "operator": "or",
  "filters": [
    {
      "name": "position",
      "operator": "includes",
      "value": "backend platform engineer"
    }
  ]
}
```

## JD-08 Location 严格：Senior Backend Engineer, NYC Onsite

- Run dir：`/Users/noah/projects/hirelix/runs/sourcing-benchmark/benchmark-2026-07-05T16-41-40-341Z-d05df7cc/runs/JD-08/sourcing-2026-07-05T16-46-08-733Z-791e2457`
- 选中候选人：5
- URL/Profile completion 预计成本：$0.0125
- Dataset Filter 对照：enabled，预计成本 $0.0625
- 对照 lane：lane-1

| Candidate | LLM | Source | LinkedIn URL | 为什么值得补全 |
| --- | --- | --- | --- | --- |
| Lucas Chaufournier | yes | serper | https://www.linkedin.com/in/lucas-ch | LLM 原判 yes，但严格校准认为证据不足; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：Python or Go; PostgreSQL |
| Oskar W. | yes | serper | https://www.linkedin.com/in/oskarwong | LLM 原判 yes，但严格校准认为证据不足; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：Python or Go; PostgreSQL |
| Ambareesh Pandit, MS | yes | serper | https://www.linkedin.com/in/ambareeshpandit | LLM 原判 yes，但严格校准认为证据不足; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：Python or Go; PostgreSQL |
| Daniel Lanoff | maybe | serper | https://www.linkedin.com/in/daniellanoff | LLM 原判 maybe，适合验证补全能否转正或排除; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：Python or Go; PostgreSQL |
| Stephen Jude | maybe | serper | https://ng.linkedin.com/in/stephenjudeso | LLM 原判 maybe，适合验证补全能否转正或排除; 来自 Serper/Google discovery，需验证摘要是否误判; 已有 LinkedIn URL，适合 Bright URL/Profile completion; 缺失证据：location in NYC; Python or Go |

Dataset Filter preview:

```json
{
  "operator": "and",
  "filters": [
    {
      "operator": "or",
      "filters": [
        {
          "name": "position",
          "operator": "includes",
          "value": "senior backend engineer"
        }
      ]
    },
    {
      "name": "country_code",
      "operator": "=",
      "value": "US"
    },
    {
      "name": "location",
      "operator": "includes",
      "value": "New York"
    }
  ]
}
```

## 下一步

- 先人工复核本计划中的 selected_candidates，确认这些 LinkedIn URL 真值得花钱补全。
- 如果要真实调用 Bright，先把实际预算 cap 写清楚；建议第一轮不超过 $1。
- 真实 probe 后只评估两件事：Bright URL/profile completion 是否补足关键证据；Bright Dataset Filter 是否能补到同类候选。
- 不要把 Bright Dataset Filter 结果当 JD 语义召回成功；它只能作为结构化对照组。

