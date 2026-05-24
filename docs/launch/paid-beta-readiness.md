# Paid Beta Readiness

This checklist is for the Hirelix paid launch.

## Product promise

- Users can sign in, paste a real JD, and get a shortlist without manual ops.
- Paid users can self-serve billing through Paddle and see plan state update in-product.
- Search stays Bright-first, with provisional and final shortlist stages visible in the UI.
- Support runs through `support@hirelix.online`.

## Production verification

### Search pipeline

- Verify `/api/internal/search-jobs/run` is reachable with the service role bearer token.
- Confirm queued searches move through `queued -> parsing -> searching/screening -> deep_scoring -> done`.
- Confirm phase 2 resumes correctly after polling delays and does not hide the phase 1 shortlist.
- Confirm retry from the search detail page clears old candidates and re-enqueues the job.

### Billing

- Verified Paddle production client token and price IDs are configured in Vercel Production.
- Real `$1` Paddle test payment completed and reached production webhook event storage.
- Verified non-test Search Pack entitlement handling with a signed production webhook smoke event:
  - event ID `evt_prod_smoke_1779637232507`
  - production webhook returned HTTP `200`
  - production DB temporarily showed `extra_search_credits = 3`
  - temporary rows were cleaned up and rechecked.
- Verified Solo monthly subscription entitlement handling with a signed production webhook smoke event:
  - event ID `evt_prod_smoke_sub_1779637326284`
  - production webhook returned HTTP `200`
  - production DB temporarily showed `subscription_plan = starter_monthly`, `subscription_status = active`, `billing_cycle = month`, and renew date `2026-06-24 15:45:00+00`
  - temporary rows were cleaned up and rechecked.
- Normal paid webhook processing updates subscription plan, credits, and renew dates at the production webhook/API/DB layer.
- Verified duplicate webhook delivery is ignored safely:
  - event ID `evt_prod_smoke_dup_1779637820401`
  - first delivery returned `{"ok":true}`
  - second delivery returned `{"ok":true,"duplicate":true}`
  - production DB temporarily showed one event row and `extra_search_credits = 3`, not `6`
  - temporary rows were cleaned up and rechecked.
- Still not performed: real paid monthly checkout with a `$149+` card charge.
- Still not performed: real paid annual checkout with a `$1,428+` card charge.
- Still not performed: real paid Contact Pack checkout with a `$49` card charge.

### UX and messaging

- Landing page matches the current public positioning and pricing copy.
- Settings page shows support guidance and billing escalation path.
- Search creation and results pages match the current public positioning.
- Refund, privacy, terms, and contact pages are linked and reachable.

## Observability checks

- Search logs show provisional-ready latency and final-ready latency.
- Search metadata records:
  - `execution_profile`
  - `search_phase`
  - `result_stage`
  - `bright_snapshot_cost`
  - `bright_profiles_requested`
  - `bright_profiles_returned`
  - `estimated_llm_cost`
  - `estimated_search_total_cost`
- Paddle webhook logs show processed, duplicate, invalid-signature, and failed events.

## Rollout order

1. Internal production-like smoke pass.
2. Small design-partner cohort with live billing.
3. Short public paid-beta window with controlled traffic.
4. Broader rollout only after search reliability and billing incidents stay stable.

## Launch guardrails

- Any paid-user billing issue is a `P0`.
- Search creation failures or widespread stuck jobs are a `P0`.
- Partial search completion is not an acceptable launch state; unresolved core-chain failures must end as `error` and be fixed at the root.
- If shortlist quality on strict-location roles regresses after raising `bright_production_full` recall to `200+100+100`, revert before widening traffic.
