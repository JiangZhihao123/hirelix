# Hirelix Conversion Funnel v1

This document defines the first-pass event taxonomy and experiment shape for Hirelix conversion work.

## Goal

Optimize the funnel from:

- `landing view`
- `signup`
- `first search`

The current focus is `visit -> signup`, not pricing or checkout optimization.

## Event Taxonomy

All events should carry these shared attributes where available:

- `device_type`
- `traffic_source`
- `utm_campaign`
- `page_variant`
- `intent_path`

### Landing events

- `landing_view`: the landing page rendered with a specific experiment assignment
- `hero_primary_cta_click`: the desktop primary CTA was used
- `sample_cta_click`: the sample path was selected
- `hero_jd_input_start`: the user started typing into the JD field
- `hero_jd_submit_attempt`: the user submitted a valid JD from the hero form

### Auth and activation events

- `signin_view`: the auth gate was shown on a product route
- `signup_success`: email signup succeeded and confirmation flow started
- `new_search_view`: the authenticated new-search screen loaded
- `search_create_success`: a new search was created successfully

## Experiment Assignment

The landing page currently supports three lightweight experiments:

- headline: `speed` vs `results`
- CTA copy: `paste_jd` vs `find_candidates`
- proof order: `speed_first` vs `credibility_first`

The combined string is stored as `page_variant`, for example:

`headline_speed__cta_paste_jd__proof_speed_first`

## Intent Paths

- `direct_jd`: the user brought their own JD
- `sample`: the user chose the sample role flow
- `signin`: the user skipped to auth directly
- `unknown`: fallback when attribution is missing
