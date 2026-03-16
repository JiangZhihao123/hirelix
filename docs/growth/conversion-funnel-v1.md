# Hirelix Conversion Funnel v1

This document defines the first-pass event taxonomy and experiment shape for Hirelix conversion work across landing, activation, and early upgrade intent.

## Goal

Optimize the funnel from:

- `landing view`
- `signup`
- `first search`
- `results view`
- `upgrade intent`

The current focus is no longer just `visit -> signup`; it now extends through the first in-product value moment.

## Event Taxonomy

All events should carry these shared attributes where available:

- `device_type`
- `traffic_source`
- `utm_campaign`
- `page_variant`
- `intent_path`
- `signin_surface` for sign-in views when applicable
- `plan_code` for authenticated product events when applicable
- `search_status` for search/detail events when applicable
- `search_count` for workspace events when applicable
- `has_candidates` when a results surface is involved
- `has_email_candidates` when a results surface is involved

### Landing events

- `landing_view`: the landing page rendered with a specific experiment assignment
- `hero_primary_cta_click`: the desktop primary CTA was used
- `sample_cta_click`: the sample path was selected
- `hero_jd_input_start`: the user started typing into the JD field
- `hero_jd_submit_attempt`: the user submitted a valid JD from the hero form

### Auth and activation events

- `signin_view`: the auth surface was shown, either as the landing modal or a product fallback page
- `email_otp_requested`: the user requested an email OTP code
- `email_otp_verified`: the user successfully verified an email OTP code
- `email_otp_failed`: email OTP request or verification failed
- `signup_success`: reserved for identifying first-time OTP sign-ins if we need that cut later
- `new_search_view`: the authenticated new-search screen loaded
- `search_create_success`: a new search was created successfully

### Product activation events

- `dashboard_view`: the authenticated workspace dashboard rendered
- `dashboard_primary_context_shown`: the dashboard showed the current primary task context
- `primary_product_cta_click`: the user clicked the main in-product CTA for the current task
- `search_processing_view`: a search detail page rendered in processing state
- `search_results_view`: a search detail page rendered with completed candidates
- `candidate_expand`: the user expanded a candidate card
- `upgrade_cta_click`: the user clicked a product upgrade CTA or checkout trigger
- `retry_search_click`: the user retried a failed or stalled search

## Experiment Assignment

The landing page keeps the original experiment shape for attribution compatibility:

- headline: `speed` vs `results`
- CTA copy: `paste_jd` vs `find_candidates`
- proof order: `speed_first` vs `credibility_first`

The hero currently pins all visitors to the control baseline instead of randomly assigning variants.

The combined string is stored as `page_variant`, for example:

`headline_speed__cta_find_candidates__proof_speed_first`

## Intent Paths

- `direct_jd`: the user brought their own JD
- `sample`: the user chose the sample role flow
- `signin`: the user skipped to auth directly
- `unknown`: fallback when attribution is missing

## Sign-in Surfaces

- `landing_modal`: auth opened on the landing page for `direct_jd`, `sample`, or generic `signin` intent
- `product_page`: auth fallback shown after directly visiting a protected product route
