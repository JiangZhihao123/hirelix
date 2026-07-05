# JD Sourcing Provider Value Report

本报告把 10 JD live benchmark 的 provider/lane 贡献整理成可执行结论。注意：contact-worthy 仍是 LLM light screen 口径，除非校准完成，否则不能当作真实猎头确认。

## Benchmark

- Benchmark：`benchmark-2026-07-05T16-41-40-341Z-d05df7cc`
- 目录：`/Users/noah/projects/hirelix/runs/sourcing-benchmark/benchmark-2026-07-05T16-41-40-341Z-d05df7cc`
- 模式：`live`
- Providers：`serper,exa,firecrawl,github`
- JD：10/10 completed，errors 0
- Actual cost：$0.1450
- Candidate cards：168
- Raw LLM contact-worthy：50

## Provider Summary

| Provider | Returned | Cards | Reviewable | Raw contact-worthy | Raw contact rate | Cost | Cost/raw contact |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| exa | 85 | 85 | 23 | 3 | 3.5% | $0.0850 | $0.0283 |
| firecrawl | 20 | 0 | 0 | 0 | 0.0% | $0.0400 | N/A |
| github | 9 | 0 | 0 | 0 | 0.0% | $0.0000 | N/A |
| serper | 91 | 83 | 80 | 47 | 56.6% | $0.0200 | $0.0004 |

## Conclusions

- Serper produced 47/50 raw LLM contact-worthy candidates (94.0% share), so current discovery is highly Google/X-ray dependent.
- assistant_strict yes precision is 26.9%; provider raw yield must not be treated as true outreach yield before manual/headhunter review.
- Exa returned 85 candidate cards but only 3 raw contact-worthy (3.5%), so it is currently a supplementary discovery source, not the main lane.
- Firecrawl spent $0.0400 as extraction/evidence layer; candidate attribution is 0, so its value should be measured by whether it upgrades research_more rows, not by standalone contact-worthy count.
- GitHub had 2 provider errors and no direct candidate attribution; keep it as technical evidence enrichment, not initial candidate delivery.
- Top raw-yield lanes are mostly high-intent title/location X-ray lanes; broad semantic lanes should be capped until manual calibration proves incremental value.

## Calibration Overlay

- 校准文件：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-calibration-assistant-strict.csv`
- 校准方式：assistant_strict
- 已审样本：56/56
- contact_worthy：7
- research_more：35
- reject：14
- LLM yes precision：26.9%
- snippet-only research_more：33

## Top Raw-Yield Lanes

| JD | Provider | Lane | Cards | Reviewable | Raw contact-worthy | Cost | Cost/raw contact |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| JD-09 ML / Research：ML Infrastructure Engineer | serper | lane-1 | 10 | 10 | 8 | $0.0020 | $0.0003 |
| JD-04 高级基础架构：Staff Infrastructure Engineer | serper | lane-1 | 5 | 5 | 5 | $0.0010 | $0.0002 |
| JD-10 非典型相邻背景：Technical Solutions Engineer to Product Engineer | serper | lane-1 | 5 | 5 | 5 | $0.0010 | $0.0002 |
| JD-10 非典型相邻背景：Technical Solutions Engineer to Product Engineer | serper | lane-2 | 5 | 5 | 5 | $0.0010 | $0.0002 |
| JD-02 普通技术岗：Full-Stack Product Engineer | serper | lane-1 | 5 | 5 | 5 | $0.0020 | $0.0004 |
| JD-08 Location 严格：Senior Backend Engineer, NYC Onsite | serper | lane-1 | 9 | 9 | 5 | $0.0020 | $0.0004 |
| JD-03 普通技术岗：Data Engineer | serper | lane-1 | 5 | 5 | 4 | $0.0010 | $0.0003 |
| JD-01 普通技术岗：Backend Platform Engineer | serper | lane-1 | 8 | 8 | 4 | $0.0020 | $0.0005 |
| JD-07 极窄技能：Healthcare Interoperability Engineer | serper | lane-1 | 10 | 10 | 3 | $0.0020 | $0.0007 |
| JD-05 高级基础架构：Engineering Manager, Platform | serper | lane-1 | 10 | 8 | 2 | $0.0020 | $0.0010 |
| JD-01 普通技术岗：Backend Platform Engineer | exa | lane-5 | 5 | 3 | 2 | $0.0050 | $0.0025 |
| JD-03 普通技术岗：Data Engineer | serper | lane-2 | 5 | 5 | 1 | $0.0010 | $0.0010 |

## Paid Lanes With Zero Raw Contact

| JD | Provider | Lane | Cards | Cost | Failure modes |
| --- | --- | --- | ---: | ---: | --- |
| JD-02 普通技术岗：Full-Stack Product Engineer | exa | lane-5 | 10 | $0.0100 |  |
| JD-03 普通技术岗：Data Engineer | exa | lane-4 | 5 | $0.0050 |  |
| JD-04 高级基础架构：Staff Infrastructure Engineer | exa | lane-3 | 5 | $0.0050 |  |
| JD-04 高级基础架构：Staff Infrastructure Engineer | exa | lane-5 | 5 | $0.0050 |  |
| JD-05 高级基础架构：Engineering Manager, Platform | exa | lane-3 | 5 | $0.0050 |  |
| JD-05 高级基础架构：Engineering Manager, Platform | exa | lane-5 | 5 | $0.0050 |  |
| JD-06 极窄技能：Blockchain Indexing Engineer | exa | lane-3 | 5 | $0.0050 |  |
| JD-07 极窄技能：Healthcare Interoperability Engineer | exa | lane-5 | 5 | $0.0050 |  |
| JD-08 Location 严格：Senior Backend Engineer, NYC Onsite | exa | lane-2 | 5 | $0.0050 |  |
| JD-08 Location 严格：Senior Backend Engineer, NYC Onsite | exa | lane-4 | 5 | $0.0050 |  |
| JD-09 ML / Research：ML Infrastructure Engineer | exa | lane-3 | 5 | $0.0050 |  |
| JD-09 ML / Research：ML Infrastructure Engineer | exa | lane-4 | 5 | $0.0050 |  |

## Product Implication

- 下一步不应该扩更多 broad provider，而是先做人审校准和 profile 补全对照。
- Serper/X-ray 可以继续作为冷启动发现层，但必须用补全和严格 rerank 过滤 snippet-only 误判。
- Exa、GitHub、Firecrawl 暂时放在补充发现和证据层，不应承诺为主召回来源。
- Bright 的真实测试应按 `jd-sourcing-bright-probe-plan.md` 做 URL/Profile completion，而不是放大 Dataset Filter 召回。

