# JD Sourcing Human Review Validation

本报告只校验本地 review queue 的复核字段，不调用外部 provider。

## Summary

- Status：valid
- Review queue：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-human-review-queue.csv`
- Reviewed rows：0/24
- P0 reviewed：0/15
- Bright gate reviewed：0/8
- Errors：0
- Warnings：0

## Allowed Values

- human_decision：`contact_worthy`, `research_more`, `reject`, `uncertain`
- reviewer_type：`human_headhunter`, `human_recruiter`, `human_hiring_manager`, `codex_headhunter`, `codex_recruiter`

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

## Missing Bright Gate Rows

| Review ID | JD | Candidate |
| --- | --- | --- |
| HR-008 | JD-01 | Raul Murguia |
| HR-009 | JD-01 | Suraj kumar |
| HR-010 | JD-01 | Azhar Ahmad |
| HR-011 | JD-08 | Lucas Chaufournier |
| HR-012 | JD-08 | Oskar W. |
| HR-013 | JD-08 | Ambareesh Pandit, MS |
| HR-014 | JD-08 | Daniel Lanoff |
| HR-015 | JD-01 | Daniel Chen |
