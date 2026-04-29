import { getFetchDispatcherForUrl } from "@/lib/server-outbound-proxy";
import { supabaseAdmin } from "@/lib/supabase-server";
import {
  SEARCH_JOB_STARTUP_STALL_SECONDS,
  SEARCH_JOB_STALE_MINUTES,
} from "@/lib/search/config";
import {
  logSearchEvent,
  nowIso,
} from "@/lib/search/normalize";
import type { SearchJobRow } from "@/lib/search/types";

function minutesAgoIso(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function secondsAgoIso(seconds: number) {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

const SNAPSHOT_PROFILE_CACHE_RERUN_MODE = "snapshot_profile_cache";

type SearchStartupState = {
  status: string | null;
  pipeline_step: string | null;
  parse_completed_at?: string | null;
  partial_ready_at?: string | null;
  search_completed_at?: string | null;
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

async function reclaimStuckStartingJobs() {
  const cutoff = secondsAgoIso(SEARCH_JOB_STARTUP_STALL_SECONDS);
  const restartMessage =
    `Scheduler worker stopped before parsing began; re-queueing after ${SEARCH_JOB_STARTUP_STALL_SECONDS}s startup stall`;
  const { data: stuckJobs } = await supabaseAdmin
    .from("hirelix_search_jobs")
    .select("id, search_id, attempt_count, locked_at")
    .eq("status", "running")
    .lt("locked_at", cutoff)
    .limit(50);

  if (!stuckJobs?.length) return 0;

  let reclaimedCount = 0;
  for (const stuckJob of stuckJobs) {
    const { data: search } = await supabaseAdmin
      .from("hirelix_searches")
      .select("status, pipeline_step, parse_completed_at, partial_ready_at, search_completed_at, parsed_requirements")
      .eq("id", stuckJob.search_id)
      .maybeSingle();

    if (!search) continue;

    if (hasSearchJobStartedPipeline(search)) continue;

    const { data: reclaimed } = await supabaseAdmin
      .from("hirelix_search_jobs")
      .update({
        status: "queued",
        locked_at: null,
        started_at: null,
        finished_at: null,
        updated_at: nowIso(),
        last_error: restartMessage,
      })
      .eq("id", stuckJob.id)
      .eq("status", "running")
      .lt("locked_at", cutoff)
      .select("id")
      .single();

    if (!reclaimed?.id) continue;

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

  const cutoff = minutesAgoIso(SEARCH_JOB_STALE_MINUTES);
  const staleMessage = `Search job exceeded ${SEARCH_JOB_STALE_MINUTES}-minute execution limit`;
  const { data: staleJobs } = await supabaseAdmin
    .from("hirelix_search_jobs")
    .select("id, search_id, attempt_count")
    .eq("status", "running")
    .lt("locked_at", cutoff)
    .limit(50);

  if (!staleJobs?.length) return 0;

  let reclaimedCount = 0;
  for (const staleJob of staleJobs) {
    const { data: reclaimed } = await supabaseAdmin
      .from("hirelix_search_jobs")
      .update({
        status: "fatal_error",
        locked_at: null,
        last_error: staleMessage,
        available_at: nowIso(),
        finished_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq("id", staleJob.id)
      .eq("status", "running")
      .lt("locked_at", cutoff)
      .select("id")
      .single();

    if (reclaimed?.id) {
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
  const timestamp = nowIso();
  const { data, error } = await supabaseAdmin
    .from("hirelix_search_jobs")
    .upsert(
      {
        search_id: input.searchId,
        user_id: input.userId,
        jd_text: input.jdText,
        candidate_count: input.candidateCount,
        status: "queued",
        attempt_count: 0,
        last_error: null,
        available_at: timestamp,
        locked_at: null,
        started_at: null,
        finished_at: null,
        updated_at: timestamp,
      },
      { onConflict: "search_id" },
    )
    .select("id, search_id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to enqueue search job");
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

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data, error } = await supabaseAdmin
        .from("hirelix_search_jobs")
        .update({
          status,
          updated_at: nowIso(),
          ...extra,
        })
        .eq("id", jobId)
        .eq("status", "running")
        .select("id")
        .maybeSingle();

      if (!error) {
        return Boolean(data?.id);
      }

      lastError = { message: error.message, code: error.code };
    } catch (error) {
      lastError = {
        message: error instanceof Error ? error.message : String(error),
      };
    }

    logSearchEvent("search_job_status_update_failed", {
      job_id: jobId,
      target_status: status,
      attempt,
      retrying: attempt < maxAttempts,
      error: lastError.message,
      code: lastError.code,
    });

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  return false;
}

export async function claimSearchJob(options: {
  preferredSearchId?: string | null;
  reclaimStaleRunningJobs: () => Promise<number>;
}): Promise<SearchJobRow | null> {
  await options.reclaimStaleRunningJobs();

  const now = nowIso();
  const candidateRows: SearchJobRow[] = [];

  if (options.preferredSearchId) {
    const { data } = await supabaseAdmin
      .from("hirelix_search_jobs")
      .select("*")
      .eq("search_id", options.preferredSearchId)
      .eq("status", "queued")
      .lte("available_at", now)
      .limit(1);
    if (data) candidateRows.push(...data);

    // A targeted runner invocation must only process the requested search.
    // Falling back to the global queue can make local/in-app retries advance
    // unrelated jobs while the requested job is still locked or waiting.
    if (candidateRows.length === 0) {
      return null;
    }
  }

  if (candidateRows.length === 0) {
    const { data } = await supabaseAdmin
      .from("hirelix_search_jobs")
      .select("*")
      .eq("status", "queued")
      .lte("available_at", now)
      .order("available_at", { ascending: true })
      .limit(10);
    if (data) candidateRows.push(...data);
  }

  for (const job of candidateRows) {
    const { data: claimed } = await supabaseAdmin
      .from("hirelix_search_jobs")
      .update({
        status: "running",
        locked_at: nowIso(),
        started_at: job.started_at ?? nowIso(),
        attempt_count: (job.attempt_count || 0) + 1,
        updated_at: nowIso(),
        last_error: null,
      })
      .eq("id", job.id)
      .eq("status", "queued")
      .select("*")
      .single();

    if (claimed) {
      return claimed as SearchJobRow;
    }
  }

  return null;
}

export async function hasRunnableSearchJobs() {
  const { count } = await supabaseAdmin
    .from("hirelix_search_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .lte("available_at", nowIso());

  return (count || 0) > 0;
}
