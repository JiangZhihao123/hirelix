# LinkedIn profile update package

Date: 2026-05-24

## Purpose

Make the founder profile credible before first outbound: clear product context, truthful early-stage positioning, and a clean branded banner.

## Current visible issues

Observed on the live LinkedIn profile:

- Display name is Chinese: `姜志豪`.
- Public URL includes Chinese characters: `linkedin.com/in/志豪-姜-b38635157`.
- Profile language is `Simplified Chinese`.
- Current company and school are shown in Chinese on the first screen.
- About is still missing.
- No profile photo.
- Banner is still generic.

These are not wrong, but they create the wrong first impression for an English-speaking technical recruiter ICP. The first viewport should read like an international-facing B2B SaaS founder profile.

## Display name

Recommended public name:

```text
Noah Jiang
```

Reasoning:

- The target audience is English-speaking technical recruiters and search founders.
- The first impression should read as an international B2B SaaS founder profile, not a China-local personal profile.
- This is still truthful because Noah is already the user's English working name in the local browser/account context.

## Public URL

Preferred vanity URL, if LinkedIn allows it:

```text
linkedin.com/in/noah-jiang-hirelix
```

Fallback options:

```text
linkedin.com/in/noah-jiang
linkedin.com/in/noah-zhihao-jiang
linkedin.com/in/zhihao-noah-jiang
```

Use whichever is available. The goal is to remove Chinese characters from the URL before outbound.

## Profile language

Preferred:

```text
English
```

If LinkedIn does not allow changing the primary language directly, add an English profile version and make all visible profile text English.

## Headline

```text
Building Hirelix | AI sourcing for technical recruiters | Software Engineer
```

Alternative if LinkedIn space or search wording needs tightening:

```text
Founder, Hirelix | AI sourcing for technical recruiters | Software Engineer
```

## About

```text
I'm building Hirelix, an AI sourcing tool for technical recruiters and independent headhunters.

Hirelix helps turn a role brief into an evidence-backed technical shortlist: candidate discovery, fit scoring, GitHub/technical signals, and outreach-ready context in one workflow.

I'm especially interested in talking with recruiters, founders, and boutique search teams who source software engineers and want a faster way to identify strong passive candidates without losing the reasoning behind each recommendation.

Previously/currently, I work as a software engineer in financial services, building production systems and AI-enabled tools.
```

## Experience

Add or prioritize this English entry if LinkedIn allows it:

```text
Founder / Builder
Hirelix
2026 - Present
Hong Kong / Remote

Building Hirelix, an AI sourcing product for technical recruiters and independent headhunters. Hirelix helps turn role briefs into evidence-backed technical shortlists with fit reasoning, public technical signals when available, and outreach-ready context.
```

Keep the existing financial-services software engineer role truthful, but prefer English display text where editable:

```text
Software Engineer
Financial services
```

Do not hide or falsify the real background. The goal is English-first positioning, not pretending to be a different person or company.

## Featured / website

Add a featured link if available:

```text
Hirelix - Evidence-backed technical shortlists
https://hirelix.online
```

Description:

```text
AI sourcing for technical recruiters and independent headhunters.
```

## Services

Only add services if LinkedIn offers a clear category that does not imply agency recruiting services. Prefer product/tooling wording:

```text
AI sourcing tools
Technical recruiting software
Recruiting workflow automation
```

Avoid wording that implies Noah personally provides recruiting placement services.

## Photo

Needed, but not solved yet:

- Use a real professional headshot if the user provides one.
- Do not use AI-generated identity photos for LinkedIn unless the user explicitly asks and reviews the result.
- Until a real photo exists, the banner and English profile copy still improve the first impression substantially.

## Profile language guidance

- Keep the profile name, headline, About, banner, and outbound messages in English.
- Avoid Chinese-first wording on the visible profile surface used for outbound.
- Do not imply Hirelix is a large US company, funded team, or already-proven customer success story.
- It is fine to position Hirelix as an international-facing early B2B SaaS product for technical recruiters.

## Background banner

Generated asset:

```text
docs/growth/hirelix-linkedin-banner-2026-05-24.png
```

Dimensions:

```text
1584x396 PNG
```

Banner text:

```text
Hirelix
Evidence-backed technical shortlists
AI sourcing for technical recruiters
Role brief -> ranked profiles -> fit evidence -> outreach context
```

## Execution order

1. Change display name to `Noah Jiang`.
2. Change or add English profile language.
3. Change public profile URL to an English vanity URL if available.
4. Save headline and About.
5. Add or prioritize the Hirelix founder/builder experience.
6. Add Featured website link to `https://hirelix.online`.
7. Upload the banner image.
8. Verify name, URL, language, headline, About, Featured, Experience, and banner on the public profile view.
9. Start Batch 1 from `docs/growth/linkedin-send-queue-2026-05-24.md`.
10. Record each action in `docs/growth/linkedin-outreach-2026-05-24.csv`.

## Guardrails

- Do not claim customers, revenue, funding, or proven hiring outcomes.
- Keep product wording as early-stage and feedback-oriented.
- Stop if LinkedIn shows warnings, CAPTCHA, account restriction prompts, or connection-request rate limits.
