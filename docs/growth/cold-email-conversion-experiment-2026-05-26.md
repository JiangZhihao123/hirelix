# Hirelix cold email conversion experiment

Date: 2026-05-26

## Goal

Move the next cold email batch from curiosity clicks to verified conversion signals:

- Real reply.
- 10 minute feedback chat.
- Real JD preview request.

Do not optimize for raw clicks. A click only counts when it leads to an engaged landing session, a reply, a booked feedback call, or a real JD preview request.

## Current read

The 2026-05-25 cold email batch produced interest but not conversion:

| Metric | Result |
| --- | ---: |
| Sent | 50 |
| Delivery checked | 32 |
| Delivered | 27 |
| Bounced | 4 |
| Qualified unique clickers | 8 |
| Engaged cold-email accounts | 5 |
| Sample views | 1 |
| Sign-in views | 1 |
| Pricing selects | 1 |
| New users after send | 0 |
| Searches created after send | 0 |

Interpretation:

- There is enough interest to continue small-batch testing.
- Bounce is too high to scale.
- Public inboxes create more engagement and more tracking noise.
- The first email asks for feedback, but the landing path does not yet force a concrete next step.

## Success criteria

Run only a small batch until these are true:

| Signal | Minimum target |
| --- | ---: |
| Bounce rate on checked sends | under 5% |
| Qualified unique click rate | 10%+ |
| Engaged account rate | 5%+ |
| Reply rate | 4%+ |
| JD preview request or feedback call | at least 1 per 25 sends |

Stop the batch if bounce exceeds 5% or if any spam complaint appears.

## Audience split

Use two small cells, not one mixed batch:

| Cell | Size | Recipient | Primary ask |
| --- | ---: | --- | --- |
| A | 10-12 | named founder / recruiting operator | Send one real JD for a small preview |
| B | 8-10 | public team inbox at highly relevant specialist firm | Forward to the person who owns sourcing workflow |

Rules:

- Prefer direct named business emails verified as deliverable.
- Public inboxes are allowed only when the firm is tightly technical and no direct operator email is verified.
- Suppress bounced addresses and companies from the previous batch unless a new verified direct address is found.
- Do not reuse generic emails from firms that bounced: Talhive `search@`, Harrington Starr `info@`, Expect `leah@`, We Are Eight `danny@`.

## Email A: direct operator

Subject options:

- Can I run one technical JD through Hirelix?
- Small preview for one hard engineering role?

Body:

```text
Hi {{first_name}},

I am building Hirelix for technical recruiters who need a credible first shortlist before spending hours reviewing profiles.

{{specific_context}}

Instead of asking for a generic demo, could I run one real software / AI / data role for you and send back a small preview?

You can judge whether the shortlist evidence is useful: fit reasons, risks to verify, and outreach context for each profile.

If you have a role handy, reply with the JD or even just the title + must-have skills. I will keep it small and send a preview back.

Best,
Noah

Noah Jiang
Founder, Hirelix
https://hirelix.online

If this is not relevant, reply "opt out" and I will not email again.
Mailing address: {{MAILING_ADDRESS_REQUIRED_BEFORE_SEND}}
```

## Email B: public inbox

Subject options:

- Who owns technical sourcing workflow?
- Quick question for your technical recruiting team

Body:

```text
Hi Team,

I am building Hirelix for specialist technical recruiting teams.

{{company}} looked relevant because {{specific_context}}.

Hirelix takes a client JD and returns a small evidence-backed shortlist: fit reasons, risks to verify, and outreach context a recruiter can edit before contacting candidates.

Could you forward this to whoever owns sourcing workflow or technical recruiting operations?

I would be glad to run one hard software / AI / data role as a small preview, then they can decide whether the shortlist is useful.

Best,
Noah

Noah Jiang
Founder, Hirelix
https://hirelix.online

If this is not relevant, reply "opt out" and I will not email again.
Mailing address: {{MAILING_ADDRESS_REQUIRED_BEFORE_SEND}}
```

## Follow-up sequence

Only follow up with delivered recipients that did not bounce and did not opt out.

### Clicked but no reply

Send after 2 business days:

```text
Hi {{first_name_or_team}},

I noticed you had a quick look at Hirelix. The easiest way to test it is not a demo: send one role title or JD, and I will run a small preview shortlist.

If the candidate evidence is not useful, I would rather learn that quickly.

Worth trying with one hard technical role?

Best,
Noah
```

### No click / no reply

Send after 4-5 business days:

```text
Hi {{first_name_or_team}},

Quick follow-up, then I will leave it here.

Hirelix is for technical recruiters who need to turn a client JD into a smaller evidence-backed shortlist, not another database to search manually.

If you have one software / AI / data role where profile review is painful, I can run a small preview and send it back.

Best,
Noah
```

## Landing path

Cold-email visitors should see a concrete next step before the generic product sections:

- Send a JD for preview.
- Book 10 min feedback.
- Reply by email.

Track each as a growth landing event:

- `preview_request_click`
- `preview_request_submit`
- `book_feedback_click`
- `reply_email_click`

## Measurement

Use these commands after sending:

```bash
node scripts/tools/report-growth-outreach-clicks.mjs --summary
node scripts/tools/report-growth-outreach-clicks.mjs --limit=50
set -a; source .env.local; set +a; node scripts/tools/report-growth-landing-events.mjs --summary
set -a; source .env.local; set +a; node scripts/tools/report-growth-landing-events.mjs --conversions
```

For the 2026-05-26 clicked-recipient follow-up batch, scope reports to the new email ids:

```bash
node scripts/tools/report-growth-outreach-clicks.mjs --summary --email-prefix=2026-05-26-followup-
set -a; source .env.local; set +a; node scripts/tools/report-growth-landing-events.mjs --summary --email-prefix=2026-05-26-followup-
set -a; source .env.local; set +a; node scripts/tools/report-growth-landing-events.mjs --conversions --email-prefix=2026-05-26-followup-
```

Count:

- Qualified clicks, not raw clicks.
- Unique email ids, not total repeated loads.
- `preview_request_submit` events as verified JD preview requests when the role snippet is real.
- Replies and feedback calls manually in the prospect CSV.

Do not count scanner traffic, malformed tracked URLs, static asset query variants, or smoke-test rows as conversion.

## Send gates

One-command preflight for the clicked-recipient follow-up batch:

```bash
node scripts/tools/preflight-growth-followup.mjs
```

Run these before any real send:

```bash
OUTREACH_LOG_PATH=docs/growth/cold-email-followup-send-log-2026-05-26.csv node scripts/tools/validate-growth-followup-batch.mjs docs/growth/cold-email-followup-clicked-2026-05-26.json
node scripts/tools/send-growth-email-batch.mjs --check-config
OUTREACH_LOG_PATH=docs/growth/cold-email-followup-send-log-2026-05-26.csv node scripts/tools/send-growth-email-batch.mjs docs/growth/cold-email-followup-clicked-2026-05-26.json --dry-run
```

Do not send unless all are true:

- Every follow-up recipient is eligible.
- `--check-config` reports all required outreach config as set.
- The postal address is a real physical address or registered mailbox, not the placeholder.
- The from address is not `notifications@hirelix.online`.

## Next batch checklist

- [ ] Pick 18-22 recipients across the two cells.
- [ ] Verify every direct email; public inboxes require a public website source.
- [ ] Remove previous bounces from the candidate set.
- [ ] Use the new preview-request CTA, not generic feedback-only CTA.
- [ ] Send no more than 25 in a day.
- [ ] Check delivery before any follow-up.
- [ ] Follow up only after delivery is confirmed.
