# JD Sourcing Human Review Readiness

本报告只检查人审队列完成度和 Bright 付费 probe 开闸条件，不调用任何外部 provider。

## Summary

- Review queue：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-human-review-queue.csv`
- Bright plan：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-bright-probe-plan.json`
- Reviewed rows：0/24
- P0 reviewed：0/15
- P0 complete：no
- Bright gate complete：no
- Bright probe allowed：no

## Bright Gate

- Gate rows：0/8 reviewed
- Approved rows：0
- Rejected/uncertain rows：0
- Dry plan estimated total cost：$0.1500
- Approved profile completion estimated cost：$0.0000

## Blockers

- P0 review incomplete: 0/15
- Bright gate review incomplete: 0/8
- No Bright gate candidates approved by human review

## Approved Bright Candidates

| Review ID | JD | Candidate | Decision | In dry plan | URL |
| --- | --- | --- | --- | --- | --- |

## Missing P0 Rows

| Review ID | Bucket | JD | Candidate |
| --- | --- | --- | --- |
| HR-001 | confirm_assistant_contact_worthy | JD-03 | Divyansh Mishra |
| HR-002 | confirm_assistant_contact_worthy | JD-03 | Chaithra Chandru |
| HR-003 | confirm_assistant_contact_worthy | JD-05 | Tim Hwang |
| HR-004 | confirm_assistant_contact_worthy | JD-05 | Masudur Rahman |
| HR-005 | confirm_assistant_contact_worthy | JD-09 | Ekaterina (Katya) Gonina |
| HR-006 | confirm_assistant_contact_worthy | JD-10 | Emmanuel Nkasi |
| HR-007 | confirm_assistant_contact_worthy | JD-10 | Aviral Malik |
| HR-008 | bright_probe_gate | JD-01 | Raul Murguia |
| HR-009 | bright_probe_gate | JD-01 | Suraj kumar |
| HR-010 | bright_probe_gate | JD-01 | Azhar Ahmad |
| HR-011 | bright_probe_gate | JD-08 | Lucas Chaufournier |
| HR-012 | bright_probe_gate | JD-08 | Oskar W. |
| HR-013 | bright_probe_gate | JD-08 | Ambareesh Pandit, MS |
| HR-014 | bright_probe_gate | JD-08 | Daniel Lanoff |
| HR-015 | bright_probe_gate | JD-01 | Daniel Chen |

## Usage

- 只有 `Bright probe allowed: yes` 时，才允许执行真实 Bright probe。
- 默认要求全部 P0 行完成；如只想检查 Bright gate，可用 `--allow-partial-p0`，但不能作为完整人工校准。
- 生成本报告：`npm run sourcing:human-review-readiness -- --out-md=docs/architecture/jd-sourcing-human-review-readiness.md --out-json=docs/architecture/jd-sourcing-human-review-readiness.json`

