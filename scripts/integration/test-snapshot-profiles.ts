/**
 * End-to-end check for Bright Data snapshot profile persistence and DB-first reuse.
 *
 * What this intentionally does:
 * - Runs two real async searches against Supabase + Bright Data + DeepSeek.
 * - Forces the current low-Bright-cost recall profile: standard=50, hidden_gem=25, company_target=25.
 * - Keeps full LLM review enabled; DeepSeek cost is low enough that we should validate quality, not skip scoring.
 * - Prints stage timing, snapshot metadata, Bright cost, notification rows, and candidate/outreach samples.
 *
 * JD source used as a realistic US tech recruiter target:
 * https://boards.greenhouse.io/embed/job_app?token=4738780008
 */

import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

type CandidateRow = {
  name: string;
  headline: string | null;
  location: string | null;
  skills: string[] | null;
  match_score: number | null;
  match_reasons: string[] | null;
  profile_url: string | null;
  github_url: string | null;
  email: string | null;
  outreach_draft: string | null;
  metadata: JsonRecord | null;
};

type SearchSnapshot = {
  id: string;
  status: string | null;
  pipeline_step: string | null;
  error_message: string | null;
  warning_message: string | null;
  parsed_requirements: JsonRecord | null;
};

type RunResult = {
  label: string;
  searchId: string;
  jobId: string;
  status: string;
  elapsedMs: number;
  snapshotIds: string[];
  recallCost: number;
  candidates: CandidateRow[];
  search: SearchSnapshot;
};

function loadEnvFile(path: string) {
  if (!fs.existsSync(path)) return;
  fs.readFileSync(path, "utf8")
    .split("\n")
    .forEach((line) => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (!match) return;
      const key = match[1].trim();
      const value = match[2].trim();
      if (!process.env[key]) process.env[key] = value;
    });
}

loadEnvFile("/Users/noah/projects/hirelix/.env");
loadEnvFile("/Users/noah/projects/hirelix/.env.local");

process.env.SEARCH_EXECUTION_MODE = "test";
process.env.SEARCH_TEST_BRIGHTDATA_STANDARD_LIMIT = "50";
process.env.SEARCH_TEST_BRIGHTDATA_HIDDEN_GEM_LIMIT = "25";
process.env.SEARCH_TEST_BRIGHTDATA_COMPANY_TARGET_LIMIT = "25";
process.env.SEARCH_BRIGHTDATA_STANDARD_LIMIT = "50";
process.env.SEARCH_BRIGHTDATA_HIDDEN_GEM_LIMIT = "25";
process.env.SEARCH_BRIGHTDATA_COMPANY_TARGET_LIMIT = "25";
process.env.SEARCH_BRIGHTDATA_FILTER_LIMIT = "50";
process.env.SEARCH_JOB_RUNNER_KICK_ENABLED = "false";
process.env.SEARCH_LLM_GLOBAL_CONCURRENCY = process.env.SEARCH_LLM_GLOBAL_CONCURRENCY || "20";
process.env.SEARCH_DEEP_REVIEW_CONCURRENCY = process.env.SEARCH_DEEP_REVIEW_CONCURRENCY || "10";
process.env.SEARCH_DEEP_SCORING_CONCURRENCY = process.env.SEARCH_DEEP_SCORING_CONCURRENCY || "10";
process.env.SEARCH_DEBUG_DEEP_REVIEW_LOGS = process.env.SEARCH_DEBUG_DEEP_REVIEW_LOGS || "true";
process.env.AI_PROVIDER = "deepseek";
process.env.OPENROUTER_BASE_URL = "";
process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.com";
process.env.DEEPSEEK_MODEL = "deepseek-chat";
process.env.AI_MODEL = "deepseek-chat";
process.env.SEARCH_LIGHT_MODEL = "deepseek-chat";
process.env.SEARCH_JUDGE_MODEL = "deepseek-chat";
process.env.SEARCH_ARBITER_MODEL = "deepseek-chat";

if ((process.env.HTTP_PROXY || process.env.PROXY_URL) && !process.env.PROXY_ENABLED) {
  process.env.PROXY_ENABLED = "true";
}

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "BRIGHTDATA_API_TOKEN",
  "DEEPSEEK_API_KEY",
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) throw new Error(`${key} is required for the integration run`);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const USER_ID = "b602172d-f7d4-4f01-b835-3feff9eae346";

const JD_TEXT = `
Senior Software Engineer, Search Platform

Our client is a fast-growing AI products company hiring a senior engineer to build a search and retrieval platform for a hybrid team in San Francisco, New York City, or Seattle.

Responsibilities:
- Design and implement scalable search, retrieval, indexing, and ranking systems from the ground up.
- Build backend services, APIs, evaluation tooling, and observability for search quality and reliability.
- Partner with researchers, product engineers, and infrastructure teams to ship production search capabilities.
- Improve latency, relevance, experimentation, metrics, and developer experience for search workflows.

Requirements:
- 6+ years of professional software engineering experience.
- Strong backend experience with Python, TypeScript, Go, Java, or Rust.
- Deep experience with distributed systems, search infrastructure, indexing, data pipelines, cloud infrastructure, and Kubernetes or similar orchestration.
- Experience with information retrieval, ranking, vector search, embeddings, or ML/LLM product infrastructure is a strong plus.
- Comfortable working with senior engineering and research teams in ambiguous product areas.
- Based in the United States, ideally San Francisco, New York City, or Seattle; hybrid-friendly.
`.trim();

function ms(startedAt: number) {
  return Date.now() - startedAt;
}

function seconds(value: number) {
  return `${(value / 1000).toFixed(1)}s`;
}

function getRecallMetadata(search: SearchSnapshot) {
  return search.parsed_requirements?.recall_metadata as JsonRecord | undefined;
}

function getDisplayStats(search: SearchSnapshot) {
  return search.parsed_requirements?.display_stats as JsonRecord | undefined;
}

function getSnapshotIds(search: SearchSnapshot) {
  const recall = getRecallMetadata(search);
  const ids: string[] = [];
  if (typeof recall?.snapshot_id === "string") ids.push(recall.snapshot_id);
  const additional = Array.isArray(recall?.additional_snapshots)
    ? recall.additional_snapshots
    : [];
  for (const item of additional) {
    if (item && typeof item === "object" && typeof (item as JsonRecord).snapshot_id === "string") {
      ids.push((item as JsonRecord).snapshot_id as string);
    }
  }
  return ids;
}

function getRecallCost(search: SearchSnapshot) {
  const recall = getRecallMetadata(search);
  return typeof recall?.cost === "number" ? recall.cost : 0;
}

function maskEmail(value: unknown) {
  if (typeof value !== "string" || !value.includes("@")) return value;
  const [name, domain] = value.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}

function parseOutreachDraft(value: string | null) {
  if (!value) return { subject: null, linkedin: null, email: null };
  try {
    const parsed = JSON.parse(value) as JsonRecord;
    return {
      subject: typeof parsed.subject === "string" ? parsed.subject : null,
      linkedin: typeof parsed.linkedin === "string" ? parsed.linkedin : null,
      email: typeof parsed.email === "string" ? parsed.email : null,
    };
  } catch {
    return { subject: null, linkedin: value.slice(0, 240), email: null };
  }
}

async function readSearch(searchId: string): Promise<SearchSnapshot> {
  const { data, error } = await supabase
    .from("hirelix_searches")
    .select("id,status,pipeline_step,error_message,warning_message,parsed_requirements")
    .eq("id", searchId)
    .single();

  if (error || !data) throw error || new Error(`search_not_found:${searchId}`);
  return data as SearchSnapshot;
}

async function readJob(jobId: string) {
  const { data } = await supabase
    .from("hirelix_search_jobs")
    .select("id,status,attempt_count,available_at,locked_at,started_at,finished_at,last_error")
    .eq("id", jobId)
    .maybeSingle();
  return data as JsonRecord | null;
}

async function readCandidates(searchId: string) {
  const { data, error } = await supabase
    .from("hirelix_candidates")
    .select("name,headline,location,skills,match_score,match_reasons,profile_url,github_url,email,outreach_draft,metadata")
    .eq("search_id", searchId)
    .order("match_score", { ascending: false });

  if (error) throw error;
  return (data ?? []) as CandidateRow[];
}

async function readNotifications(searchId: string) {
  const { data } = await supabase
    .from("hirelix_search_notifications")
    .select("kind,channel,status,recipient,provider_message_id,last_error,created_at,sent_at,updated_at")
    .eq("search_id", searchId)
    .order("created_at", { ascending: true });
  return (data ?? []) as JsonRecord[];
}

async function readSnapshotProfilesBySearch(searchId: string) {
  const { data } = await supabase
    .from("hirelix_snapshot_profiles")
    .select("snapshot_id,search_id,source_round,record_index,linkedin_id,profile_url")
    .eq("search_id", searchId)
    .order("source_round", { ascending: true })
    .order("record_index", { ascending: true });
  return (data ?? []) as JsonRecord[];
}

async function readSnapshotProfilesBySnapshots(snapshotIds: string[]) {
  if (snapshotIds.length === 0) return [];
  const { data } = await supabase
    .from("hirelix_snapshot_profiles")
    .select("snapshot_id,search_id,source_round,record_index,linkedin_id,profile_url")
    .in("snapshot_id", snapshotIds)
    .order("source_round", { ascending: true })
    .order("record_index", { ascending: true });
  return (data ?? []) as JsonRecord[];
}

function summarizeProfileRows(rows: JsonRecord[]) {
  const byRound = new Map<string, { count: number; ordered: boolean; maxIndex: number }>();
  for (const row of rows) {
    const round = typeof row.source_round === "string" ? row.source_round : "unknown";
    const index = typeof row.record_index === "number" ? row.record_index : -1;
    const current = byRound.get(round) ?? { count: 0, ordered: true, maxIndex: -1 };
    current.ordered = current.ordered && index >= current.maxIndex;
    current.count += 1;
    current.maxIndex = Math.max(current.maxIndex, index);
    byRound.set(round, current);
  }
  return Array.from(byRound.entries()).map(([round, value]) => ({ round, ...value }));
}

function printSearchProgress(label: string, poll: number, processorMs: number, search: SearchSnapshot, job: JsonRecord | null) {
  const recall = getRecallMetadata(search);
  const stats = getDisplayStats(search);
  const additional = Array.isArray(recall?.additional_snapshots) ? recall.additional_snapshots : [];
  console.log(`[${label}] poll=${poll} processor=${seconds(processorMs)} status=${search.status} step=${search.pipeline_step} job=${job?.status ?? "unknown"} attempts=${job?.attempt_count ?? "?"}`);
  console.log(`[${label}]   recall_status=${recall?.status ?? "-"} snapshot=${recall?.snapshot_id ?? "-"} dataset=${recall?.dataset_size ?? "-"} returned=${recall?.bright_profiles_returned ?? "-"} cost=${recall?.cost ?? "-"} additional=${additional.length}`);
  console.log(`[${label}]   stats visible=${stats?.visible_candidate_count ?? "-"} deep=${stats?.deep_review_completed_count ?? "-"}/${stats?.deep_review_requested_count ?? "-"} first_ready=${stats?.time_to_first_shortlist_candidate_ms ?? "-"}ms reviewable=${stats?.time_to_reviewable_ms ?? "-"}ms`);
}

async function printRunArtifacts(run: RunResult, reusableRows: JsonRecord[]) {
  const recall = getRecallMetadata(run.search);
  const stats = getDisplayStats(run.search);
  const notifications = await readNotifications(run.searchId);
  const ownProfileRows = await readSnapshotProfilesBySearch(run.searchId);

  console.log(`\n[${run.label}] FINAL status=${run.status} elapsed=${seconds(run.elapsedMs)} search_id=${run.searchId}`);
  console.log(`[${run.label}] recall_metadata=${JSON.stringify({
    snapshot_id: recall?.snapshot_id ?? null,
    status: recall?.status ?? null,
    dataset_size: recall?.dataset_size ?? null,
    cost: recall?.cost ?? null,
    bright_profiles_requested: recall?.bright_profiles_requested ?? null,
    bright_profiles_returned: recall?.bright_profiles_returned ?? null,
    additional_snapshots: recall?.additional_snapshots ?? [],
    snapshot_profile_persist_warning: recall?.snapshot_profile_persist_warning ?? null,
  })}`);
  console.log(`[${run.label}] display_stats=${JSON.stringify({
    visible_candidate_count: stats?.visible_candidate_count ?? null,
    priority_outreach_count: stats?.priority_outreach_count ?? null,
    worth_reviewing_count: stats?.worth_reviewing_count ?? null,
    ruled_out_count: stats?.ruled_out_count ?? null,
    strong_now_count: stats?.strong_now_count ?? null,
    consider_next_count: stats?.consider_next_count ?? null,
    do_not_show_count: stats?.do_not_show_count ?? null,
    bright_snapshot_cost: stats?.bright_snapshot_cost ?? null,
    estimated_llm_cost: stats?.estimated_llm_cost ?? null,
    estimated_search_total_cost: stats?.estimated_search_total_cost ?? null,
    time_to_standard_recall_ready_ms: stats?.time_to_standard_recall_ready_ms ?? null,
    final_ready_latency_ms: stats?.final_ready_latency_ms ?? null,
  })}`);
  console.log(`[${run.label}] snapshot_profiles_by_search=${JSON.stringify(summarizeProfileRows(ownProfileRows))}`);
  console.log(`[${run.label}] reusable_snapshot_profiles=${JSON.stringify(summarizeProfileRows(reusableRows))}`);
  console.log(`[${run.label}] notifications=${JSON.stringify(notifications.map((row) => ({
    kind: row.kind,
    channel: row.channel,
    status: row.status,
    recipient: maskEmail(row.recipient),
    provider_message_id: row.provider_message_id ? "present" : null,
    last_error: row.last_error ?? null,
    sent_at: row.sent_at ?? null,
  })))}`);

  for (const [index, candidate] of run.candidates.slice(0, 8).entries()) {
    const suitability = candidate.metadata?.suitability as JsonRecord | undefined;
    const outreach = parseOutreachDraft(candidate.outreach_draft);
    console.log(`[${run.label}] candidate_${index + 1}=${JSON.stringify({
      name: candidate.name,
      headline: candidate.headline,
      location: candidate.location,
      score: candidate.match_score,
      quality_score: suitability?.quality_score ?? null,
      advance_recommendation: suitability?.advance_recommendation ?? null,
      blocking_severity: suitability?.blocking_severity ?? null,
      reasons: candidate.match_reasons ?? [],
      profile_url: candidate.profile_url,
      github_url: candidate.github_url,
      has_email: Boolean(candidate.email),
      outreach_subject: outreach.subject,
      outreach_linkedin_preview: outreach.linkedin?.slice(0, 220) ?? null,
      outreach_email_preview: outreach.email?.slice(0, 220) ?? null,
    })}`);
  }
}

async function createAndRunSearch(label: string): Promise<RunResult> {
  const { initializeGlobalOutboundProxy } = await import("../../src/lib/server-outbound-proxy");
  initializeGlobalOutboundProxy();

  const { enqueueSearchJob, processNextSearchJob } = await import("../../src/lib/search-jobs.ts");

  console.log(`\n${"=".repeat(80)}`);
  console.log(`[${label}] creating search with Bright limits standard=50 hidden_gem=25 company_target=25`);

  const now = new Date().toISOString();
  const { data: search, error: insertError } = await supabase
    .from("hirelix_searches")
    .insert({
      user_id: USER_ID,
      jd_text: JD_TEXT,
      status: "queued",
      pipeline_step: "queued",
      parsed_requirements: {
        candidate_count: 20,
        display_count: 20,
        highlight_count: 5,
        requested_candidate_count: 20,
        outreach_pool_target: 20,
      },
      queued_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (insertError || !search) throw insertError || new Error("create_search_failed");
  const searchId = search.id as string;

  const enqueueResult = await enqueueSearchJob({
    searchId,
    userId: USER_ID,
    jdText: JD_TEXT,
    candidateCount: 20,
  });
  const enqueuePayload = enqueueResult as JsonRecord;
  const jobId = typeof enqueuePayload.job_id === "string"
    ? enqueuePayload.job_id
    : typeof enqueuePayload.jobId === "string"
      ? enqueuePayload.jobId
      : typeof enqueuePayload.id === "string"
        ? enqueuePayload.id
        : "unknown";

  console.log(`[${label}] search_id=${searchId} job_id=${jobId}`);

  const startedAt = Date.now();
  const terminalStatuses = new Set(["done", "degraded", "error"]);
  let lastSignature = "";

  for (let poll = 0; poll < 240; poll += 1) {
    const processStartedAt = Date.now();
    const result = await processNextSearchJob(searchId);
    const processorMs = ms(processStartedAt);
    const currentSearch = await readSearch(searchId);
    const currentJob = jobId === "unknown" ? null : await readJob(jobId);
    const signature = [
      currentSearch.status,
      currentSearch.pipeline_step,
      currentJob?.status,
      getRecallMetadata(currentSearch)?.status,
      getDisplayStats(currentSearch)?.deep_review_completed_count,
    ].join("|");

    if (signature !== lastSignature || processorMs > 5000 || terminalStatuses.has(currentSearch.status || "")) {
      printSearchProgress(label, poll, processorMs, currentSearch, currentJob);
      lastSignature = signature;
    } else {
      console.log(`[${label}] poll=${poll} processor=${seconds(processorMs)} processed=${result.processed} hasMore=${result.hasMore}`);
    }

    if (currentSearch.status && terminalStatuses.has(currentSearch.status)) {
      const candidates = await readCandidates(searchId);
      return {
        label,
        searchId,
        jobId,
        status: currentSearch.status,
        elapsedMs: ms(startedAt),
        snapshotIds: getSnapshotIds(currentSearch),
        recallCost: getRecallCost(currentSearch),
        candidates,
        search: currentSearch,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error(`[${label}] timed out`);
}

function compareRuns(run1: RunResult, run2: RunResult) {
  const run1Set = new Set(run1.snapshotIds);
  const reused = run2.snapshotIds.filter((snapshotId) => run1Set.has(snapshotId));
  const newSnapshots = run2.snapshotIds.filter((snapshotId) => !run1Set.has(snapshotId));
  const fullReuse = run2.snapshotIds.length > 0 && newSnapshots.length === 0;

  console.log(`\n${"=".repeat(80)}`);
  console.log(`[COMPARE] run1_snapshots=${JSON.stringify(run1.snapshotIds)}`);
  console.log(`[COMPARE] run2_snapshots=${JSON.stringify(run2.snapshotIds)}`);
  console.log(`[COMPARE] reused=${JSON.stringify(reused)} new=${JSON.stringify(newSnapshots)} full_reuse=${fullReuse}`);
  console.log(`[COMPARE] run1_reported_bright_cost=${run1.recallCost}`);
  console.log(`[COMPARE] run2_reported_recall_cost=${run2.recallCost}`);
  console.log(`[COMPARE] run2_incremental_bright_cost_estimate=${fullReuse ? 0 : run2.recallCost}`);
  console.log(`[COMPARE] run1_candidates=${run1.candidates.length} run2_candidates=${run2.candidates.length}`);
}

async function main() {
  console.log("[CONFIG]", JSON.stringify({
    execution_mode: process.env.SEARCH_EXECUTION_MODE,
    standard_limit: process.env.SEARCH_TEST_BRIGHTDATA_STANDARD_LIMIT,
    hidden_gem_limit: process.env.SEARCH_TEST_BRIGHTDATA_HIDDEN_GEM_LIMIT,
    company_target_limit: process.env.SEARCH_TEST_BRIGHTDATA_COMPANY_TARGET_LIMIT,
    llm_provider: process.env.AI_PROVIDER,
    notifications_enabled: process.env.SEARCH_NOTIFICATIONS_ENABLED,
    proxy_enabled: process.env.PROXY_ENABLED ?? null,
    jd_source: "https://boards.greenhouse.io/embed/job_app?token=4738780008",
  }));

  const run1 = await createAndRunSearch("RUN-1");
  const run1ReusableRows = await readSnapshotProfilesBySnapshots(run1.snapshotIds);
  await printRunArtifacts(run1, run1ReusableRows);

  const run2 = await createAndRunSearch("RUN-2");
  const run2ReusableRows = await readSnapshotProfilesBySnapshots(run2.snapshotIds);
  await printRunArtifacts(run2, run2ReusableRows);

  compareRuns(run1, run2);

  console.log("[FINAL_JSON]" + JSON.stringify({
    run1: {
      search_id: run1.searchId,
      status: run1.status,
      elapsed_ms: run1.elapsedMs,
      snapshot_ids: run1.snapshotIds,
      reported_bright_cost: run1.recallCost,
      candidate_count: run1.candidates.length,
    },
    run2: {
      search_id: run2.searchId,
      status: run2.status,
      elapsed_ms: run2.elapsedMs,
      snapshot_ids: run2.snapshotIds,
      reported_recall_cost: run2.recallCost,
      candidate_count: run2.candidates.length,
      full_db_reuse: run2.snapshotIds.length > 0 && run2.snapshotIds.every((snapshotId) => run1.snapshotIds.includes(snapshotId)),
    },
  }));
}

main().catch((error) => {
  console.error("fatal:", error);
  process.exit(1);
});
