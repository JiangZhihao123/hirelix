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

### Serper-only

- Search ID: `b4b849e6-8e5b-4085-be6f-0fb3cd6bfc36`
- Status: `degraded`
- Provider: `serper`
- Final candidates: `25`
- Avg score: `36.8`
- Max score: `85`
- Warning: `Advanced profile enrichment did not finish, but your shortlist is ready to review.`

Pipeline stats:

- Retrieval count: `100`
- Source-rule pass rate: `0.23`
- LLM prescreen pass rate: `0.07`
- Bright enrichment scrape count: `0`
- Deep review completed count: `0`

Top candidates:

1. Thanu Sri — Full Stack Developer & Software Engineer — location missing — score 85
2. Bryan Owens — AI Engineer & Full Stack Engineer — location missing — score 85
3. Vladimir Balaur — Full stack Engineer (React / Vue / Node.js) — location missing — score 75
4. Cory Campbell — Software Developer / Full Stack — location missing — score 75
5. Krunal Shah — AI Engineer / Full Stack Developer — location missing — score 75

Observations:

- Top 10 are Google/Serper results with no structured location data in the final shortlist.
- Titles are directionally relevant but significantly noisier than Bright.
- For this onsite NYC role, Serper produced weaker evidence on the most important hard constraint: location.

## Decision

For this JD, **Bright is clearly better than Serper on candidate quality**.

Why:

1. Bright returned a fully structured NYC-heavy profile set that matches the onsite constraint.
2. Bright's final shortlist scores are much stronger (`66.32` avg vs `36.8` avg).
3. Bright's top candidates look like real LinkedIn profiles already aligned to the role.
4. Serper's final shortlist is much thinner on location and profile detail, even when titles look roughly relevant.

## Important caveat

This comparison is still fair for the final product experience, but not perfectly symmetric at the pipeline level:

- Bright's primary recall already returns rich LinkedIn profiles.
- Serper's primary recall returns lighter Google results and then relies on Bright enrichment for deep review.
- In this run, that enrichment did not finish, so Serper remained in a degraded state.

Even with that caveat, the final output quality for this JD still favors Bright decisively.

## Bottom line

For `Glimpse`-style NYC onsite startup roles:

- **Winner on quality: Bright**
- **Winner on reliability of lightweight retrieval alone: Serper can still be useful, but its final shortlist quality is materially worse unless enrichment completes**
- **Practical product strategy: use Bright for high-constraint local roles; keep Serper as a broader recall/fallback path**
