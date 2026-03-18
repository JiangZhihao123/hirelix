import fs from 'node:fs';
import { buildLinkedInSearchPlan, parseSearchResults, serperSearch } from '../src/lib/serper';

const envPath = '/Users/noah/projects/hirelix/.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

const SERPER_API_KEY = process.env.SERPER_API_KEY!;
const OLD_PATH = '/Users/noah/projects/hirelix/analysis-bright-vs-serper.json';
const NEW_SEARCH_ID = 'be21cd42-a822-429b-a317-87d9f93d81f0';

type Candidate = {
  name: string;
  headline: string | null;
  linkedin_url: string;
  snippet: string;
};

async function fetchJson(path: string) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

async function fetchNewParsed() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await supabase
    .from('hirelix_searches')
    .select('parsed_requirements')
    .eq('id', NEW_SEARCH_ID)
    .single();
  return data?.parsed_requirements;
}

async function collectSerperPool(parsed: any, cap = 100) {
  const plan = buildLinkedInSearchPlan(parsed);
  const deduped = new Map<string, Candidate>();

  for (const tier of plan.tiers) {
    const pagesForTier = tier.tier === 'P3' ? 8 : 4;
    for (const query of tier.queries) {
      for (let page = 1; page <= pagesForTier; page++) {
        const results = await serperSearch(SERPER_API_KEY, query, 100, page);
        const candidates = parseSearchResults(results);
        for (const candidate of candidates) {
          const key = candidate.linkedin_url.toLowerCase();
          if (!deduped.has(key)) deduped.set(key, candidate);
          if (deduped.size >= cap) {
            return {
              queries: plan.queries,
              tiers: plan.tiers,
              candidates: Array.from(deduped.values()),
            };
          }
        }
      }
    }
  }

  return {
    queries: plan.queries,
    tiers: plan.tiers,
    candidates: Array.from(deduped.values()),
  };
}

function stats(candidates: Candidate[]) {
  const isUS = (text: string) => /united states|\bUS\b|\bUSA\b/i.test(text);
  const isNY = (text: string) => /new york|brooklyn|queens|bronx|manhattan|jersey city|new york city metropolitan area/i.test(text);
  const textOf = (c: Candidate) => `${c.headline || ''} ${c.snippet || ''}`;
  const counts = {
    total: candidates.length,
    us: 0,
    ny: 0,
    python: 0,
    node: 0,
    next: 0,
    llm_ai: 0,
  };
  for (const c of candidates) {
    const text = textOf(c);
    if (isUS(text)) counts.us += 1;
    if (isNY(text)) counts.ny += 1;
    if (/python/i.test(text)) counts.python += 1;
    if (/node\.js|\bnode\b/i.test(text)) counts.node += 1;
    if (/next\.js|nextjs/i.test(text)) counts.next += 1;
    if (/\bllm\b|\bai\b|machine learning|generative ai/i.test(text)) counts.llm_ai += 1;
  }
  return counts;
}

async function main() {
  const oldData = await fetchJson(OLD_PATH);
  const oldParsed = oldData.parsed_requirements;
  const newParsed = await fetchNewParsed();

  const oldPool = await collectSerperPool(oldParsed, 100);
  const newPool = await collectSerperPool(newParsed, 100);

  const out = {
    old: {
      parsed: oldParsed,
      stats: stats(oldPool.candidates),
      sample: oldPool.candidates.slice(0, 20),
    },
    newer: {
      parsed: newParsed,
      stats: stats(newPool.candidates),
      sample: newPool.candidates.slice(0, 20),
    },
  };

  const outPath = '/Users/noah/projects/hirelix/analysis-serper-old-vs-new.json';
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(outPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
