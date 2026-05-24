# Production smoke check

Date: 2026-05-24

Target: https://hirelix.online

## Result

Production landing page is reachable and presents the current go-to-market surface for independent technical headhunters.

## Evidence

- `curl -I https://hirelix.online` returned `HTTP/2 200`.
- Playwright opened the production page successfully.
- Page title: `Hirelix - Evidence-Backed Technical Shortlists`.
- Public landing page includes:
  - Hero positioning for independent technical headhunters.
  - Sample shortlist preview.
  - Pricing section with Free, Solo, and Pro Annual plans.
  - One-time Search Pack and Contact Pack add-ons.
  - Billing FAQ and refund policy summary.
  - No-credit-card start messaging.
- Text snapshot: `docs/launch/production-smoke-landing-text-2026-05-24.txt`.

## Checked For Removed Test Payment

No production landing page text matched:

- `$1`
- `test payment`
- `Payment smoke`
- `Run $1`
- `PADDLE_TEST`
- `TEST_PAYMENT`

## Observed Non-Core Issue

Playwright recorded one console error from a Google/DoubleClick analytics collection request:

```text
Failed to load resource: net::ERR_CONNECTION_CLOSED @ https://stats.g.doubleclick.net/g/collect...
```

This is not evidence of a core product or billing failure, but it is worth monitoring if analytics coverage matters for launch reporting.

