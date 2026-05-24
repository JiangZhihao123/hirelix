# Hirelix customer discovery call script

Date: 2026-05-24

Use this for first LinkedIn feedback calls with technical recruiters, independent headhunters, boutique search founders, and startup talent partners.

## Goal

Learn whether Hirelix solves a painful enough sourcing workflow to justify paid use. Do not sell too early. Validate the workflow, pricing, trust requirements, and buying trigger.

## 10 minute structure

### 0:00 - 1:00 Opening

```text
Thanks for taking a few minutes. I am building Hirelix, an early AI sourcing tool for technical recruiters. I would love blunt feedback more than politeness.

The narrow question I am trying to answer is: would an evidence-backed shortlist save enough sourcing time to be worth paying for?
```

### 1:00 - 4:00 Workflow discovery

Ask:

- What kind of technical roles are you sourcing most often right now?
- When a new role lands, what is the first 30 minutes of sourcing usually like?
- Where does the process feel slow, noisy, or repetitive?
- How do you decide a passive software candidate is worth first outreach?
- What evidence do you need before you trust a shortlist?

Listen for:

- Manual LinkedIn profile review taking hours.
- Boolean search fatigue.
- Difficulty explaining candidate fit to clients.
- Outreach drafts taking longer than expected.
- Recruiters caring about fit reasons, risk flags, or GitHub/technical evidence.

### 4:00 - 7:00 Product walkthrough

Show:

1. Landing page positioning: `https://hirelix.online`
2. Role brief input.
3. Ranked shortlist preview.
4. Fit evidence and risks.
5. Outreach-ready context.
6. Pricing: Free preview, Solo, Pro Annual, Search Pack, Contact Pack.

Say:

```text
The product is intentionally narrow at first: paste a real client role, get a ranked shortlist of real LinkedIn profiles, review fit evidence and risks, then unlock contact/export actions only if the shortlist is worth working.
```

### 7:00 - 9:00 Pricing and buying signal

Ask:

- If this worked on one of your current roles, what would make it useful enough to keep using?
- Would you expect to pay per role, monthly, or only after a shortlist is useful?
- Does $149/month for Solo feel too high, too low, or roughly right for this workflow?
- Would one-time search/contact packs be useful in heavy sourcing weeks?
- What would block you from trying it on a real role?

Listen for:

- "I would try it if I can see results before paying."
- "I need CSV export or client-ready briefs."
- "I care about candidate quality more than volume."
- "I need to know where the profiles come from."
- "I would pay if it saves X hours per role."

### 9:00 - 10:00 Close

```text
This is very helpful. Would you be open to trying it on one real role and telling me whether the shortlist is useful?

If yes, I can send the link and you can start with the free preview. If it produces something worth acting on, the paid actions are there; if not, I still learn what to fix.
```

## Scoring after each call

Score each conversation from 1 to 5:

- Pain intensity: how painful is sourcing/review today?
- Frequency: how often do they source software engineers?
- Trust fit: do they value fit evidence and risk flags?
- Willingness to try: will they run a real role?
- Willingness to pay: can they imagine paying now?

Strong early customer signal:

- Total score >= 18/25.
- They have an active technical role.
- They ask for the link, pricing, export, or how candidate discovery works.
- They are willing to test on a real role within 7 days.

## Tracker updates

Use `docs/growth/linkedin-outreach-2026-05-24.csv`.

Recommended statuses:

- `connection_sent`
- `dm_sent`
- `replied_interested`
- `link_sent`
- `meeting_requested`
- `call_completed`
- `trial_requested`
- `paid_intent`
- `not_fit`
- `followed_up`

Put call notes in `notes`, including:

- active role type
- biggest pain
- requested feature
- pricing reaction
- next action

