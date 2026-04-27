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
- Confirm queued searches move through `queued -> parsing -> searching/screening -> deep_scoring -> done/degraded`.
- Confirm phase 2 resumes correctly after polling delays and does not hide the phase 1 shortlist.
- Confirm retry from the search detail page clears old candidates and re-enqueues the job.

### Billing

- Verify Paddle production client token and price IDs are configured.
- Test monthly checkout end-to-end.
- Test annual checkout end-to-end.
- Test search pack checkout end-to-end.
- Test contact pack checkout end-to-end.
- Verify webhook processing updates subscription plan, credits, and renew dates.
- Verify duplicate webhook delivery is ignored safely.

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
- `degraded` searches are acceptable only when the shortlist remains reviewable and the retry path works.
- If shortlist quality on strict-location roles regresses after raising `bright_production_full` recall to `200+100+100`, revert before widening traffic.
