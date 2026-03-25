# Hirelix

Hirelix is a Next.js application for AI-assisted candidate sourcing and outreach.

## Project Docs

Project documentation lives under [`docs/`](./docs/README.md).

- Architecture: data pipeline and processing flows
- Strategy: product direction and growth logic
- Data sources: provider choices, comparisons, and setup guides
- Growth: planning and business milestones
- Marketing: launch and distribution materials

## Development

Start the local dev server:

```bash
npm run dev
```

Then open `http://localhost:3000`.

### Local Proxy

If local server-side outbound traffic needs to go through a proxy, set:

```bash
PROXY_ENABLED=true
PROXY_URL=http://127.0.0.1:7890
```

`PROXY_ENABLED` / `PROXY_URL` are the preferred names.
Older `OUTBOUND_PROXY_ENABLED` / `OUTBOUND_PROXY_URL` are still supported for compatibility.

### Bright Recall Limits

You can tune Bright recall volume per round with:

```bash
SEARCH_BRIGHTDATA_STANDARD_LIMIT=50
SEARCH_BRIGHTDATA_HIDDEN_GEM_LIMIT=25
SEARCH_BRIGHTDATA_COMPANY_TARGET_LIMIT=25
```

`SEARCH_BRIGHTDATA_FILTER_LIMIT` is still supported as the legacy fallback for the standard round.

### Shortlist Display Thresholds

You can tighten or relax the final shortlist gate with:

```bash
SEARCH_SHORTLIST_MATCH_SCORE_MIN=80
SEARCH_SHORTLIST_RELEVANCE_MIN=75
SEARCH_SHORTLIST_CAPABILITY_MIN=70
SEARCH_SHORTLIST_JOIN_LIKELIHOOD_MIN=55
```
