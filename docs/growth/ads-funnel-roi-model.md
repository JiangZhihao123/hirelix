# Hirelix Ads Funnel, Psychology, and ROI Model

This document translates Hirelix's current landing + product funnel into a paid-acquisition model for high-intent search traffic.

## Summary

Assumptions used in this model:

- Traffic source: high-intent search ads
- CPC: `$1`
- Primary paid product: `Pro Monthly` at `$99`
- ROI lens: first-month payback
- Goal: understand whether current conversion design can support paid growth

Current conclusion:

- The funnel is better than before, but it is **not yet at "extreme conversion" quality**
- First-month click-to-paid break-even is about `1.01%` before delivery costs
- A safer real-world threshold is closer to `1.3% - 1.6%` click-to-paid once API and delivery costs are considered
- Current estimated click-to-paid range is `0.4% - 0.9%`
- This likely means paid search at `$1 CPC` is **not yet reliably profitable**
- A realistic near-term target is `1.2% - 2.0%` click-to-paid

## Funnel Stages and User Psychology

### 1. Ad Click -> Landing

User questions:

- Is this exactly what I was looking for?
- Will this actually get me candidates faster?
- Is this a real product or just an AI wrapper?

Current judgment:

- The landing page now sells outcome better than before
- It still leans slightly product-showcase over pure sales-page intensity

Expected range for high-intent traffic:

- `Landing -> Auth Intent`: `12% - 22%`

Current estimate:

- `15% - 18%`

### 2. Landing -> Auth

User questions:

- Am I willing to take one more step?
- Am I about to be trapped in signup or billing friction?

Current judgment:

- Google + email OTP is the right direction
- Same-page auth modal reduces friction materially
- This is no longer the primary bottleneck

Expected range:

- `Auth Open -> Auth Success`: `70% - 88%`

Current estimate:

- `75% - 85%`

### 3. Auth Success -> First Search

User questions:

- What am I supposed to do right now?
- Is this worth using one of my free searches?
- Am I about to waste time?

Current judgment:

- This is one of the two biggest funnel breakpoints
- New Search is better than before, but the product still leans a bit too much toward "workspace" over "next best action"

Expected range:

- `Auth Success -> First Valid Search`: `60% - 80%`

Current estimate:

- `55% - 70%`

### 4. First Search -> Results Viewed

User questions:

- Will this really return results?
- Will it hang or fail?
- Is waiting worth it?

Current judgment:

- Processing, stalled, and retry handling is better than before
- Reliability perception remains a meaningful weakness because long-running work is not on a fully separate worker model

Expected range:

- `First Search -> Results Viewed`: `75% - 92%`

Current estimate:

- `70% - 85%`

### 5. Results Viewed -> Upgrade Intent

User questions:

- Is this shortlist actually valuable?
- Have I already seen the core value?
- Is the paid unlock exactly what I need next?

Current judgment:

- This is the second biggest funnel breakpoint
- Results pages now move in the right direction: value first, upgrade second
- Upgrade psychology is still not sharp enough

Expected range:

- `Results Viewed -> Upgrade Click`: `18% - 40%`

Current estimate:

- `18% - 30%`

### 6. Upgrade Intent -> Paid

User questions:

- Is this worth paying for right now?
- Should I try more first?
- Is monthly low-risk enough?

Current judgment:

- Monthly should remain the primary in-product plan
- Annual should stay secondary and live more strongly in billing/settings

Expected range:

- `Upgrade Click -> Paid`: `25% - 45%`

Current estimate:

- `25% - 35%`

## ROI Model

### Break-even

With:

- `CPC = $1`
- `Pro Monthly = $99`

Raw first-month break-even:

- `1 / 99 = 1.01% click-to-paid`

If cost of delivery is included:

- At `80%` first-month contribution margin:
  - contribution per paid user ≈ `$79.2`
  - break-even ≈ `1.26% click-to-paid`
- At `70%` first-month contribution margin:
  - contribution per paid user ≈ `$69.3`
  - break-even ≈ `1.44% click-to-paid`

Practical target:

- `1.3% - 1.5% click-to-paid`

### Current-State Model

Working model:

- Landing -> Auth Intent: `16%`
- Auth Success: `80%`
- First Search: `65%`
- Results Viewed: `80%`
- Upgrade Click: `24%`
- Paid: `30%`

Result:

- `0.16 * 0.80 * 0.65 * 0.80 * 0.24 * 0.30 = 0.60% click-to-paid`

Implication per `1000 clicks`:

- Spend: `$1000`
- Paid users: `~6`
- First-month revenue: `~$594`
- Likely negative ad ROI

With `80%` contribution margin:

- First-month contribution: `~$475`
- Still clearly negative on first-month payback

### Stronger Future-State Model

Target model:

- Landing -> Auth Intent: `20%`
- Auth Success: `83%`
- First Search: `78%`
- Results Viewed: `88%`
- Upgrade Click: `32%`
- Paid: `33%`

Result:

- `1.44% click-to-paid`

Implication per `1000 clicks`:

- Spend: `$1000`
- Paid users: `~14.4`
- First-month revenue: `~$1426`
- Paid search becomes positive at the revenue layer

With `80%` contribution margin:

- Contribution: `~$1141`
- Contribution profit: `~$141`

## Current Funnel Diagnosis

The current funnel is not yet "extreme conversion" for four reasons:

1. Login-to-product handoff is still not always a single unquestionable next step.
2. The bridge from "I saw shortlist value" to "I should pay now" is improving, but still not sharp.
3. The free plan may be too generous for first-month paid acquisition economics.
4. Reliability perception still damages trust when processing feels odd, stalled, or ambiguous.

## Most Important Optimization Directions

### 1. Make the first in-product action singular

- Dashboard should feel like "the next best move," not a workspace directory
- Users should not need to decide between retry, review, resume, and new search without strong guidance

### 2. Strengthen the first shortlist aha moment

- Results pages should immediately answer:
  - was this search worth it?
  - what should I do next?
  - what unlock is worth paying for?

### 3. Sell upgrade as capability unlock, not interruption

- Better framing:
  - unlock contact details and outreach
  - export this shortlist
  - keep sourcing this month

### 4. Re-evaluate the free-plan economics

If the goal is first-month payback on `$1 CPC` search traffic, test:

- `1 free search`
- or `1 free shortlist + paid unlocks for more candidates/export/contact`

instead of assuming `3 free searches` is optimal.

## Recommended Metrics to Watch

North-star metrics for paid search:

- `click -> paid`
- `auth success -> first valid search`
- `results viewed -> upgrade click`

Supporting cuts:

- by intent path
- by device type
- by plan exposure
- by stalled/error rate

## Assumptions

- Uses `Pro Monthly` as the primary monetization model
- Does not include annual, add-ons, refunds, taxes, labor, or fixed overhead in the primary model
- Uses conservative SaaS first-month payback framing
- Treats current estimates as directional until backed by live funnel data
