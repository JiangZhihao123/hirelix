# LinkedIn cold-start metrics

Date: 2026-05-24

Use this to judge whether the first outbound batch is producing useful market signal.

## Batch 1 target

- Send 10-16 connection requests.
- Keep the audience narrow: technical recruiters, technical sourcers, boutique search founders, and AI/software recruiting operators.
- Stop early if LinkedIn shows account warnings, CAPTCHA, rate limits, or unusually low acceptance.

## 2026-05-24 launch state

- LinkedIn founder profile is now English-first and includes Hirelix banner, About, founder/builder experience, English public URL, and Featured website link.
- Confirmed profile URL: `https://www.linkedin.com/in/noah-jiang-b4b7922a7/`.
- First personalized connection requests sent: Rameet Singh, Lexi Lewtan, and Brian K. Williams.
- Personalized invite quota appeared exhausted after Brian K. Williams, so the next step is to wait for accepts or quota reset before more personalized requests.

## Metrics

Track these daily for 7 days after sending.

| Metric | Definition | Useful early signal |
|---|---|---|
| Connection acceptance rate | accepted / sent | 25%+ |
| Reply rate | replies / accepted | 20%+ |
| Interested reply rate | interested replies / sent | 5%+ |
| Demo or feedback asks | calls or async reviews requested | 1+ from first batch |
| Trial intent | asks for link, tries product, or offers role | 1+ from first batch |
| Negative fit | not-fit replies / replies | Use for ICP filtering |

## Status mapping

Use `docs/growth/linkedin-outreach-2026-05-24.csv`.

| Status | Meaning |
|---|---|
| `ready_to_send` | Profile and note are prepared |
| `connection_sent` | Connection request sent |
| `accepted` | Connection accepted, no DM yet |
| `dm_sent` | First DM sent |
| `replied_interested` | Reply shows curiosity or asks a question |
| `overview_sent` | Short written overview sent |
| `link_sent` | Product link sent |
| `meeting_requested` | Call or async review requested |
| `call_completed` | Feedback call completed |
| `trial_requested` | Prospect wants to try on a real role |
| `paid_intent` | Prospect asks about paying, plan, invoice, or serious purchase timing |
| `not_fit` | Explicitly not relevant |
| `followed_up` | Follow-up sent |
| `blocked_by_linkedin` | LinkedIn warning/rate limit/CAPTCHA/platform friction |

## Daily review

Ask:

- Which titles accepted or replied fastest?
- Did founders, sourcers, or in-house recruiters engage more?
- Did the "evidence-backed shortlist" wording resonate?
- Did anyone object to data source, candidate trust, pricing, or workflow?
- Are replies asking for demo, link, pricing, or proof of candidate quality?

## Decision rules

If connection acceptance is under 15%:

- Reduce batch size.
- Lead with a more specific profile-based note.
- Prioritize recruiters with recent public activity.

If replies are polite but not interested:

- Make the ask more concrete: one real software engineering role, 10 minutes, blunt feedback.
- Avoid broad "AI recruiting tool" language.

If replies ask for proof or screenshots:

- Use `docs/growth/hirelix-demo-script-2026-05-24.md`.
- Send `https://hirelix.online` plus one sentence about free preview before paid actions.

If a prospect has an active role:

- Move to `trial_requested`.
- Ask for the role type and must-have skills.
- Encourage the free preview first; do not push payment before value is visible.
