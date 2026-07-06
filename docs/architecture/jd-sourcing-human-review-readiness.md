# JD Sourcing Human Review Readiness

本报告只检查人审队列完成度和 Bright 付费 probe 开闸条件，不调用任何外部 provider。

## Summary

- Review queue：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-human-review-queue.csv`
- Bright plan：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-bright-probe-plan.json`
- Reviewed rows：15/24
- P0 reviewed：15/15
- P0 complete：yes
- Bright gate complete：yes
- Bright probe allowed：yes

## Bright Gate

- Gate rows：8/8 reviewed
- Approved rows：7
- Rejected/uncertain rows：1
- Dry plan estimated total cost：$0.1500
- Approved profile completion estimated cost：$0.0175

## Approved Bright Candidates

| Review ID | JD | Candidate | Decision | In dry plan | URL |
| --- | --- | --- | --- | --- | --- |
| HR-008 | JD-01 | Raul Murguia | research_more | yes | https://www.linkedin.com/in/raulmurguia |
| HR-009 | JD-01 | Suraj kumar | contact_worthy | yes | https://in.linkedin.com/in/suraj-kumar-605aa2108 |
| HR-010 | JD-01 | Azhar Ahmad | research_more | yes | https://in.linkedin.com/in/azhar-ahmad-bb0661149 |
| HR-011 | JD-08 | Lucas Chaufournier | research_more | yes | https://www.linkedin.com/in/lucas-ch |
| HR-012 | JD-08 | Oskar W. | research_more | yes | https://www.linkedin.com/in/oskarwong |
| HR-013 | JD-08 | Ambareesh Pandit, MS | research_more | yes | https://www.linkedin.com/in/ambareeshpandit |
| HR-014 | JD-08 | Daniel Lanoff | research_more | yes | https://www.linkedin.com/in/daniellanoff |

## Missing P0 Rows

| Review ID | Bucket | JD | Candidate |
| --- | --- | --- | --- |

## Usage

- 只有 `Bright probe allowed: yes` 时，才允许执行真实 Bright probe。
- 默认要求全部 P0 行完成；如只想检查 Bright gate，可用 `--allow-partial-p0`，但不能作为完整人工校准。
- 生成本报告：`npm run sourcing:human-review-readiness -- --out-md=docs/architecture/jd-sourcing-human-review-readiness.md --out-json=docs/architecture/jd-sourcing-human-review-readiness.json`

