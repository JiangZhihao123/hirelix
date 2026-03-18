import fs from 'node:fs';
import { buildLinkedInSearchPlan, parseSearchResults, serperSearch } from '../src/lib/serper';

const env = fs.readFileSync('/Users/noah/projects/hirelix/.env', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([^=:#]+)=(.*)$/);
  if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
}

async function main() {
  const oldData = JSON.parse(fs.readFileSync('/Users/noah/projects/hirelix/analysis-bright-vs-serper.json', 'utf8'));
  const parsed = oldData.parsed_requirements;
  const apiKey = process.env.SERPER_API_KEY!;
  const plan = buildLinkedInSearchPlan(parsed);
  const deduped = new Map<string, { name: string; headline: string | null; linkedin_url: string; snippet: string }>();

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

  const candidates = Array.from(deduped.values());
  const foreignHints = candidates.filter((c) => {
    const t = `${c.headline || ''} ${c.snippet || ''} ${c.linkedin_url}`.toLowerCase();
    return /(india|pakistan|bangladesh|nigeria|kenya|brazil|mexico|london|uk|united kingdom|canada|toronto|germany|berlin|singapore|australia|philippines|egypt|israel|uae|saudi|netherlands|france|europe|in\.linkedin|pk\.linkedin|ng\.linkedin|br\.linkedin|mx\.linkedin|uk\.linkedin|ca\.linkedin|de\.linkedin|ae\.linkedin|il\.linkedin|ph\.linkedin|eg\.linkedin|tn\.linkedin)/.test(t) && !/(new york, ny, united states|new york city metropolitan area|brooklyn, new york|manhattan, new york|united states)/.test(t);
  });

  console.log(JSON.stringify({
    total: candidates.length,
    foreign_count: foreignHints.length,
    foreign_examples: foreignHints.slice(0, 20),
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
