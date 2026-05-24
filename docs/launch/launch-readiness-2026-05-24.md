# Hirelix launch readiness check

Date: 2026-05-24

## Current readiness

Hirelix is publicly reachable, has a visible pricing surface, and has a real logged-in product workspace with billing settings visible for the test account.

## Production checks completed

### Public landing page

Evidence:

- `curl -I https://hirelix.online` returned `HTTP/2 200`.
- Playwright opened `https://hirelix.online`.
- Page title: `Hirelix - Evidence-Backed Technical Shortlists`.
- Landing page shows:
  - independent technical headhunter positioning
  - sample shortlist preview
  - Free, Solo, and Pro Annual pricing
  - Search Pack and Contact Pack add-ons
  - Billing FAQ and refund copy
  - no-credit-card start messaging

Artifact:

- `docs/launch/production-smoke-landing-text-2026-05-24.txt`

### Product workspace

Evidence:

- `curl -I https://hirelix.online/app` returned `HTTP/2 200`.
- Playwright opened `https://hirelix.online/app` with an existing authenticated session.
- Workspace showed account `noahjiang2@gmail.com`.
- Workspace showed at least one real completed shortlist:
  - `Senior Backend Engineer`
  - ready to review
  - 10 candidates

### Billing settings

Evidence:

- Playwright opened `https://hirelix.online/app/settings#billing` with the same authenticated session.
- Settings page showed current account state:
  - Free plan
  - shortlist builds `1/1`
  - contact unlocks `0/5`
  - client handoff locked
- Settings page showed paid plan CTAs:
  - Start Solo
  - Start annual Solo
  - Start Pro
  - Start annual Pro
  - Upgrade to Business
  - Contact us for Agency
- Settings page showed paid add-ons:
  - Search Pack, $49
  - Contact Pack, $49

Artifact:

- `docs/launch/production-smoke-settings-billing-text-2026-05-24.txt`

## Removed test payment check

The production landing text did not contain:

- `$1`
- `test payment`
- `Payment smoke`
- `Run $1`
- `PADDLE_TEST`
- `TEST_PAYMENT`

## Notes and remaining gaps

- The settings page confirms paid entry points are visible. I did not click paid checkout CTAs in this pass to avoid creating external Paddle checkout sessions during a smoke check.
- A direct `HEAD` request to `/api/auth/session` returned `404` while matching `/api/auth/[...all]`; this appears to be a route-path mismatch for that specific probe, not evidence that browser auth is broken, because the authenticated `/app` and `/app/settings#billing` pages loaded successfully.
- Playwright recorded one Google/DoubleClick analytics collection connection error on the public landing page. This is non-core for product and billing, but it may affect launch analytics completeness.

## Go-to-market assets completed

- LinkedIn prospect tracker: `docs/growth/linkedin-outreach-2026-05-24.csv`
- LinkedIn send queue: `docs/growth/linkedin-send-queue-2026-05-24.md`
- LinkedIn profile update package: `docs/growth/linkedin-profile-update-package-2026-05-24.md`
- LinkedIn response playbook: `docs/growth/linkedin-response-playbook-2026-05-24.md`
- Customer discovery call script: `docs/growth/customer-discovery-call-script-2026-05-24.md`
- One-page sales note: `docs/marketing/hirelix-one-page-sales-note-2026-05-24.md`

## Next external-action step

After action-time confirmation, update the LinkedIn profile and send the first batch of connection requests from `docs/growth/linkedin-send-queue-2026-05-24.md`.

