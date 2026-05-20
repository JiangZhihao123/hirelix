import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { enqueueSearchJob, processNextSearchJob } from '../src/lib/search-jobs';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const USER_ID = 'b602172d-f7d4-4f01-b835-3feff9eae346';
const JD_TEXT = fs.readFileSync('/Users/noah/projects/hirelix/test-jd-glimpse-real.md', 'utf8');
const REQUESTED_CANDIDATE_COUNT = Number.parseInt(process.env.TEST_CANDIDATE_COUNT || '1000', 10);
const HIGHLIGHT_COUNT = Number.parseInt(process.env.TEST_HIGHLIGHT_COUNT || '5', 10);
const OUTREACH_POOL_TARGET = Number.parseInt(process.env.TEST_OUTREACH_POOL_TARGET || '25', 10);

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchState(searchId: string) {
  const { data: search } = await supabase
    .from('hirelix_searches')
    .select('id,status,pipeline_step,error_message,parsed_requirements,updated_at')
    .eq('id', searchId)
    .single();
  const { count: candidateCount } = await supabase
    .from('hirelix_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('search_id', searchId);
  const { data: job } = await supabase
    .from('hirelix_search_jobs')
    .select('id,status,attempt_count,last_error,updated_at,locked_at')
    .eq('search_id', searchId)
    .single();
  return { search, candidateCount: candidateCount || 0, job };
}

async function main() {
  const now = new Date().toISOString();
  const { data: search, error: searchErr } = await supabase
    .from('hirelix_searches')
    .insert({
      user_id: USER_ID,
      jd_text: JD_TEXT,
      status: 'queued',
      pipeline_step: 'queued',
      error_message: null,
      parsed_requirements: {
        candidate_count: REQUESTED_CANDIDATE_COUNT,
        display_count: REQUESTED_CANDIDATE_COUNT,
        highlight_count: HIGHLIGHT_COUNT,
        requested_candidate_count: REQUESTED_CANDIDATE_COUNT,
        outreach_pool_target: OUTREACH_POOL_TARGET,
      },
      queued_at: now,
      created_at: now,
      updated_at: now,
      parse_completed_at: null,
      search_completed_at: null,
      partial_ready_at: null,
      done_at: null,
    })
    .select('id')
    .single();

  if (searchErr || !search) throw searchErr || new Error('create_search_failed');

  const searchId = search.id as string;
  await enqueueSearchJob({
    searchId,
    userId: USER_ID,
    jdText: JD_TEXT,
    candidateCount: REQUESTED_CANDIDATE_COUNT,
  });
  console.log(`[RUN] search_id=${searchId}`);

  const terminal = new Set(['done', 'error']);
  for (let i = 0; i < 120; i++) {
    const stateBefore = await fetchState(searchId);
    console.log(`[POLL_BEFORE] i=${i} status=${stateBefore.search?.status} step=${stateBefore.search?.pipeline_step} candidates=${stateBefore.candidateCount} job=${stateBefore.job?.status} attempts=${stateBefore.job?.attempt_count}`);
    if (stateBefore.search?.status && terminal.has(stateBefore.search.status)) break;

    const result = await processNextSearchJob(searchId);
    console.log(`[PROCESS] i=${i} processed=${result.processed} hasMore=${result.hasMore}`);

    const stateAfter = await fetchState(searchId);
    console.log(`[POLL_AFTER] i=${i} status=${stateAfter.search?.status} step=${stateAfter.search?.pipeline_step} candidates=${stateAfter.candidateCount} job=${stateAfter.job?.status} attempts=${stateAfter.job?.attempt_count} last_error=${stateAfter.job?.last_error || 'none'}`);
    if (stateAfter.search?.status && terminal.has(stateAfter.search.status)) break;
    await sleep(3000);
  }

  const finalState = await fetchState(searchId);
  const stats = (finalState.search?.parsed_requirements as any)?.display_stats || {};
  console.log('[FINAL_JSON]' + JSON.stringify({
    search_id: searchId,
    final_status: finalState.search?.status || null,
    final_step: finalState.search?.pipeline_step || null,
    candidate_count: finalState.candidateCount,
    job_status: finalState.job?.status || null,
    job_attempt_count: finalState.job?.attempt_count || null,
    job_last_error: finalState.job?.last_error || null,
    error_message: finalState.search?.error_message || null,
    display_stats: stats,
  }));
}

main().catch((err) => { console.error('fatal_error', err); process.exit(1); });
