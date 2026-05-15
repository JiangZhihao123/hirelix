# Real Role Validation Playbook

This playbook is for validating Hirelix with boutique technical recruiters and independent technical headhunters before broader paid beta.

## Goal

Prove that Hirelix can turn a real technical role into a shortlist that recruiters actually use.

The validation target is not signups. The target is recruiter action:

- Contacted candidates
- Candidate replies
- Candidates submitted to the client
- Interviews created
- Placements influenced

## ICP

Prioritize:

- Independent technical recruiters
- Boutique technical search firms
- Agency founders working software, AI, data, security, infra, or devtools roles
- Recruiters posting live technical roles on LinkedIn

Avoid early:

- Enterprise TA teams with long procurement cycles
- Generic HR users who do not personally source candidates
- Non-technical high-volume roles where GitHub or public engineering evidence has low value

## Offer

Use a result-first offer:

> Send one hard technical role. Hirelix will return a client-ready shortlist with fit reasoning, usable evidence, risks to verify, and outreach angles.

The success bar:

> At least 3-5 candidates the recruiter would actually contact for the live role.

## 30-Day Sprint

| Week | Action | Output |
|------|--------|--------|
| 1 | Build a 300-person target list from LinkedIn and recruiter communities | Target list with niche, role focus, and recent hiring signal |
| 1-2 | Send 20 founder-led outreach messages per day | 20 real roles submitted for testing |
| 2-3 | Run each role through Hirelix and manually QA results before sharing | 20 client-ready shortlists |
| 3-4 | Follow up on candidate action and payment willingness | PMF signal sheet |

## Per-Search QA Checklist

Before sending results to a recruiter, verify:

- The JD was parsed into the right seniority, skills, target companies, and location constraints.
- The shortlist has a clear `Reach Out First` tier.
- Each top candidate has a client brief, not only a score.
- Each top candidate has at least one concrete reason to contact.
- Risk flags are explicit instead of hidden.
- Outreach copy does not overclaim and does not reveal the client name.

## Interview Questions

Ask after every delivered shortlist:

1. How many candidates would you actually contact?
2. Which candidates should not have appeared?
3. Who is the strongest candidate and why?
4. Could you send this brief to a client or hiring manager?
5. What would you need before contacting them?
6. Would you pay for 10 searches like this per month?
7. At what price would this feel obvious: $99, $149, $299, or more?

## Product Tracking

Use candidate statuses as the validation funnel:

| Status | Meaning |
|--------|---------|
| `starred` | Recruiter thinks the candidate is worth deeper review |
| `contacted` | Recruiter contacted the candidate |
| `replied` | Candidate replied |
| `submitted` | Recruiter submitted the candidate to a client or hiring manager |
| `interview` | Candidate moved to interview |
| `placed` | Candidate influenced a placement |
| `rejected` | Recruiter ruled the candidate out |

## Pass Criteria

| Metric | Target |
|--------|--------|
| Searches with 5+ contact-worthy candidates | 65%+ |
| Searches where recruiter contacts at least one candidate | 50%+ |
| Searches with at least one reply | 20%-30% |
| Users who run a second real search within 30 days | 40%+ |
| Users willing to pay $149+ monthly | 25%+ |
| Recruiters who would be disappointed without Hirelix | 40%+ |

## Founder-Led Outreach Template

```text
Hey {name}, saw you recruit for {niche/role}.

I am building Hirelix for technical recruiters: paste a live role, get a client-ready shortlist with fit reasoning, usable evidence, risks to verify, and outreach angles.

Not asking you to watch a demo. If you send me one hard technical role, I will run it and return 10-15 candidates. The bar is simple: at least 3-5 people you would actually contact.

Useful?
```

## Decision Rule

Keep building if recruiters use the shortlist to contact and submit candidates.

Pause and reposition if users only say the results are "interesting" but do not contact candidates, submit candidates, or run a second real search.
