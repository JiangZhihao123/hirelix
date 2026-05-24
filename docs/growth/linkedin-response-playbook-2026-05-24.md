# LinkedIn response playbook

Date: 2026-05-24

Use this after Batch 1 connection requests or DMs start receiving replies.

## If they accept the connection

```text
Hi {firstName}, thanks for connecting. I am building Hirelix, an early AI sourcing tool for technical recruiters working on software engineering roles.

It turns a role brief into an evidence-backed shortlist with technical signals and outreach context. I am speaking with a few recruiters to learn where sourcing still feels slow or noisy.

Would you be open to a quick look or a 10 min feedback chat?
```

Tracker update:

- `status`: `dm_sent`
- `message_type`: `first_dm`
- `next_follow_up`: 4-6 days later

## If they ask what Hirelix does

```text
Short version: Hirelix helps a recruiter turn a role brief into a ranked shortlist of real technical profiles, with concise fit evidence, risks to verify, and outreach context.

I am keeping it narrow at first: independent technical recruiters and small search teams sourcing software engineers.
```

Tracker update:

- `status`: `replied_interested`
- Add their question to `notes`

## If they ask for a link

```text
Here it is: https://hirelix.online

The public page shows the workflow and pricing. I would especially value feedback on whether the shortlist evidence is useful enough for a recruiter to trust before spending time on outreach.
```

Tracker update:

- `status`: `link_sent`
- Add whether they asked for product, pricing, or demo context to `notes`

## If they agree to a chat

```text
Great, thank you. What usually works better for you, a quick 10 min screen share or async feedback after looking at the workflow?
```

Tracker update:

- `status`: `meeting_requested`
- Add availability or preferred format to `notes`
- Use `docs/growth/customer-discovery-call-script-2026-05-24.md` for the call.

## If they are not a fit

```text
No worries at all, thanks for replying. If you know a technical recruiter who sources software engineers and likes trying early tools, I would be grateful for a pointer.
```

Tracker update:

- `status`: `not_fit`
- Add reason to `notes`

## Follow-up when no reply

Send 4-6 days after the first DM:

```text
Hi {firstName}, quick follow-up in case this got buried. I am mainly trying to learn how technical recruiters evaluate passive software candidates today, and whether an evidence-backed shortlist would be useful.

Open to a short feedback chat next week?
```

Tracker update:

- `status`: `followed_up`
- `next_follow_up`: blank unless a second follow-up is intentionally planned

## If they want a short written overview

Send:

```text
Here is the short version:

Hirelix helps independent technical recruiters turn a role brief into an evidence-backed shortlist of real technical profiles, with fit reasons, risks to verify, and outreach-ready context.

The first use case is simple: test it on one real software engineering role and see whether the shortlist evidence is useful enough to trust.

Link: https://hirelix.online
```

Tracker update:

- `status`: `overview_sent`
- Add whether they asked about pricing, data sources, or workflow to `notes`
