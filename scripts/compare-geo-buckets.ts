import fs from 'node:fs';
import { buildLinkedInSearchPlan, parseSearchResults, serperSearch } from '../src/lib/serper';

const env = fs.readFileSync('/Users/noah/projects/hirelix/.env', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([^=:#]+)=(.*)$/);
  if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
}

function isNy(text: string) {
  return /(new york|brooklyn|queens|bronx|manhattan|jersey city|new york city metropolitan area|greater new york city area)/i.test(text);
}

function isUs(text: string) {
  return /(united states|\bUS\b|\bUSA\b|, US\b)/i.test(text);
}

function bucket(text: string) {
  if (isNy(text)) return 'ny_local';
  if (isUs(text)) return 'us_non_ny';
  return 'non_us';
}

async function loadSerper100() {
  const oldData = JSON.parse(fs.readFileSync('/Users/noah/projects/hirelix/analysis-bright-vs-serper.json', 'utf8'));
  const parsed = oldData.parsed_requirements;
  const apiKey = process.env.SERPER_API_KEY!;
  const plan = buildLinkedInSearchPlan(parsed);
  const deduped = new Map<string, any>();

  outer:
  for (const tier of plan.tiers) {
    const pagesForTier = tier.tier === 'P3' ? 8 : 4;
    for (const query of tier.queries) {
      for (let page = 1; page <= pagesForTier; page++) {
        const results = await serperSearch(apiKey, query, 100, page);
        const candidates = parseSearchResults(results);
        for (const c of candidates) {
          const key = c.linkedin_url.toLowerCase();
          if (!deduped.has(key)) deduped.set(key, c);
          if (deduped.size >= 100) break outer;
        }
      }
    }
  }
  return Array.from(deduped.values());
}

async function main() {
  const brightData = JSON.parse(fs.readFileSync('/Users/noah/projects/hirelix/analysis-bright-vs-serper.json', 'utf8')).bright_candidates;
  const serperData = await loadSerper100();

  const brightBuckets = { ny_local: 0, us_non_ny: 0, non_us: 0 };
  const serperBuckets = { ny_local: 0, us_non_ny: 0, non_us: 0 };

  const brightExamples: Record<string, any[]> = { ny_local: [], us_non_ny: [], non_us: [] };
  const serperExamples: Record<string, any[]> = { ny_local: [], us_non_ny: [], non_us: [] };

  for (const c of brightData) {
    const text = `${c.city || c.location || ''} ${c.country_code || ''} ${c.headline || c.current_title || c.position || c.title || ''}`;
    const b = bucket(text);
    brightBuckets[b as keyof typeof brightBuckets] += 1;
    if (brightExamples[b].length < 8) {
      brightExamples[b].push({ name: c.name, location: c.city || c.location || null, headline: c.headline || c.current_title || c.position || c.title || null, url: c.url || c.input_url || null });
    }
  }

  for (const c of serperData) {
    const text = `${c.headline || ''} ${c.snippet || ''} ${c.linkedin_url || ''}`;
    const b = bucket(text);
    serperBuckets[b as keyof typeof serperBuckets] += 1;
    if (serperExamples[b].length < 8) {
      serperExamples[b].push({ name: c.name, headline: c.headline, snippet: c.snippet, url: c.linkedin_url });
    }
  }

  console.log(JSON.stringify({ brightBuckets, serperBuckets, brightExamples, serperExamples }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
