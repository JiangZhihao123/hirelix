# Glimpse JD: Bright vs Serper Quality Comparison (2026-03-18)

## Test setup

- JD sample: `test-jd-glimpse-real.md`
- Goal: compare candidate quality for a real NYC onsite full-stack role
- Candidate target: 25 final candidates
- Retrieval target: 100 raw candidates
- Fallback: disabled for the comparison run

## Clean runs

### Bright-only

- Search ID: `4690f6cd-8543-4659-8eaa-ea34ed767984`
- Status: `done`
- Provider: `brightdata_dataset`
- Recall status: `ready`
- Dataset size: `100`
- Final candidates: `25`
- Avg score: `66.32`
- Max score: `100`
- Warning: none

Top candidates:

1. Sajid Ali — Senior Research Software Engineer — New York — score 100
2. Andrew H. — Software Engineer at JPMorgan Chase & Co. — Brooklyn — score 80
3. Justin Medoy — Full Stack Developer — Bronx — score 78
4. sathwika parshaboina — Full Stack / Backend / Node.js / Typescript — NYC metro — score 78
5. Sailesh Kaveti — Software Engineer II at Microsoft — Brooklyn — score 75

Observations:

- Top 10 are all Bright profiles with explicit NYC-area locations.
- Titles are tightly aligned with the role: software engineer / full stack / backend.
- Location filtering worked well for the onsite NYC requirement.

### Serper + Bright enrichment

- Search ID: `89c40775-95c4-46a2-907c-8eecafaa2ae5`
- Provider: `serper`
- Retrieval count: `100`
- Bright enrichment scraped profiles: `100`
- Deep review completed count: `37`
- Final candidates: `15`
- Avg score: `22.73`
- Max score: `63`
- Warning: none

Pipeline stats:

- Source-rule pass rate: `0.20`
- LLM prescreen pass rate: `0.04`
- Location gate blocked count: `63 / 100`
- Final shortlist count: `15`

Top candidates:

1. Bryan Owens — at Confida.ai — New York — score 63
2. Giga Gatenashvili — at Adaptive — Brooklyn — score 63
3. Felix Thea — at Stripe — New York — score 58
4. Yi-Ting Hsieh — at DEVA — New York — score 50
5. Stacey Lee — at The Knot Worldwide — Brooklyn — score 50

Observations:

- This run used the fair comparison path: Serper recall first, then Bright enrichment for all 100 LinkedIn URLs.
- The final shortlist is now composed of `brightdata` profiles with explicit NYC-area locations.
- Even after enrichment, the final quality is still materially lower than Bright direct recall.

## Decision

For this JD, **Bright is clearly better than Serper on candidate quality**, even after Serper gets a full Bright enrichment pass.

Why:

1. Bright returned a fully structured NYC-heavy profile set that matches the onsite constraint.
2. Bright's final shortlist scores are much stronger (`66.32` avg vs `22.73` avg).
3. Bright's top candidates look like real LinkedIn profiles already aligned to the role.
4. Serper's enriched shortlist is still thinner and weaker after hard filters, producing only `15` final candidates versus Bright's `25`.

## Important caveat

This comparison is now fair for final candidate quality:

- Bright's primary recall returns rich LinkedIn profiles directly.
- Serper's primary recall returns lighter Google results, but this run completed the follow-up Bright enrichment for all 100 URLs.
- The search row was slower to flip from `deep_scoring` to `done`, but the deep-scoring completion event emitted successfully and 15 candidates were written.

Even on this fairer setup, the final output quality still favors Bright decisively.

## Bottom line

For `Glimpse`-style NYC onsite startup roles:

- **Winner on quality: Bright**
- **Serper can be made fairer by enriching all recalled LinkedIn URLs, but the final shortlist is still materially weaker than Bright direct recall**
- **Practical product strategy: use Bright for high-constraint local roles; keep Serper as a broader recall/fallback path**
