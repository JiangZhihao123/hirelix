# JD Sourcing Human Review Validation

本报告只校验本地 review queue 的复核字段，不调用外部 provider。

## Summary

- Status：valid
- Review queue：`/Users/noah/projects/hirelix/docs/architecture/jd-sourcing-human-review-queue.csv`
- Reviewed rows：15/24
- P0 reviewed：15/15
- Bright gate reviewed：8/8
- Errors：0
- Warnings：7

## Allowed Values

- human_decision：`contact_worthy`, `research_more`, `reject`, `uncertain`
- reviewer_type：`human_headhunter`, `human_recruiter`, `human_hiring_manager`, `codex_headhunter`, `codex_recruiter`

## Issues

| Severity | Review ID | Field | Message |
| --- | --- | --- | --- |
| warning | HR-001 | human_decision | contact_worthy on snippet-only evidence needs especially strong human_reason |
| warning | HR-002 | human_decision | contact_worthy on snippet-only evidence needs especially strong human_reason |
| warning | HR-003 | human_decision | contact_worthy on snippet-only evidence needs especially strong human_reason |
| warning | HR-004 | human_decision | contact_worthy on snippet-only evidence needs especially strong human_reason |
| warning | HR-005 | human_decision | contact_worthy on snippet-only evidence needs especially strong human_reason |
| warning | HR-007 | human_decision | contact_worthy on snippet-only evidence needs especially strong human_reason |
| warning | HR-009 | human_decision | contact_worthy on snippet-only evidence needs especially strong human_reason |

## Missing P0 Rows

| Review ID | Bucket | JD | Candidate |
| --- | --- | --- | --- |

## Missing Bright Gate Rows

| Review ID | JD | Candidate |
| --- | --- | --- |
