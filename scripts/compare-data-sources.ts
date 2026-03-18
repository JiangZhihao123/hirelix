import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// 手动加载 .env 文件
const envPath = '/Users/noah/projects/hirelix/.env';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// 设置测试专用的配置
process.env.SEARCH_BRIGHTDATA_FILTER_LIMIT = '100';
process.env.SEARCH_TARGET_SCRAPE_COUNT = '100';
process.env.SEARCH_BRIGHTDATA_FILTER_TIMEOUT_MS = process.env.SEARCH_BRIGHTDATA_FILTER_TIMEOUT_MS || '900000';
process.env.SEARCH_BRIGHTDATA_FILTER_POLL_WINDOW_MS = process.env.SEARCH_BRIGHTDATA_FILTER_POLL_WINDOW_MS || '900000';
process.env.SEARCH_BRIGHTDATA_FILTER_POLL_INTERVAL_MS = process.env.SEARCH_BRIGHTDATA_FILTER_POLL_INTERVAL_MS || '5000';
process.env.AI_PROVIDER = 'deepseek';
process.env.DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
process.env.DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
process.env.AI_MODEL = process.env.AI_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
process.env.SEARCH_LIGHT_MODEL = process.env.SEARCH_LIGHT_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
process.env.SEARCH_JUDGE_MODEL = process.env.SEARCH_JUDGE_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat';
process.env.SEARCH_ARBITER_MODEL = process.env.SEARCH_ARBITER_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const JD_PATH = process.argv[2] || '/Users/noah/projects/hirelix/test-jd-glimpse-real.md';
const USER_ID = 'b602172d-f7d4-4f01-b835-3feff9eae346';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts: number = 4): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = attempt < maxAttempts && /fetch failed|timed out|ECONNRESET|ENOTFOUND|socket/i.test(message);
      console.warn(`[retry] ${label} failed (attempt ${attempt}/${maxAttempts}): ${message}`);
      if (!retryable) break;
      await sleep(500 * attempt);
    }
  }

  throw lastError;
}

function maybeThrowSupabaseError<T extends { error?: { message?: string | null } | null }>(
  label: string,
  response: T,
) {
  const message = response?.error?.message;
  if (message) {
    throw new Error(`${label}: ${message}`);
  }
  return response;
}

async function runTest(recallProvider: 'brightdata_dataset' | 'serper') {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${recallProvider.toUpperCase()}`);
  console.log('='.repeat(60));

  const jdText = fs.readFileSync(JD_PATH, 'utf8');
  const now = new Date().toISOString();

  // 创建搜索
  const { data: search, error } = await withRetry('create search', async () =>
    maybeThrowSupabaseError(
      'create search',
      await supabase
        .from('hirelix_searches')
        .insert({
          user_id: USER_ID,
          jd_text: jdText,
          status: 'queued',
          pipeline_step: 'queued',
          parsed_requirements: {
            candidate_count: 25,
            display_count: 25,
            highlight_count: 5,
            requested_candidate_count: 25,
            outreach_pool_target: 15,
          },
          queued_at: now,
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single()
    )
  );

  if (error || !search) {
    throw new Error(`Failed to create search: ${error?.message}`);
  }

  const searchId = search.id as string;
  console.log(`Created search: ${searchId}`);

  // 设置环境变量来指定数据源
  const originalProvider = process.env.SEARCH_RECALL_PROVIDER;
  const originalFallbackProvider = process.env.SEARCH_RECALL_FALLBACK_PROVIDER;
  process.env.SEARCH_RECALL_PROVIDER = recallProvider;
  process.env.SEARCH_RECALL_FALLBACK_PROVIDER = 'none';

  try {
    // 动态导入以使用新的环境变量
    const searchJobsModule = await import('../src/lib/search-jobs');
    const searchJobs = (searchJobsModule as any).default || searchJobsModule;
    const { enqueueSearchJob, processNextSearchJob } = searchJobs;

    await enqueueSearchJob({
      searchId,
      userId: USER_ID,
      jdText,
      candidateCount: 25,
    });

    console.log('Processing search job...');
    const startTime = Date.now();
    const maxRuntimeMs =
      recallProvider === 'brightdata_dataset'
        ? 30 * 60 * 1000
        : 12 * 60 * 1000;

    // 轮询直到完成
    for (let i = 0; Date.now() - startTime < maxRuntimeMs; i++) {
      await processNextSearchJob(searchId);

      const { data: currentSearch } = await withRetry(`fetch search status ${searchId}`, async () =>
        maybeThrowSupabaseError(
          `fetch search status ${searchId}`,
          await supabase
            .from('hirelix_searches')
            .select('status, pipeline_step, error_message')
            .eq('id', searchId)
            .single()
        )
      );

      console.log(`[${i}] status=${currentSearch?.status} step=${currentSearch?.pipeline_step}`);

      if (['done', 'degraded', 'error'].includes(currentSearch?.status || '')) {
        break;
      }

      await new Promise(r => setTimeout(r, 3000));
    }

    const duration = Date.now() - startTime;

    // 获取结果
    const { data: finalSearch } = await withRetry(`fetch final search ${searchId}`, async () =>
      maybeThrowSupabaseError(
        `fetch final search ${searchId}`,
        await supabase
          .from('hirelix_searches')
          .select('status, parsed_requirements, error_message, warning_message')
          .eq('id', searchId)
          .single()
      )
    );

    const { data: candidates, count } = await withRetry(`fetch candidates ${searchId}`, async () =>
      maybeThrowSupabaseError(
        `fetch candidates ${searchId}`,
        await supabase
          .from('hirelix_candidates')
          .select('*', { count: 'exact' })
          .eq('search_id', searchId)
          .order('match_score', { ascending: false })
      )
    );

    const stats = (finalSearch?.parsed_requirements as any)?.display_stats || {};

    return {
      provider: recallProvider,
      searchId,
      status: finalSearch?.status,
      pipeline_step: (finalSearch?.parsed_requirements as any)?.pipeline_step || null,
      duration_ms: duration,
      candidate_count: count || 0,
      candidates: candidates || [],
      stats,
      error: finalSearch?.error_message,
      warning: finalSearch?.warning_message,
      parsed: finalSearch?.parsed_requirements || null,
      recall_metadata: (finalSearch?.parsed_requirements as any)?.recall_metadata,
    };
  } finally {
    // 恢复原始环境变量
    if (originalProvider) {
      process.env.SEARCH_RECALL_PROVIDER = originalProvider;
    } else {
      delete process.env.SEARCH_RECALL_PROVIDER;
    }

    if (originalFallbackProvider) {
      process.env.SEARCH_RECALL_FALLBACK_PROVIDER = originalFallbackProvider;
    } else {
      delete process.env.SEARCH_RECALL_FALLBACK_PROVIDER;
    }
  }
}

async function compareResults(brightDataResult: any, serperResult: any) {
  console.log('\n' + '='.repeat(60));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(60));

  console.log('\n📊 Basic Metrics:');
  console.log(`Bright Data Dataset:`);
  console.log(`  - Candidates: ${brightDataResult.candidate_count}`);
  console.log(`  - Duration: ${(brightDataResult.duration_ms / 1000).toFixed(1)}s`);
  console.log(`  - Status: ${brightDataResult.status}`);
  console.log(`  - Recall status: ${brightDataResult.recall_metadata?.status || 'N/A'}`);
  console.log(`  - Dataset size: ${brightDataResult.recall_metadata?.dataset_size || 'N/A'}`);
  console.log(`  - Recall latency: ${brightDataResult.recall_metadata?.recall_latency_ms || 'N/A'}`);
  console.log(`  - Filter summary: ${JSON.stringify(brightDataResult.recall_metadata?.filter_summary || null)}`);
  console.log(`  - Error: ${brightDataResult.error || 'N/A'}`);
  console.log(`  - Warning: ${brightDataResult.warning || 'N/A'}`);

  console.log(`\nSerper:`);
  console.log(`  - Candidates: ${serperResult.candidate_count}`);
  console.log(`  - Duration: ${(serperResult.duration_ms / 1000).toFixed(1)}s`);
  console.log(`  - Status: ${serperResult.status}`);
  console.log(`  - Retrieval count: ${serperResult.stats?.retrieval_count || 'N/A'}`);
  console.log(`  - Source rule pass rate: ${serperResult.stats?.source_rule_pass_rate || 'N/A'}`);
  console.log(`  - LLM prescreen pass rate: ${serperResult.stats?.llm_prescreen_pass_rate || 'N/A'}`);
  console.log(`  - Deep review requested: ${serperResult.stats?.deep_review_requested_count || 'N/A'}`);
  console.log(`  - Deep review completed: ${serperResult.stats?.deep_review_completed_count || 'N/A'}`);
  console.log(`  - Error: ${serperResult.error || 'N/A'}`);
  console.log(`  - Warning: ${serperResult.warning || 'N/A'}`);

  console.log('\n🎯 Top 10 Candidates Comparison:');
  console.log('\nBright Data Dataset:');
  brightDataResult.candidates.slice(0, 10).forEach((c: any, i: number) => {
    console.log(`  ${i + 1}. ${c.name} - ${c.headline || 'N/A'} (score: ${c.match_score})`);
    console.log(`     Location: ${c.location || 'N/A'}`);
    console.log(`     Skills: ${(c.skills || []).slice(0, 5).join(', ')}`);
  });

  console.log('\nSerper:');
  serperResult.candidates.slice(0, 10).forEach((c: any, i: number) => {
    console.log(`  ${i + 1}. ${c.name} - ${c.headline || 'N/A'} (score: ${c.match_score})`);
    console.log(`     Location: ${c.location || 'N/A'}`);
    console.log(`     Skills: ${(c.skills || []).slice(0, 5).join(', ')}`);
  });

  // 保存详细结果到文件
  const report = {
    test_date: new Date().toISOString(),
    jd_file: JD_PATH,
    bright_data: {
      search_id: brightDataResult.searchId,
      candidate_count: brightDataResult.candidate_count,
      duration_ms: brightDataResult.duration_ms,
      status: brightDataResult.status,
      stats: brightDataResult.stats,
      recall_metadata: brightDataResult.recall_metadata,
      parsed: brightDataResult.parsed,
      top_10: brightDataResult.candidates.slice(0, 10),
    },
    serper: {
      search_id: serperResult.searchId,
      candidate_count: serperResult.candidate_count,
      duration_ms: serperResult.duration_ms,
      status: serperResult.status,
      stats: serperResult.stats,
      recall_metadata: serperResult.recall_metadata,
      parsed: serperResult.parsed,
      top_10: serperResult.candidates.slice(0, 10),
    },
  };

  const reportPath = `/Users/noah/projects/hirelix/data-source-comparison-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);
}

async function main() {
  console.log('Starting data source comparison test...');
  console.log(`JD: ${JD_PATH}`);
  console.log(`JD file name: ${JD_PATH.split('/').pop()}`);

  try {
    // 测试 Bright Data Dataset
    const brightDataResult = await runTest('brightdata_dataset');

    // 等待一下再测试第二个
    await new Promise(r => setTimeout(r, 5000));

    // 测试 Serper
    const serperResult = await runTest('serper');

    // 对比结果
    await compareResults(brightDataResult, serperResult);

    console.log('\n✅ Comparison complete!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
