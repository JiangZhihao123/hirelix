import { and, asc, eq, lt, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  hirelix_search_jobs,
  hirelix_searches,
} from "@/db/schema";
import { getFetchDispatcherForUrl } from "@/lib/server-outbound-proxy";
import {
  SEARCH_JOB_HEARTBEAT_SECONDS,
  SEARCH_JOB_STARTUP_STALL_SECONDS,
  SEARCH_JOB_STALE_MINUTES,
} from "@/lib/search/config";
import {
  logSearchEvent,
  nowIso,
} from "@/lib/search/normalize";
import type { SearchJobRow } from "@/lib/search/types";

function minutesAgoDate(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function secondsAgoDate(seconds: number) {
  return new Date(Date.now() - seconds * 1000);
}

const SNAPSHOT_PROFILE_CACHE_RERUN_MODE = "snapshot_profile_cache";

type SearchStartupState = {
  status: string | null;
  pipeline_step: string | null;
  parse_completed_at?: string | null | Date;
  partial_ready_at?: string | null | Date;
  search_completed_at?: string | null | Date;
  parsed_requirements?: unknown;
};

function isSnapshotProfileCacheRerun(parsedRequirements: unknown) {
  return Boolean(
    parsedRequirements &&
      typeof parsedRequirements === "object" &&
      (parsedRequirements as Record<string, unknown>).rerun_mode === SNAPSHOT_PROFILE_CACHE_RERUN_MODE,
  );
}

export function hasSearchJobStartedPipeline(search: SearchStartupState) {
  const isCacheOnlyRerun = isSnapshotProfileCacheRerun(search.parsed_requirements);
  if (isCacheOnlyRerun) {
    return (
      search.status !== "queued" ||
      search.pipeline_step !== "queued" ||
      Boolean(search.partial_ready_at) ||
      Boolean(search.search_completed_at)
    );
  }

  return (
    search.status !== "queued" ||
    search.pipeline_step !== "queued" ||
    Boolean(search.parse_completed_at) ||
    Boolean(search.partial_ready_at) ||
    Boolean(search.search_completed_at)
  );
}

export function kickSearchJobRunner(
  baseUrl: string,
  options?: { searchId?: string | null },
) {
  const kickEnabled = process.env.SEARCH_JOB_RUNNER_KICK_ENABLED;
  if (kickEnabled != null) {
    const normalized = kickEnabled.trim().toLowerCase();
    if (!["1", "true", "yes", "on"].includes(normalized)) return;
  } else if (process.env.NODE_ENV === "production") {
    return;
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return;

  const runnerUrl = new URL("/api/internal/search-jobs/run", baseUrl);
  const dispatcher = getFetchDispatcherForUrl(runnerUrl);

  void fetch(runnerUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      searchId: options?.searchId ?? null,
    }),
    ...(dispatcher ? { dispatcher } : {}),
  }).catch((error) => {
    console.error("[search_jobs] Failed to kick runner:", error);
  });
}

export function resolveSearchJobRunnerBaseUrl(requestOrigin: string) {
  const explicitBaseUrl = process.env.SEARCH_JOB_RUNNER_BASE_URL?.trim();
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  if (process.env.NODE_ENV !== "production") {
    return requestOrigin;
  }

  return process.env.APP_BASE_URL || requestOrigin;
}

/**
 * Convert a Drizzle row (with Date columns) to the legacy `SearchJobRow` shape
 * with ISO timestamp strings.
 */
function toSearchJobRow(row: typeof hirelix_search_jobs.$inferSelect): SearchJobRow {
  return {
    id: row.id,
    search_id: row.search_id,
    user_id: row.user_id,
    jd_text: row.jd_text,
    candidate_count: row.candidate_count,
    status: row.status,
    attempt_count: row.attempt_count,
    last_error: row.last_error,
    available_at: row.available_at.toISOString(),
    started_at: row.started_at?.toISOString() ?? null,
    locked_at: row.locked_at?.toISOString() ?? null,
    updated_at: row.updated_at?.toISOString() ?? null,
  } as SearchJobRow;
}

async function reclaimStuckStartingJobs() {
  const cutoff = secondsAgoDate(SEARCH_JOB_STARTUP_STALL_SECONDS);
  const restartMessage =
    `Scheduler worker stopped before parsing began; re-queueing after ${SEARCH_JOB_STARTUP_STALL_SECONDS}s startup stall`;

  const stuckJobs = await db
    .select({
      id: hirelix_search_jobs.id,
      search_id: hirelix_search_jobs.search_id,
      attempt_count: hirelix_search_jobs.attempt_count,
      locked_at: hirelix_search_jobs.locked_at,
    })
    .from(hirelix_search_jobs)
    .where(
      and(
        eq(hirelix_search_jobs.status, "running"),
        lt(hirelix_search_jobs.locked_at, cutoff),
      ),
    )
    .limit(50);

  if (!stuckJobs.length) return 0;

  let reclaimedCount = 0;
  for (const stuckJob of stuckJobs) {
    const searchRows = await db
      .select({
        status: hirelix_searches.status,
        pipeline_step: hirelix_searches.pipeline_step,
        parse_completed_at: hirelix_searches.parse_completed_at,
        partial_ready_at: hirelix_searches.partial_ready_at,
        search_completed_at: hirelix_searches.search_completed_at,
        parsed_requirements: hirelix_searches.parsed_requirements,
      })
      .from(hirelix_searches)
      .where(eq(hirelix_searches.id, stuckJob.search_id))
      .limit(1);

    const search = searchRows[0];
    if (!search) continue;
    if (hasSearchJobStartedPipeline(search)) continue;

    const reclaimed = await db
      .update(hirelix_search_jobs)
      .set({
        status: "queued",
        locked_at: null,
        started_at: null,
        finished_at: null,
        updated_at: new Date(),
        last_error: restartMessage,
      })
      .where(
        and(
          eq(hirelix_search_jobs.id, stuckJob.id),
          eq(hirelix_search_jobs.status, "running"),
          lt(hirelix_search_jobs.locked_at, cutoff),
        ),
      )
      .returning({ id: hirelix_search_jobs.id });

    if (!reclaimed[0]?.id) continue;

    reclaimedCount += 1;
    logSearchEvent("search_job_reclaimed", {
      job_id: stuckJob.id,
      search_id: stuckJob.search_id,
      attempt_count: stuckJob.attempt_count,
      startup_stall_seconds: SEARCH_JOB_STARTUP_STALL_SECONDS,
      outcome: "requeued_before_parse",
    });
  }

  return reclaimedCount;
}

export async function reclaimStaleRunningJobs(options: {
  failSearch: (searchId: string, message: string) => Promise<void>;
}) {
  await reclaimStuckStartingJobs();

  const cutoff = minutesAgoDate(SEARCH_JOB_STALE_MINUTES);
  const staleMessage = `Search job exceeded ${SEARCH_JOB_STALE_MINUTES}-minute execution limit`;

  const staleJobs = await db
    .select({
      id: hirelix_search_jobs.id,
      search_id: hirelix_search_jobs.search_id,
      attempt_count: hirelix_search_jobs.attempt_count,
    })
    .from(hirelix_search_jobs)
    .where(
      and(
        eq(hirelix_search_jobs.status, "running"),
        lt(hirelix_search_jobs.locked_at, cutoff),
      ),
    )
    .limit(50);

  if (!staleJobs.length) return 0;

  let reclaimedCount = 0;
  for (const staleJob of staleJobs) {
    const ts = new Date();
    const reclaimed = await db
      .update(hirelix_search_jobs)
      .set({
        status: "fatal_error",
        locked_at: null,
        last_error: staleMessage,
        available_at: ts,
        finished_at: ts,
        updated_at: ts,
      })
      .where(
        and(
          eq(hirelix_search_jobs.id, staleJob.id),
          eq(hirelix_search_jobs.status, "running"),
          lt(hirelix_search_jobs.locked_at, cutoff),
        ),
      )
      .returning({ id: hirelix_search_jobs.id });

    if (reclaimed[0]?.id) {
      await options.failSearch(staleJob.search_id, staleMessage);
      reclaimedCount += 1;
      logSearchEvent("search_job_reclaimed", {
        job_id: staleJob.id,
        search_id: staleJob.search_id,
        attempt_count: staleJob.attempt_count,
        stale_after_minutes: SEARCH_JOB_STALE_MINUTES,
        outcome: "timed_out",
      });
    }
  }

  return reclaimedCount;
}

export async function enqueueSearchJob(input: {
  searchId: string;
  userId: string;
  jdText: string;
  candidateCount: number;
}) {
  const ts = new Date();
  const values = {
    search_id: input.searchId,
    user_id: input.userId,
    jd_text: input.jdText,
    candidate_count: input.candidateCount,
    status: "queued",
    attempt_count: 0,
    last_error: null,
    available_at: ts,
    locked_at: null,
    started_at: null,
    finished_at: null,
    updated_at: ts,
  };

  const inserted = await db
    .insert(hirelix_search_jobs)
    .values(values)
    .onConflictDoUpdate({
      target: hirelix_search_jobs.search_id,
      set: {
        user_id: values.user_id,
        jd_text: values.jd_text,
        candidate_count: values.candidate_count,
        status: values.status,
        attempt_count: values.attempt_count,
        last_error: values.last_error,
        available_at: values.available_at,
        locked_at: values.locked_at,
        started_at: values.started_at,
        finished_at: values.finished_at,
        updated_at: values.updated_at,
      },
    })
    .returning({ id: hirelix_search_jobs.id, search_id: hirelix_search_jobs.search_id });

  const data = inserted[0];
  if (!data) {
    throw new Error("Failed to enqueue search job");
  }

  logSearchEvent("search_job_enqueued", {
    job_id: data.id,
    search_id: input.searchId,
    candidate_count: input.candidateCount,
  });

  return data;
}

export async function updateRunningJobStatus(
  jobId: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  const maxAttempts = 3;
  let lastError: { message: string; code?: string } | null = null;
  const timestampFields = new Set([
    "available_at",
    "locked_at",
    "started_at",
    "finished_at",
    "updated_at",
  ]);
  const normalizedExtra = Object.fromEntries(
    Object.entries(extra).map(([key, value]) => {
      if (typeof value === "string" && timestampFields.has(key)) {
        const date = new Date(value);
        if (!Number.isNaN(date.valueOf())) return [key, date];
      }
      return [key, value];
    }),
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const updated = await db
        .update(hirelix_search_jobs)
        .set({
          status,
          updated_at: new Date(),
          ...normalizedExtra,
        })
        .where(
          and(
            eq(hirelix_search_jobs.id, jobId),
            eq(hirelix_search_jobs.status, "running"),
          ),
        )
        .returning({ id: hirelix_search_jobs.id });

      return Boolean(updated[0]?.id);
    } catch (error) {
      lastError = {
        message: error instanceof Error ? error.message : String(error),
        code:
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code: unknown }).code)
            : undefined,
      };
    }

    logSearchEvent("search_job_status_update_failed", {
      job_id: jobId,
      target_status: status,
      attempt,
      retrying: attempt < maxAttempts,
      error: lastError?.message,
      code: lastError?.code,
    });

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  return false;
}

export async function touchRunningSearchJob(jobId: string) {
  const updated = await db
    .update(hirelix_search_jobs)
    .set({
      locked_at: new Date(),
      updated_at: new Date(),
    })
    .where(
      and(
        eq(hirelix_search_jobs.id, jobId),
        eq(hirelix_search_jobs.status, "running"),
      ),
    )
    .returning({ id: hirelix_search_jobs.id });

  return Boolean(updated[0]?.id);
}

export function startSearchJobHeartbeat(jobId: string) {
  const intervalMs = SEARCH_JOB_HEARTBEAT_SECONDS * 1000;
  const timer = setInterval(() => {
    void touchRunningSearchJob(jobId).catch((error) => {
      logSearchEvent("search_job_heartbeat_failed", {
        job_id: jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, intervalMs);

  return () => clearInterval(timer);
}

export async function claimSearchJob(options: {
  preferredSearchId?: string | null;
  reclaimStaleRunningJobs: () => Promise<number>;
}): Promise<SearchJobRow | null> {
  await options.reclaimStaleRunningJobs();

  const now = new Date();
  const candidateRows: Array<typeof hirelix_search_jobs.$inferSelect> = [];

  if (options.preferredSearchId) {
    const data = await db
      .select()
      .from(hirelix_search_jobs)
      .where(
        and(
          eq(hirelix_search_jobs.search_id, options.preferredSearchId),
          eq(hirelix_search_jobs.status, "queued"),
          lte(hirelix_search_jobs.available_at, now),
        ),
      )
      .limit(1);
    candidateRows.push(...data);
    if (candidateRows.length === 0) return null;
  }

  if (candidateRows.length === 0) {
    const data = await db
      .select()
      .from(hirelix_search_jobs)
      .where(
        and(
          eq(hirelix_search_jobs.status, "queued"),
          lte(hirelix_search_jobs.available_at, now),
        ),
      )
      .orderBy(asc(hirelix_search_jobs.available_at))
      .limit(10);
    candidateRows.push(...data);
  }

  for (const job of candidateRows) {
    const ts = new Date();
    const claimed = await db
      .update(hirelix_search_jobs)
      .set({
        status: "running",
        locked_at: ts,
        started_at: job.started_at ?? ts,
        attempt_count: (job.attempt_count || 0) + 1,
        updated_at: ts,
        last_error: null,
      })
      .where(
        and(
          eq(hirelix_search_jobs.id, job.id),
          eq(hirelix_search_jobs.status, "queued"),
        ),
      )
      .returning();

    if (claimed[0]) {
      return toSearchJobRow(claimed[0]);
    }
  }

  return null;
}

export async function hasRunnableSearchJobs() {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(hirelix_search_jobs)
    .where(
      and(
        eq(hirelix_search_jobs.status, "queued"),
        lte(hirelix_search_jobs.available_at, new Date()),
      ),
    );
  return (rows[0]?.count ?? 0) > 0;
}

void nowIso;
