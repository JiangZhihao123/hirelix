import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

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

process.env.SEARCH_RECALL_PROVIDER = 'serper';
process.env.SEARCH_RECALL_FALLBACK_PROVIDER = 'serper';
process.env.SEARCH_BRIGHTDATA_FILTER_LIMIT = '100';
process.env.SEARCH_TARGET_SCRAPE_COUNT = '10';
process.env.AI_PROVIDER = 'deepseek';
process.env.DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
process.env.DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
process.env.AI_MODEL = 'deepseek-chat';
process.env.SEARCH_LIGHT_MODEL = 'deepseek-chat';
process.env.SEARCH_JUDGE_MODEL = 'deepseek-chat';
process.env.SEARCH_ARBITER_MODEL = 'deepseek-chat';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const JD_PATH = '/Users/noah/projects/hirelix/test-jd-bluecargo.md';
const USER_ID = 'b602172d-f7d4-4f01-b835-3feff9eae346';

async function main() {
  const { enqueueSearchJob, processNextSearchJob } = await import('../src/lib/search-jobs');
  const jdText = fs.readFileSync(JD_PATH, 'utf8');
  const now = new Date().toISOString();

  const { data: search, error } = await supabase
    .from('hirelix_searches')
    .insert({
      user_id: USER_ID,
      jd_text: jdText,
      status: 'queued',
      pipeline_step: 'queued',
      parsed_requirements: {
        candidate_count: 10,
        display_count: 10,
        highlight_count: 5,
        requested_candidate_count: 10,
        outreach_pool_target: 10,
      },
      queued_at: now,
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (error || !search) throw error || new Error('create_search_failed');

  const searchId = search.id as string;
  console.log(`[RUN] search_id=${searchId}`);

  await enqueueSearchJob({
    searchId,
    userId: USER_ID,
    jdText,
    candidateCount: 10,
  });

  const terminal = new Set(['done', 'degraded', 'error']);
  for (let i = 0; i < 120; i++) {
    const result = await processNextSearchJob(searchId);
    const { data: currentSearch } = await supabase
      .from('hirelix_searches')
      .select('status,pipeline_step,error_message,warning_message,parsed_requirements')
      .eq('id', searchId)
      .single();

    console.log(`[POLL] i=${i} status=${currentSearch?.status} step=${currentSearch?.pipeline_step} processed=${result.processed} hasMore=${result.hasMore}`);

    if (currentSearch?.status && terminal.has(currentSearch.status)) {
      const { data: candidates, count } = await supabase
        .from('hirelix_candidates')
        .select('*', { count: 'exact' })
        .eq('search_id', searchId)
        .order('match_score', { ascending: false });

      console.log('[FINAL_JSON]' + JSON.stringify({
        search_id: searchId,
        final_status: currentSearch.status,
        final_step: currentSearch.pipeline_step,
        candidate_count: count || 0,
        error_message: currentSearch.error_message || null,
        warning_message: currentSearch.warning_message || null,
        display_stats: (currentSearch.parsed_requirements as any)?.display_stats || {},
        recall_metadata: (currentSearch.parsed_requirements as any)?.recall_metadata || null,
        top_candidates: (candidates || []).slice(0, 25).map((c: any) => ({
          name: c.name,
          headline: c.headline,
          location: c.location,
          match_score: c.match_score,
          skills: c.skills,
        })),
      }));
      return;
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error('test_timeout');
}

main().catch((err) => {
  console.error('fatal_error', err);
  process.exit(1);
});
