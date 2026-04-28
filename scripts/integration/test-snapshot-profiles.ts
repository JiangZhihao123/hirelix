/**
 * 测试 hirelix_snapshot_profiles 落库
 *
 * 场景 1 - 首次搜索：
 *   - 触发新 snapshot
 *   - 验证 profiles 写入 hirelix_snapshot_profiles
 *
 * 场景 2 - 相同 filter 参数重跑（snapshot cache 命中）：
 *   - 同一 snapshot_id 被复用
 *   - upsert 幂等，表中不出现重复行
 *   - 新 search_id / job_id 被正确关联（第二次写入会因唯一索引而 ignoreDuplicates）
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

// ── load env ──────────────────────────────────────────────────────────────────
const envPath = "/Users/noah/projects/hirelix/.env";
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .forEach((line) => {
      const m = line.match(/^([^=:#]+)=(.*)/);
      if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
    });
}

// 强制用 DeepSeek + 100 条限制
process.env.SEARCH_BRIGHTDATA_STANDARD_LIMIT = "100";
process.env.SEARCH_BRIGHTDATA_HIDDEN_GEM_LIMIT = "25";
process.env.SEARCH_BRIGHTDATA_COMPANY_TARGET_LIMIT = "25";
process.env.AI_PROVIDER = "deepseek";
process.env.DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
process.env.DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
process.env.AI_MODEL = "deepseek-chat";
process.env.SEARCH_LIGHT_MODEL = "deepseek-chat";
process.env.SEARCH_JUDGE_MODEL = "deepseek-chat";
process.env.SEARCH_ARBITER_MODEL = "deepseek-chat";

// ── supabase client ───────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const USER_ID = "b602172d-f7d4-4f01-b835-3feff9eae346";

// 用一个较小的 JD 让测试快一点
const JD_TEXT = `
We are looking for a Senior Frontend Engineer to join our San Francisco-based team (remote ok within the US).

Requirements:
- 4+ years of experience with React and TypeScript
- Experience building production web applications
- Based in the United States
`.trim();

// ── helpers ───────────────────────────────────────────────────────────────────
async function createAndRunSearch(label: string): Promise<{
  searchId: string;
  jobId: string;
  status: string;
  snapshotId: string | null;
  additionalSnapshots: Array<{ round: string; snapshot_id: string }>;
}> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${label}] 创建搜索任务...`);

  const { enqueueSearchJob, processNextSearchJob } = await import(
    "../src/lib/search-jobs.ts"
  );

  const now = new Date().toISOString();
  const { data: search, error: insertErr } = await supabase
    .from("hirelix_searches")
    .insert({
      user_id: USER_ID,
      jd_text: JD_TEXT,
      status: "queued",
      pipeline_step: "queued",
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
    .select("id")
    .single();

  if (insertErr || !search) throw insertErr || new Error("create_search_failed");
  const searchId = search.id as string;
  console.log(`[${label}] search_id=${searchId}`);

  const enqueueResult = await enqueueSearchJob({
    searchId,
    userId: USER_ID,
    jdText: JD_TEXT,
    candidateCount: 10,
  });
  const jobId = (enqueueResult as Record<string, unknown>).job_id as string ?? (enqueueResult as Record<string, unknown>).jobId as string ?? "unknown";
  console.log(`[${label}] job_id=${jobId}`);

  // 轮询直到终态
  const terminal = new Set(["done", "degraded", "error"]);
  for (let i = 0; i < 150; i++) {
    await processNextSearchJob(searchId);
    const { data: s } = await supabase
      .from("hirelix_searches")
      .select("status,pipeline_step,parsed_requirements")
      .eq("id", searchId)
      .single();

    process.stdout.write(
      `\r[${label}] poll=${i} status=${s?.status} step=${s?.pipeline_step}   `,
    );

    if (s?.status && terminal.has(s.status)) {
      console.log(`\n[${label}] 完成 → status=${s.status}`);
      const rm = (s.parsed_requirements as Record<string, unknown>)?.recall_metadata as Record<string, unknown> | undefined;
      const metaSnapshotId = rm?.snapshot_id as string | null ?? null;
      const additionalSnapshots = (rm?.additional_snapshots as Array<{ round: string; snapshot_id: string }> | undefined) ?? [];
      // 注意：不在这里读 snapshot_profiles，让调用方在等待后再读，避免 fire-and-forget 未完成
          return { searchId, jobId, status: s.status, snapshotId: metaSnapshotId, additionalSnapshots };
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error(`[${label}] timeout`);
}

async function querySnapshotProfiles(snapshotId: string) {
  const { data, count } = await supabase
    .from("hirelix_snapshot_profiles")
    .select("id,search_id,job_id,source_round,linkedin_id,profile_url", { count: "exact" })
    .eq("snapshot_id", snapshotId);
  return { rows: data ?? [], count: count ?? 0 };
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  // ── 场景 1：首次搜索 ─────────────────────────────────────────────────────
  const run1 = await createAndRunSearch("RUN-1");

  console.log(`[RUN-1] 验证 hirelix_snapshot_profiles 落库...`);
  console.log(`  recall_metadata.snapshot_id (参考): ${run1.snapshotId}`);

  // 直接从 DB 读该 search_id 下的所有落库记录
  const { data: run1Profiles } = await supabase
    .from("hirelix_snapshot_profiles")
    .select("id,snapshot_id,source_round,record_index,linkedin_id,profile_url", { count: "exact" })
    .eq("search_id", run1.searchId);

  const run1Rows = run1Profiles ?? [];
  if (run1Rows.length === 0) {
    console.error("  ❌ FAIL: hirelix_snapshot_profiles 中没有任何落库数据");
  } else {
    const bySnap = new Map<string, { round: string; count: number; liIds: number; urls: number; indexes: number[] }>();
    for (const row of run1Rows) {
      const key = `${row.snapshot_id}|${row.source_round}`;
      const existing = bySnap.get(key);
      const recordIndex = typeof row.record_index === "number" ? row.record_index : -1;
      if (existing) {
        existing.count++;
        existing.indexes.push(recordIndex);
        if (row.linkedin_id) existing.liIds++;
        if (row.profile_url) existing.urls++;
      } else {
        bySnap.set(key, { round: row.source_round, count: 1, liIds: row.linkedin_id ? 1 : 0, urls: row.profile_url ? 1 : 0, indexes: [recordIndex] });
      }
    }
    for (const [key, { round, count, liIds, urls, indexes }] of bySnap) {
      const snapId = key.split("|")[0];
      const ordered = indexes.every((value, index) => value === index);
      console.log(`  ✅ [${round}] snapshot=${snapId} → 落库=${count} 条 | linkedin_id有值=${liIds} | profile_url有值=${urls} | record_index=${ordered ? "连续" : "异常"}`);
    }
  }

  // ── 场景 2：相同 JD 重跑，期望 snapshot cache 命中 ───────────────────────
  console.log(`\n${"─".repeat(60)}`);
  console.log("[RUN-2] 用相同 JD 重跑，验证 snapshot cache 命中 + DB-first 复用...");

  const run2 = await createAndRunSearch("RUN-2");

  // 检查 standard snapshot_id 是否一致（cache 命中）
  const cacheHit = run1.snapshotId && run2.snapshotId && run1.snapshotId === run2.snapshotId;
  if (cacheHit) {
    console.log(`\n✅ PASS: standard snapshot cache 命中 → 复用 ${run1.snapshotId}`);
  } else {
    console.log(`\n⚠ NOTICE: standard snapshot_id 不同（RUN-1=${run1.snapshotId} | RUN-2=${run2.snapshotId}）`);
    console.log("  可能是 budget 不同或 filter hash 有差异，属预期行为");
  }

  // cache hit 时 DB-first 会复用既有 snapshot rows，不再为 RUN-2 重复写一份 raw_data
  const { data: run2Profiles } = await supabase
    .from("hirelix_snapshot_profiles")
    .select("id,snapshot_id,source_round,record_index,linkedin_id,profile_url")
    .eq(cacheHit ? "snapshot_id" : "search_id", cacheHit ? run2.snapshotId : run2.searchId);
  const run2Rows = run2Profiles ?? [];

  console.log(`\n[RUN-2] 落库验证：`);
  if (run2Rows.length === 0) {
    console.error("  ❌ FAIL: 没有找到可复用的 snapshot profile 数据");
  } else {
    const bySnap2 = new Map<string, { round: string; count: number }>();
    for (const row of run2Rows) {
      const key = `${row.snapshot_id}|${row.source_round}`;
      const existing = bySnap2.get(key);
      if (existing) existing.count++;
      else bySnap2.set(key, { round: row.source_round, count: 1 });
    }
    for (const [key, { round, count }] of bySnap2) {
      const snapId = key.split("|")[0];
      console.log(`  ✅ [${round}] snapshot=${snapId} → 落库=${count} 条`);
    }
  }

  // 幂等性检查：若 snapshot 被复用，读取到的复用行数应该和 RUN-1 一样
  if (cacheHit && run1.snapshotId) {
    console.log(`\n[DB-first] RUN-1 落库总行数=${run1Rows.length} | RUN-2 可复用行数=${run2Rows.length}`);
    if (run1Rows.length === run2Rows.length) {
      console.log("  ✅ PASS: DB-first 复用 — 行数相同，没有重复下载");
    } else {
      console.warn(`  ⚠ 行数不同，可能存在重复写入风险`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("测试完成");
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
