# Hirelix launch readiness check

Date: 2026-05-24

## Current readiness

Hirelix is publicly reachable, has a visible pricing surface, and has a real logged-in product workspace with billing settings visible for the test account.

## Production checks completed

### Public landing page

Evidence:

- `curl -I https://hirelix.online` returned `HTTP/2 200`.
- Playwright opened `https://hirelix.online`.
- Page title: `Hirelix — Evidence-Backed Technical Shortlists`.
- Landing page shows:
  - independent technical headhunter positioning
  - sample shortlist preview
  - Free, Solo, and Pro Annual pricing
  - Search Pack and Contact Pack add-ons
  - Billing FAQ and refund copy
  - no-credit-card start messaging

Artifact:

- `docs/launch/production-smoke-landing-text-2026-05-24.txt`

### SEO and social preview

Evidence:

- Production HTML includes:
  - `<title>Hirelix — Evidence-Backed Technical Shortlists</title>`
  - meta description for evidence-backed technical shortlists
  - canonical URL `https://hirelix.online`
  - Open Graph title, description, URL, site name, image, and image dimensions
  - Twitter summary large image card
- `https://hirelix.online/og-image.png` returned `HTTP/2 200` with `content-length: 63963`, matching the updated production OG asset.
- `https://hirelix.online/sitemap.xml` returned `HTTP/2 200` and lists the public marketing/legal pages.
- `https://hirelix.online/robots.txt` allows the public pages and disallows `/app/` and `/api/`.
- The OG image copy has been updated to the current truthful positioning:
  - `Evidence-backed technical shortlists`
  - `AI sourcing for technical recruiters`
  - `Role brief -> ranked profiles -> fit evidence -> outreach context`

### Product workspace

Evidence:

- `curl -I https://hirelix.online/app` returned `HTTP/2 200`.
- Playwright opened `https://hirelix.online/app` with an existing authenticated session.
- Workspace showed account `noahjiang2@gmail.com`.
- Workspace showed at least one real completed shortlist:
  - `Senior Backend Engineer`
  - ready to review
  - 10 candidates

### Shortlist detail page

Evidence:

- Playwright opened `https://hirelix.online/app/search/8450503e-3f1e-4efb-888d-25a27bc5d992` with the existing authenticated session.
- Page showed:
  - `Senior Backend Engineer`
  - `Shortlist complete`
  - `3 candidates to reach out to first`
  - `7 more to keep reviewing`
  - `150+ deeply reviewed`
  - candidate evidence and risk labels
  - client-ready shortlist section
  - outreach approval queue
  - LinkedIn copy and email copy actions
- Latest verification on 2026-05-24 confirmed this page still loads in the authenticated production session and shows candidate evidence, copy-ready outreach, status controls, and external LinkedIn profile links.

Artifact:

- `docs/launch/production-smoke-search-detail-text-2026-05-24.txt`

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
- Latest verification on 2026-05-24 confirmed the removed `$1` Paddle test item is not visible in the production billing UI.

Artifact:

- `docs/launch/production-smoke-settings-billing-text-2026-05-24.txt`

### Paddle payment and entitlement path

Evidence:

- The earlier real `$1` Paddle test payment completed and reached production webhook storage:
  - `transaction.created`
  - `transaction.updated`
  - `transaction.completed`
  - Paddle transaction: `txn_01ksc9xdeprwrx8gp19n4kga15`
  - Paddle price: `pri_01ksc66s8a6x6gkey0bz7ebxxf`
  - custom data: `purchase_type = test_payment`
- The `$1` test payment correctly did not change `hirelix_user_settings`, because `purchase_type = test_payment` is record-only by design.
- Production Vercel environment variables include `PADDLE_WEBHOOK_SECRET`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENV`, and all live plan/add-on price IDs.
- A signed production webhook smoke event for a non-test Search Pack completed with HTTP `200`:
  - temporary event ID: `evt_prod_smoke_1779637232507`
  - event type: `transaction.completed`
  - target user: `852c199d-3fc1-4543-bea5-34d2db7a54e3`
  - verified DB effect before cleanup: `extra_search_credits = 3`, `extra_enrich_credits = 0`
  - cleanup verified: temporary billing event rows remaining `0`, temporary settings rows remaining `0`
- A signed production webhook smoke event for a non-test Contact Pack completed with HTTP `200`:
  - temporary event ID: `evt_prod_smoke_contact_1779638414889`
  - event type: `transaction.completed`
  - target user: `852c199d-3fc1-4543-bea5-34d2db7a54e3`
  - verified DB effect before cleanup: `extra_search_credits = 0`, `extra_enrich_credits = 50`
  - cleanup verified: temporary billing event rows remaining `0`, temporary settings rows remaining `0`
- A signed production webhook smoke event for Solo monthly subscription completed with HTTP `200`:
  - temporary event ID: `evt_prod_smoke_sub_1779637326284`
  - event type: `subscription.created`
  - target user: `852c199d-3fc1-4543-bea5-34d2db7a54e3`
  - verified DB effect before cleanup: `subscription_plan = starter_monthly`, `subscription_status = active`, `billing_cycle = month`, subscription renews at `2026-06-24 15:45:00+00`
  - cleanup verified: temporary billing event rows remaining `0`, temporary settings rows remaining `0`
- Duplicate delivery was verified with a signed production webhook smoke event:
  - temporary event ID: `evt_prod_smoke_dup_1779637820401`
  - first delivery returned HTTP `200` with `{"ok":true}`
  - second delivery returned HTTP `200` with `{"ok":true,"duplicate":true}`
  - verified DB effect before cleanup: one billing event row and `extra_search_credits = 3`, not `6`
  - cleanup verified: temporary billing event rows remaining `0`, temporary settings rows remaining `0`

Interpretation:

- Real Paddle-to-production webhook delivery is proven by the completed `$1` payment.
- Normal paid plan, Search Pack, and Contact Pack entitlement handling is proven at the production webhook/API/DB layer by signed production smoke events.
- Duplicate Paddle deliveries are ignored without double-crediting.
- A real paid Solo or Pro card charge has not been performed yet.

## Removed test payment check

The production landing text did not contain:

- `$1`
- `test payment`
- `Payment smoke`
- `Run $1`
- `PADDLE_TEST`
- `TEST_PAYMENT`

## Notes and remaining gaps

- The settings page confirms paid entry points are visible. Normal paid entitlement handling has now been verified through signed production webhook smoke events, but not through an actual `$149+` customer card charge.
- A direct `HEAD` request to `/api/auth/session` returned `404` while matching `/api/auth/[...all]`; this appears to be a route-path mismatch for that specific probe, not evidence that browser auth is broken, because the authenticated `/app` and `/app/settings#billing` pages loaded successfully.
- Playwright recorded one Google/DoubleClick analytics collection connection error on the public landing page. This is non-core for product and billing, but it may affect launch analytics completeness.

## Go-to-market assets completed

- LinkedIn prospect tracker: `docs/growth/linkedin-outreach-2026-05-24.csv`
- LinkedIn send queue: `docs/growth/linkedin-send-queue-2026-05-24.md`
- LinkedIn profile update package: `docs/growth/linkedin-profile-update-package-2026-05-24.md`
- LinkedIn response playbook: `docs/growth/linkedin-response-playbook-2026-05-24.md`
- Customer discovery call script: `docs/growth/customer-discovery-call-script-2026-05-24.md`
- Product demo script: `docs/growth/hirelix-demo-script-2026-05-24.md`
- One-page sales note: `docs/marketing/hirelix-one-page-sales-note-2026-05-24.md`

## Next external-action step

Check whether any of the first three LinkedIn connection requests have been accepted. If accepted, send the first DM from the response playbook. If none have accepted and personalized invite quota is still exhausted, expand the ICP queue and wait for quota reset rather than sending no-note invites by default.
