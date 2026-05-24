# Hirelix cold email outreach

Date: 2026-05-25

Use this when LinkedIn personalized invitations are unavailable or too slow.

## Position

Cold email is a viable B2B acquisition lane for Hirelix, especially for independent technical recruiters, boutique search founders, and in-house technical sourcers with public business emails.

The approach should stay small-batch and relevance-led. The goal is not volume; the goal is to get the first replies, feedback calls, and real-role trials without hurting the domain or brand.

## Compliance floor

For US recipients, treat every cold email as a commercial email and satisfy CAN-SPAM:

- Accurate `From`, `Reply-To`, domain, and sender identity.
- Subject line must match the email content.
- Clear commercial context.
- Valid physical postal address or registered mailbox.
- Clear opt-out line in every email.
- Honor opt-outs promptly and keep a suppression list.

For UK/EU-style B2B outreach, keep the recipient tightly role-relevant, prefer corporate/business addresses, record the business reason for contact, and provide an easy opt-out. Avoid sole traders and personal addresses unless consent or another clear lawful basis is available.

## Sender setup

Recommended sender:

- `noah@hirelix.online` or `founder@hirelix.online`
- Reply-to: same inbox, monitored daily.
- Do not send from the production notification address.

Before sending:

- Verify SPF, DKIM, and DMARC for `hirelix.online`.
- Add a plain-text unsubscribe/opt-out sentence.
- Add a real postal address or registered mailbox.
- Keep first batch under 20 emails/day.

## Lead sources

Use the existing LinkedIn tracker first:

- Prioritize rows with `ready_to_send`, `identified`, or `blocked_by_linkedin`.
- Prefer company domains with public team pages or public work emails.
- Use Hunter only to find or verify business emails; do not invent addresses without verification.
- Suppress anyone who opts out, replies negatively, or appears outside the technical recruiting ICP.

Initial targets:

- Boutique technical recruiting founders.
- Independent technical headhunters.
- Technical sourcers hiring software, AI, ML, robotics, infrastructure, or developer tooling roles.
- Recruiting operators who post publicly about sourcing quality, AI tools, or hard engineering roles.

## Email template A: feedback ask

Subject: Quick question on technical sourcing

Hi {{first_name}},

I am building Hirelix, an early AI sourcing tool for technical recruiters and independent headhunters.

It turns a role brief into an evidence-backed shortlist of real technical profiles, with fit reasons, risks to verify, and outreach-ready context.

Your work around {{specific_context}} looked relevant, so I wanted to ask: would you be open to giving blunt feedback on whether this would help with a real software or AI role?

No pitch deck. I can send the link or a short example first.

Best,
Noah

Noah Jiang
Founder, Hirelix
https://hirelix.online

If this is not relevant, reply "opt out" and I will not email again.

## Email template B: real-role trial

Subject: Evidence-backed shortlist for a hard tech role

Hi {{first_name}},

I noticed {{specific_context}} and thought this might be relevant.

I am building Hirelix for technical recruiters: paste a live role brief, get a ranked shortlist with technical fit evidence, risks to verify, and outreach context.

If you have one hard software, AI, ML, infra, or robotics role, I would be glad to run a small preview and get your honest read on whether the shortlist is useful.

Best,
Noah

Noah Jiang
Founder, Hirelix
https://hirelix.online

If this is not relevant, reply "opt out" and I will not email again.

## Operating rules

- Send manually or semi-manually until reply quality is proven.
- Personalize one line per recipient.
- Do not claim customers, funding, US team, or outcomes we do not have.
- Do not use tracking pixels in the first batch.
- Record every send in a CSV with status, source, exact email, and opt-out state.
- Stop if bounce rate exceeds 5%, spam complaints appear, or replies show poor fit.

## Next step

Create a 15-person email batch from the current LinkedIn tracker:

1. Confirm or find business email.
2. Verify deliverability.
3. Pick template A or B.
4. Add one specific context sentence.
5. Send no more than 15-20 in the first day.
6. Review replies before scaling.
