import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  hirelix_candidates,
  hirelix_dataset_snapshots,
  hirelix_llm_usage_events,
  hirelix_search_jobs,
  hirelix_searches,
  hirelix_snapshot_profiles,
  hirelix_usage_events,
} from "@/db/schema";
import { toJsonbSafeRecord } from "@/lib/jsonb-safe";
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
    metadata: toJsonbSafeRecord(row.metadata),
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

const SEARCH_TIMESTAMP_FIELDS = new Set([
  "queued_at",
  "parse_completed_at",
  "search_completed_at",
  "partial_ready_at",
  "done_at",
  "created_at",
  "updated_at",
]);

function normalizeTimestampFields(
  patch: Record<string, unknown>,
  timestampFields: Set<string>,
) {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => {
      if (typeof value === "string" && timestampFields.has(key)) {
        const date = new Date(value);
        if (!Number.isNaN(date.valueOf())) return [key, date];
      }
      return [key, value];
    }),
  );
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
    request_payload: null,
    response_payload: null,
    metadata: toJsonbSafeRecord(payload.metadata || {}),
  };
}

async function insertLlmUsageEventRows(rows: LlmUsageEventRow[]) {
  if (!rows.length) return;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await db.insert(hirelix_llm_usage_events).values(
        rows.map((row) => ({
          search_id: row.search_id,
          job_id: row.job_id,
          user_id: row.user_id,
          stage: row.stage,
          status: row.status,
          model: row.model,
          provider: row.provider,
          attempt: row.attempt,
          batch_size: row.batch_size,
          candidate_indexes: row.candidate_indexes,
          input_tokens: row.input_tokens,
          output_tokens: row.output_tokens,
          total_tokens: row.total_tokens,
          cached_input_tokens: row.cached_input_tokens,
          cache_miss_input_tokens: row.cache_miss_input_tokens,
          max_output_tokens: row.max_output_tokens,
          thinking: row.thinking,
          reasoning_effort: row.reasoning_effort,
          latency_ms: row.latency_ms,
          error_message: row.error_message,
          request_hash: row.request_hash,
          response_hash: row.response_hash,
          request_payload: row.request_payload,
          response_payload: row.response_payload,
          metadata: row.metadata,
        })),
      );
      return;
    } catch (error) {
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
      } else {
        return;
      }
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
  const normalizedExtra = normalizeTimestampFields(
    sanitizeSearchJsonbPatch(extra),
    SEARCH_TIMESTAMP_FIELDS,
  );
  const payload = {
    status,
    pipeline_step: status === "degraded" ? "done" : status,
    updated_at: new Date(),
    ...normalizedExtra,
  };

  const maxAttempts = 3;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const updated = await db
        .update(hirelix_searches)
        .set(payload)
        .where(eq(hirelix_searches.id, searchId))
        .returning({ id: hirelix_searches.id });

      if (updated[0]?.id) {
        lastError = null;
        break;
      }

      lastError = new Error("Search status update matched no rows");
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
    const ts = new Date();
    const terminalJobPayload: Record<string, unknown> = {
      status: status === "error" ? "fatal_error" : "done",
      updated_at: ts,
      locked_at: null,
      finished_at: ts,
      last_error:
        status === "error"
          ? typeof extra.error_message === "string" && extra.error_message.length > 0
            ? extra.error_message
            : "Search entered an error state"
          : null,
    };

    if (status === "error") {
      terminalJobPayload.available_at = ts;
    }

    try {
      await db
        .update(hirelix_search_jobs)
        .set(terminalJobPayload)
        .where(
          and(
            eq(hirelix_search_jobs.search_id, searchId),
            eq(hirelix_search_jobs.status, "running"),
          ),
        );
    } catch (error) {
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
    const rows = await db
      .select({
        snapshot_id: hirelix_dataset_snapshots.snapshot_id,
        dataset_size: hirelix_dataset_snapshots.dataset_size,
        cost: hirelix_dataset_snapshots.cost,
        expires_at: hirelix_dataset_snapshots.expires_at,
      })
      .from(hirelix_dataset_snapshots)
      .where(
        and(
          eq(hirelix_dataset_snapshots.filter_hash, filterHash),
          gt(hirelix_dataset_snapshots.expires_at, new Date()),
        ),
      )
      .orderBy(desc(hirelix_dataset_snapshots.created_at))
      .limit(1);
    const data = rows[0];
    if (!data?.snapshot_id || !data.expires_at) return null;
    return {
      snapshotId: data.snapshot_id,
      datasetSize: typeof data.dataset_size === "number" ? data.dataset_size : null,
      cost:
        data.cost === null || data.cost === undefined
          ? null
          : typeof data.cost === "number"
            ? data.cost
            : Number(data.cost),
      expiresAt: data.expires_at.toISOString(),
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
  const expiresAt = new Date(Date.now() + getSnapshotCacheTtlDays() * 24 * 60 * 60 * 1000);
  try {
    const values = {
      snapshot_id: params.snapshotId,
      round: params.round,
      filter_hash: params.filterHash,
      filter_summary:
        params.filterSummary && typeof params.filterSummary === "object"
          ? toJsonbSafeRecord(params.filterSummary)
          : null,
      records_limit: params.recordsLimit,
      expires_at: expiresAt,
    };
    await db
      .insert(hirelix_dataset_snapshots)
      .values(values)
      .onConflictDoUpdate({
        target: hirelix_dataset_snapshots.snapshot_id,
        set: {
          round: values.round,
          filter_hash: values.filter_hash,
          filter_summary: values.filter_summary,
          records_limit: values.records_limit,
          expires_at: values.expires_at,
        },
      });
  } catch {
    // Non-critical
  }
}

export async function expireCachedSnapshot(snapshotId: string): Promise<void> {
  try {
    await db
      .update(hirelix_dataset_snapshots)
      .set({ expires_at: new Date(0) })
      .where(eq(hirelix_dataset_snapshots.snapshot_id, snapshotId));
  } catch {
    // Non-critical
  }
}

export async function loadCachedSnapshotProfiles(
  snapshotId: string,
  sourceRound: string,
): Promise<Record<string, unknown>[] | null> {
  try {
    const data = await db
      .select({ raw_data: hirelix_snapshot_profiles.raw_data })
      .from(hirelix_snapshot_profiles)
      .where(
        and(
          eq(hirelix_snapshot_profiles.snapshot_id, snapshotId),
          eq(hirelix_snapshot_profiles.source_round, sourceRound),
        ),
      )
      .orderBy(
        sql`${hirelix_snapshot_profiles.record_index} ASC NULLS LAST`,
        asc(hirelix_snapshot_profiles.created_at),
      );
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
          ? (record.input_url as string)
          : record.input && typeof (record.input as Record<string, unknown>).url === "string"
            ? ((record.input as Record<string, unknown>).url as string)
            : null;
    return {
      snapshot_id: params.snapshotId,
      search_id: params.searchId,
      job_id: params.jobId,
      source_round: params.sourceRound,
      record_index: index,
      linkedin_id: linkedinId,
      profile_url: profileUrl,
      raw_data: toJsonbSafeRecord(record),
    };
  });

  try {
    await db
      .delete(hirelix_snapshot_profiles)
      .where(
        and(
          eq(hirelix_snapshot_profiles.snapshot_id, params.snapshotId),
          eq(hirelix_snapshot_profiles.source_round, params.sourceRound),
        ),
      );

    const batchSize = 50;
    for (let index = 0; index < rows.length; index += batchSize) {
      await db
        .insert(hirelix_snapshot_profiles)
        .values(rows.slice(index, index + batchSize));
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
    const patch: Record<string, unknown> = {};
    if (update.datasetSize != null) patch.dataset_size = update.datasetSize;
    if (update.cost != null) patch.cost = update.cost as unknown as string;
    if (Object.keys(patch).length === 0) return;
    await db
      .update(hirelix_dataset_snapshots)
      .set(patch)
      .where(eq(hirelix_dataset_snapshots.snapshot_id, snapshotId));
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
      const updated = await db
        .update(hirelix_searches)
        .set({
          parsed_requirements: toJsonbSafeRecord(parsed),
          updated_at: new Date(),
        })
        .where(eq(hirelix_searches.id, searchId))
        .returning({ id: hirelix_searches.id });

      if (updated[0]?.id) return;

      lastError = new Error("Parsed requirements update matched no rows");
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
  const eventRows = await db
    .select({
      id: hirelix_usage_events.id,
      metadata: hirelix_usage_events.metadata,
    })
    .from(hirelix_usage_events)
    .where(
      and(
        eq(hirelix_usage_events.related_id, searchId),
        eq(hirelix_usage_events.event_type, "search_created"),
      ),
    )
    .orderBy(desc(hirelix_usage_events.created_at))
    .limit(1);

  const event = eventRows[0];
  if (!event?.id) return;

  const currentMetadata =
    event.metadata && typeof event.metadata === "object"
      ? (event.metadata as Record<string, unknown>)
      : {};

  await db
    .update(hirelix_usage_events)
    .set({
      metadata: toJsonbSafeRecord({
        ...currentMetadata,
        ...metadataPatch,
      }),
    })
    .where(eq(hirelix_usage_events.id, event.id));
}

export async function upsertCandidatesForSearch(
  searchId: string,
  rows: CandidateRowInput[],
  options?: { replaceMissing?: boolean },
) {
  const existing = await db
    .select({
      id: hirelix_candidates.id,
      name: hirelix_candidates.name,
      profile_url: hirelix_candidates.profile_url,
    })
    .from(hirelix_candidates)
    .where(eq(hirelix_candidates.search_id, searchId));

  const matchedIds = new Set<string>();
  const inserts: ReturnType<typeof buildCandidatePayload>[] = [];

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
      await db
        .update(hirelix_candidates)
        .set(payload)
        .where(eq(hirelix_candidates.id, existingMatch.id));
    } else {
      inserts.push(payload);
    }
  }

  if (inserts.length > 0) {
    await db.insert(hirelix_candidates).values(inserts);
  }

  if (options?.replaceMissing) {
    const idsToDelete = existing
      .filter((candidate) => !matchedIds.has(candidate.id))
      .map((candidate) => candidate.id);

    if (idsToDelete.length > 0) {
      await db.delete(hirelix_candidates).where(inArray(hirelix_candidates.id, idsToDelete));
    }
  }
}

export async function upsertSingleCandidate(searchId: string, row: CandidateRowInput) {
  const payload = buildCandidatePayload(searchId, row);

  if (row.profile_url) {
    const existingRows = await db
      .select({ id: hirelix_candidates.id })
      .from(hirelix_candidates)
      .where(
        and(
          eq(hirelix_candidates.search_id, searchId),
          eq(hirelix_candidates.profile_url, row.profile_url),
        ),
      )
      .limit(1);
    const existing = existingRows[0];
    if (existing) {
      await db
        .update(hirelix_candidates)
        .set(payload)
        .where(eq(hirelix_candidates.id, existing.id));
      return;
    }
  }

  await db.insert(hirelix_candidates).values(payload);
}

export async function retagSearchCandidatePoolTypes(searchId: string) {
  const candidates = await db
    .select({
      id: hirelix_candidates.id,
      match_score: hirelix_candidates.match_score,
      metadata: hirelix_candidates.metadata,
    })
    .from(hirelix_candidates)
    .where(eq(hirelix_candidates.search_id, searchId))
    .orderBy(sql`${hirelix_candidates.match_score} DESC NULLS LAST`);

  if (!candidates.length) return;

  for (const candidate of candidates) {
    const metadata =
      candidate.metadata && typeof candidate.metadata === "object"
        ? { ...(candidate.metadata as Record<string, unknown>) }
        : {};
    const nextPoolType = "main";
    if (metadata.pool_type === nextPoolType) continue;
    metadata.pool_type = nextPoolType;
    await db
      .update(hirelix_candidates)
      .set({ metadata: toJsonbSafeRecord(metadata) })
      .where(eq(hirelix_candidates.id, candidate.id));
  }
}

function sanitizeSearchJsonbPatch(patch: Record<string, unknown>) {
  if (!("parsed_requirements" in patch)) return patch;
  return {
    ...patch,
    parsed_requirements: toJsonbSafeRecord(patch.parsed_requirements),
  };
}

export async function countCandidatesForSearch(searchId: string) {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(hirelix_candidates)
    .where(eq(hirelix_candidates.search_id, searchId));
  return rows[0]?.count ?? 0;
}

// `nowIso` re-export to keep parity with previous default behavior; many call
// sites import it through this module historically.
void nowIso;
