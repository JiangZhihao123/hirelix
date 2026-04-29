import { supabaseAdmin } from "@/lib/supabase-server";
import { nowIso } from "@/lib/search/normalize";
import type {
  CandidateRowInput,
  LlmUsageEventPayload,
} from "@/lib/search/types";

export type SnapshotCacheEntry = {
  snapshotId: string;
  datasetSize: number | null;
  cost: number | null;
  expiresAt: string;
};

export type SnapshotProfilePersistResult = {
  ok: boolean;
  rowCount: number;
  error?: unknown;
};

const DEFAULT_SNAPSHOT_CACHE_TTL_DAYS = 14;

export function getSnapshotCacheTtlDays() {
  const raw = process.env.BRIGHTDATA_SNAPSHOT_CACHE_TTL_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SNAPSHOT_CACHE_TTL_DAYS;
  return Math.min(parsed, 30);
}

function buildCandidatePayload(searchId: string, row: CandidateRowInput) {
  return {
    search_id: searchId,
    name: row.name,
    headline: row.headline,
    location: row.location,
    skills: row.skills,
    experience_years: row.experience_years,
    match_score: row.match_score,
    match_reasons: row.match_reasons,
    profile_url: row.profile_url,
    github_url: row.github_url,
    email: row.email,
    outreach_draft: row.outreach_draft,
    metadata: row.metadata,
  };
}

function formatDbError(error: unknown) {
  if (!error || typeof error !== "object") return String(error);
  const record = error as Record<string, unknown>;
  const message = typeof record.message === "string" ? record.message : "Unknown database error";
  const code = typeof record.code === "string" ? ` code=${record.code}` : "";
  const details = typeof record.details === "string" ? ` details=${record.details}` : "";
  return `${message}${code}${details}`;
}

async function waitBeforeRetry(attempt: number) {
  await new Promise((resolve) => setTimeout(resolve, attempt * 500));
}

function safeInt(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : fallback;
}

type LlmUsageEventRow = {
  search_id: string | null;
  job_id: string | null;
  user_id: string | null;
  stage: string;
  status: string;
  model: string;
  provider: string;
  attempt: number;
  batch_size: number | null;
  candidate_indexes: number[] | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens: number;
  cache_miss_input_tokens: number;
  max_output_tokens: number | null;
  thinking: string | null;
  reasoning_effort: string | null;
  latency_ms: number | null;
  error_message: string | null;
  request_hash: string | null;
  response_hash: string | null;
  request_payload: unknown;
  response_payload: unknown;
  metadata: Record<string, unknown>;
};

type LlmUsageWriterState = {
  queue: LlmUsageEventRow[];
  flushPromise: Promise<void> | null;
  flushTimer: ReturnType<typeof setTimeout> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __hirelixLlmUsageWriterState__: LlmUsageWriterState | undefined;
}

function getLlmUsageWriterState() {
  if (!globalThis.__hirelixLlmUsageWriterState__) {
    globalThis.__hirelixLlmUsageWriterState__ = {
      queue: [],
      flushPromise: null,
      flushTimer: null,
    };
  }
  return globalThis.__hirelixLlmUsageWriterState__;
}

function getLlmUsageWriteBatchSize() {
  const raw = process.env.SEARCH_LLM_USAGE_WRITE_BATCH_SIZE;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 25;
  return Math.min(Math.max(parsed, 1), 100);
}

function buildLlmUsageEventRow(payload: LlmUsageEventPayload): LlmUsageEventRow {
  return {
    search_id: payload.searchId || null,
    job_id: payload.jobId || null,
    user_id: payload.userId || null,
    stage: payload.stage,
    status: payload.status || "success",
    model: payload.model,
    provider: payload.provider || "deepseek",
    attempt: safeInt(payload.attempt, 1) || 1,
    batch_size:
      typeof payload.batchSize === "number" && Number.isFinite(payload.batchSize)
        ? Math.max(0, Math.round(payload.batchSize))
        : null,
    candidate_indexes: Array.isArray(payload.candidateIndexes)
      ? payload.candidateIndexes
          .filter((value) => Number.isInteger(value))
          .map((value) => Math.max(0, Math.round(value)))
      : null,
    input_tokens: safeInt(payload.inputTokens),
    output_tokens: safeInt(payload.outputTokens),
    total_tokens: safeInt(payload.totalTokens),
    cached_input_tokens: safeInt(payload.cachedInputTokens),
    cache_miss_input_tokens: safeInt(payload.cacheMissInputTokens),
    max_output_tokens:
      typeof payload.maxOutputTokens === "number" && Number.isFinite(payload.maxOutputTokens)
        ? Math.max(0, Math.round(payload.maxOutputTokens))
        : null,
    thinking: payload.thinking || null,
    reasoning_effort: payload.reasoningEffort || null,
    latency_ms:
      typeof payload.latencyMs === "number" && Number.isFinite(payload.latencyMs)
        ? Math.max(0, Math.round(payload.latencyMs))
        : null,
    error_message: payload.errorMessage || null,
    request_hash: payload.requestHash || null,
    response_hash: payload.responseHash || null,
    request_payload: payload.requestPayload ?? null,
    response_payload: payload.responsePayload ?? null,
    metadata: payload.metadata || {},
  };
}

async function insertLlmUsageEventRows(rows: LlmUsageEventRow[]) {
  if (!rows.length) return;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { error } = await supabaseAdmin
      .from("hirelix_llm_usage_events")
      .insert(rows);

    if (!error) return;

    const retrying = attempt < 3;
    console.error("[search_persistence] recordLlmUsageEvent failed", {
      batch_size: rows.length,
      stages: [...new Set(rows.map((row) => row.stage))],
      search_id: rows[0]?.search_id,
      attempt,
      retrying,
      error: formatDbError(error),
    });

    if (retrying) {
      await waitBeforeRetry(attempt);
    }
  }
}

async function drainLlmUsageQueue() {
  const state = getLlmUsageWriterState();
  const batchSize = getLlmUsageWriteBatchSize();

  while (state.queue.length > 0) {
    const rows = state.queue.splice(0, batchSize);
    await insertLlmUsageEventRows(rows);
  }
}

function scheduleLlmUsageFlush() {
  const state = getLlmUsageWriterState();
  if (state.flushPromise || state.flushTimer) return;

  state.flushTimer = setTimeout(() => {
    state.flushTimer = null;
    state.flushPromise = drainLlmUsageQueue()
      .catch((error) => {
        console.error("[search_persistence] llm usage flush failed", {
          error: formatDbError(error),
        });
      })
      .finally(() => {
        state.flushPromise = null;
        if (state.queue.length > 0) {
          scheduleLlmUsageFlush();
        }
      });
  }, 250);
}

export async function recordLlmUsageEvent(payload: LlmUsageEventPayload) {
  const state = getLlmUsageWriterState();
  state.queue.push(buildLlmUsageEventRow(payload));
  scheduleLlmUsageFlush();
}

export async function flushPendingLlmUsageEvents() {
  const state = getLlmUsageWriterState();
  if (state.flushTimer) {
    clearTimeout(state.flushTimer);
    state.flushTimer = null;
  }
  if (!state.flushPromise) {
    state.flushPromise = drainLlmUsageQueue()
      .catch((error) => {
        console.error("[search_persistence] llm usage flush failed", {
          error: formatDbError(error),
        });
      })
      .finally(() => {
        state.flushPromise = null;
      });
  }

  while (state.flushPromise) {
    const current: Promise<void> = state.flushPromise;
    await current;
    if (state.flushPromise === current && state.queue.length === 0) return;
    if (state.queue.length > 0) scheduleLlmUsageFlush();
  }
}

export async function setSearchStatus(
  searchId: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  const payload = {
    status,
    pipeline_step: status === "degraded" ? "done" : status,
    updated_at: nowIso(),
    ...extra,
  };

  const maxAttempts = 3;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data, error } = await supabaseAdmin
        .from("hirelix_searches")
        .update(payload)
        .eq("id", searchId)
        .select("id")
        .maybeSingle();

      if (!error && data?.id) {
        lastError = null;
        break;
      }

      lastError = error ?? new Error("Search status update matched no rows");
    } catch (error) {
      lastError = error;
    }

    console.error("[search_persistence] setSearchStatus failed", {
      search_id: searchId,
      status,
      attempt,
      retrying: attempt < maxAttempts,
      error: formatDbError(lastError),
    });

    if (attempt < maxAttempts) {
      await waitBeforeRetry(attempt);
    }
  }

  if (lastError) {
    throw new Error(
      `Failed to update search ${searchId} to ${status}: ${formatDbError(lastError)}`,
    );
  }

  if (status === "error" || status === "degraded" || status === "done") {
    const terminalJobPayload: Record<string, unknown> = {
      status: status === "error" ? "fatal_error" : "done",
      updated_at: nowIso(),
      locked_at: null,
      finished_at: nowIso(),
      last_error: status === "error"
        ? (typeof extra.error_message === "string" && extra.error_message.length > 0
          ? extra.error_message
          : "Search entered an error state")
        : null,
    };

    if (status === "error") {
      terminalJobPayload.available_at = nowIso();
    }

    const { error } = await supabaseAdmin
      .from("hirelix_search_jobs")
      .update(terminalJobPayload)
      .eq("search_id", searchId)
      .eq("status", "running");
    if (error) {
      console.error("[search_persistence] terminal job update failed", {
        search_id: searchId,
        status,
        error: formatDbError(error),
      });
    }
  }
}

export async function lookupCachedSnapshot(filterHash: string): Promise<SnapshotCacheEntry | null> {
  try {
    const { data } = await supabaseAdmin
      .from("hirelix_dataset_snapshots")
      .select("snapshot_id, dataset_size, cost, expires_at")
      .eq("filter_hash", filterHash)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data?.snapshot_id || !data.expires_at) return null;
    return {
      snapshotId: data.snapshot_id as string,
      datasetSize: typeof data.dataset_size === "number" ? data.dataset_size : null,
      cost: typeof data.cost === "number" ? data.cost : null,
      expiresAt: data.expires_at as string,
    };
  } catch {
    return null;
  }
}

export async function cacheSnapshotEntry(params: {
  snapshotId: string;
  round: string;
  filterHash: string;
  filterSummary: unknown;
  recordsLimit: number;
}): Promise<void> {
  const expiresAt = new Date(Date.now() + getSnapshotCacheTtlDays() * 24 * 60 * 60 * 1000).toISOString();
  try {
    await supabaseAdmin.from("hirelix_dataset_snapshots").upsert(
      {
        snapshot_id: params.snapshotId,
        round: params.round,
        filter_hash: params.filterHash,
        filter_summary: params.filterSummary ?? null,
        records_limit: params.recordsLimit,
        expires_at: expiresAt,
      },
      { onConflict: "snapshot_id" },
    );
  } catch {
    // Non-critical
  }
}

export async function expireCachedSnapshot(snapshotId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("hirelix_dataset_snapshots")
      .update({ expires_at: new Date(0).toISOString() })
      .eq("snapshot_id", snapshotId);
  } catch {
    // Non-critical
  }
}

export async function loadCachedSnapshotProfiles(
  snapshotId: string,
  sourceRound: string,
): Promise<Record<string, unknown>[] | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("hirelix_snapshot_profiles")
      .select("raw_data")
      .eq("snapshot_id", snapshotId)
      .eq("source_round", sourceRound)
      .order("record_index", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[snapshot_profiles] load error", { snapshotId, sourceRound, error });
      return null;
    }
    if (!data || data.length === 0) return null;

    return data
      .map((row) => row.raw_data)
      .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object");
  } catch (error) {
    console.error("[snapshot_profiles] load failed", { snapshotId, sourceRound, error });
    return null;
  }
}

export async function persistSnapshotProfiles(
  records: Record<string, unknown>[],
  params: {
    snapshotId: string;
    searchId: string;
    jobId: string;
    sourceRound: string;
  },
): Promise<SnapshotProfilePersistResult> {
  console.log(
    `[snapshot_profiles] persist called: snapshot=${params.snapshotId} round=${params.sourceRound} records=${records.length}`,
  );
  if (records.length === 0) return { ok: true, rowCount: 0 };

  const rows = records.map((record, index) => {
    const linkedinId =
      typeof record.linkedin_id === "string" && record.linkedin_id
        ? record.linkedin_id
        : typeof record.id === "string" && record.id
          ? record.id
          : null;
    const profileUrl =
      typeof record.url === "string" && record.url
        ? record.url
        : typeof record.input_url === "string" && record.input_url
          ? record.input_url
          : record.input && typeof (record.input as Record<string, unknown>).url === "string"
            ? (record.input as Record<string, unknown>).url as string
            : null;
    return {
      snapshot_id: params.snapshotId,
      search_id: params.searchId,
      job_id: params.jobId,
      source_round: params.sourceRound,
      record_index: index,
      linkedin_id: linkedinId,
      profile_url: profileUrl,
      raw_data: record,
    };
  });

  try {
    const { error: deleteError } = await supabaseAdmin
      .from("hirelix_snapshot_profiles")
      .delete()
      .eq("snapshot_id", params.snapshotId)
      .eq("source_round", params.sourceRound);
    if (deleteError) console.error("[snapshot_profiles] delete error", deleteError);

    const batchSize = 50;
    for (let index = 0; index < rows.length; index += batchSize) {
      const { error: insertError } = await supabaseAdmin
        .from("hirelix_snapshot_profiles")
        .insert(rows.slice(index, index + batchSize));
      if (insertError) {
        console.error(`[snapshot_profiles] insert error batch i=${index}`, insertError);
        throw insertError;
      }
    }

    console.log(
      `[snapshot_profiles] persisted ${rows.length} rows for snapshot=${params.snapshotId} round=${params.sourceRound}`,
    );
    return { ok: true, rowCount: rows.length };
  } catch (error) {
    console.error("[snapshot_profiles] persist failed", params.snapshotId, error);
    return { ok: false, rowCount: 0, error };
  }
}

export async function updateCachedSnapshotMetadata(
  snapshotId: string,
  update: { datasetSize?: number | null; cost?: number | null },
): Promise<void> {
  try {
    await supabaseAdmin
      .from("hirelix_dataset_snapshots")
      .update({
        ...(update.datasetSize != null && { dataset_size: update.datasetSize }),
        ...(update.cost != null && { cost: update.cost }),
      })
      .eq("snapshot_id", snapshotId);
  } catch {
    // Non-critical
  }
}

export async function updateSearchParsedRequirements(
  searchId: string,
  parsed: Record<string, unknown>,
) {
  const maxAttempts = 3;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data, error } = await supabaseAdmin
        .from("hirelix_searches")
        .update({
          parsed_requirements: parsed,
          updated_at: nowIso(),
        })
        .eq("id", searchId)
        .select("id")
        .maybeSingle();

      if (!error && data?.id) {
        return;
      }

      lastError = error ?? new Error("Parsed requirements update matched no rows");
    } catch (error) {
      lastError = error;
    }

    console.error("[search_persistence] updateSearchParsedRequirements failed", {
      search_id: searchId,
      attempt,
      retrying: attempt < maxAttempts,
      error: formatDbError(lastError),
    });

    if (attempt < maxAttempts) {
      await waitBeforeRetry(attempt);
    }
  }

  throw new Error(
    `Failed to update parsed requirements for search ${searchId}: ${formatDbError(lastError)}`,
  );
}

export async function updateSearchUsageEventMetadata(
  searchId: string,
  metadataPatch: Record<string, unknown>,
) {
  const { data: event } = await supabaseAdmin
    .from("hirelix_usage_events")
    .select("id, metadata")
    .eq("related_id", searchId)
    .eq("event_type", "search_created")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!event?.id) return;

  const currentMetadata =
    event.metadata && typeof event.metadata === "object"
      ? (event.metadata as Record<string, unknown>)
      : {};

  await supabaseAdmin
    .from("hirelix_usage_events")
    .update({
      metadata: {
        ...currentMetadata,
        ...metadataPatch,
      },
    })
    .eq("id", event.id);
}

export async function upsertCandidatesForSearch(
  searchId: string,
  rows: CandidateRowInput[],
  options?: { replaceMissing?: boolean },
) {
  const { data: existingRows } = await supabaseAdmin
    .from("hirelix_candidates")
    .select("id, name, profile_url")
    .eq("search_id", searchId);

  const existing = existingRows || [];
  const matchedIds = new Set<string>();
  const inserts: Record<string, unknown>[] = [];

  for (const row of rows) {
    const existingMatch = existing.find((candidate) => {
      if (row.profile_url && candidate.profile_url) {
        return candidate.profile_url === row.profile_url;
      }
      return candidate.name.toLowerCase() === row.name.toLowerCase();
    });

    const payload = buildCandidatePayload(searchId, row);

    if (existingMatch) {
      matchedIds.add(existingMatch.id);
      await supabaseAdmin
        .from("hirelix_candidates")
        .update(payload)
        .eq("id", existingMatch.id);
    } else {
      inserts.push(payload);
    }
  }

  if (inserts.length > 0) {
    await supabaseAdmin.from("hirelix_candidates").insert(inserts);
  }

  if (options?.replaceMissing) {
    const idsToDelete = existing
      .filter((candidate) => !matchedIds.has(candidate.id))
      .map((candidate) => candidate.id);

    if (idsToDelete.length > 0) {
      await supabaseAdmin.from("hirelix_candidates").delete().in("id", idsToDelete);
    }
  }
}

export async function upsertSingleCandidate(searchId: string, row: CandidateRowInput) {
  const payload = buildCandidatePayload(searchId, row);

  if (row.profile_url) {
    const { data: existing } = await supabaseAdmin
      .from("hirelix_candidates")
      .select("id")
      .eq("search_id", searchId)
      .eq("profile_url", row.profile_url)
      .limit(1)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin.from("hirelix_candidates").update(payload).eq("id", existing.id);
      return;
    }
  }

  await supabaseAdmin.from("hirelix_candidates").insert(payload);
}

export async function retagSearchCandidatePoolTypes(searchId: string) {
  const { data: candidates } = await supabaseAdmin
    .from("hirelix_candidates")
    .select("id, match_score, metadata")
    .eq("search_id", searchId)
    .order("match_score", { ascending: false });

  if (!candidates?.length) return;

  for (const candidate of candidates) {
    const metadata =
      candidate.metadata && typeof candidate.metadata === "object"
        ? { ...(candidate.metadata as Record<string, unknown>) }
        : {};
    const nextPoolType = "main";
    if (metadata.pool_type === nextPoolType) continue;
    metadata.pool_type = nextPoolType;
    await supabaseAdmin
      .from("hirelix_candidates")
      .update({ metadata })
      .eq("id", candidate.id);
  }
}

export async function countCandidatesForSearch(searchId: string) {
  const { count } = await supabaseAdmin
    .from("hirelix_candidates")
    .select("id", { count: "exact", head: true })
    .eq("search_id", searchId);

  return count || 0;
}
