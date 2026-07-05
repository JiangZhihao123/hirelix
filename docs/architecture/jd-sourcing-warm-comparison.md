# Cold vs Warm Sourcing Comparison

- Cold: `benchmark-2026-07-05T16-14-23-480Z-4ef5b995`
- Warm: `benchmark-2026-07-05T16-14-41-450Z-b1a25a0a`
- Mode: cold `dry-run`, warm `dry-run`
- Providers: cold `serper,exa,firecrawl,github`, warm `serper,exa,firecrawl,github`

## Totals

| Metric | Cold | Warm | Delta |
| --- | ---: | ---: | ---: |
| Actual cost | $0.0000 | $0.0000 | $0.0000 |
| Candidate cards | 0 | 0 | 0 |
| Reviewable candidates | 0 | 0 | 0 |
| Contact-worthy candidates | 0 | 0 | 0 |
| LLM cache hits | 0 | 2 | 2 |
| LLM latency | 9256 ms | 0 ms | -9256 ms |

## Verdict

- LLM cache useful: yes
- External profile/provider index value: not_tested
- Can claim warm index validated: no
- Summary: current evidence validates LLM cache only; provider/profile index value remains unproven.

## JD Rows

| JD | Cold cards | Warm cards | Cold contact-worthy | Warm contact-worthy | Cost delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| JD-01 普通技术岗：Backend Platform Engineer | 0 | 0 | 0 | 0 | $0.0000 |

## Interpretation

- this comparison is not a live provider benchmark; it can validate LLM cache behavior, not external sourcing economics.
- warm rerun hit more LLM cache, so repeated parsing/screening cost and latency should drop.
- zero external cost with zero candidate cards means this is dry-run planning evidence, not proof that a warm profile index can satisfy a JD.
