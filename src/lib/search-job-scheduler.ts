import { processNextSearchJob, reclaimStaleRunningJobs } from "@/lib/search";

const DEFAULT_IDLE_POLL_MS = 3000;
const DEFAULT_ERROR_BACKOFF_MS = 5000;
const DEFAULT_CONCURRENCY = 1;

type SchedulerState = {
  started: boolean;
  startPromise: Promise<void[]> | null;
};

declare global {
  var __hirelixSearchJobSchedulerState__: SchedulerState | undefined;
}

function getSchedulerState(): SchedulerState {
  if (!globalThis.__hirelixSearchJobSchedulerState__) {
    globalThis.__hirelixSearchJobSchedulerState__ = {
      started: false,
      startPromise: null,
    };
  }
  return globalThis.__hirelixSearchJobSchedulerState__;
}

function getSchedulerEnabled() {
  const configured = process.env.SEARCH_JOB_SCHEDULER_ENABLED;
  if (configured != null) {
    return ["1", "true", "yes", "on"].includes(configured.trim().toLowerCase());
  }
  return process.env.NODE_ENV === "production";
}

function getConfiguredPollMs(envName: string, fallback: number) {
  const raw = process.env[envName];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getConfiguredConcurrency() {
  return getConfiguredPollMs(
    "SEARCH_JOB_SCHEDULER_CONCURRENCY",
    DEFAULT_CONCURRENCY,
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSchedulerLoop(workerIndex: number) {
  const idlePollMs = getConfiguredPollMs(
    "SEARCH_JOB_SCHEDULER_IDLE_POLL_MS",
    DEFAULT_IDLE_POLL_MS,
  );
  const errorBackoffMs = getConfiguredPollMs(
    "SEARCH_JOB_SCHEDULER_ERROR_BACKOFF_MS",
    DEFAULT_ERROR_BACKOFF_MS,
  );

  for (;;) {
    try {
      const result = await processNextSearchJob();
      if (!result.processed && !result.hasMore) {
        await sleep(idlePollMs);
      }
    } catch (error) {
      console.error(`[search_jobs] Scheduler worker ${workerIndex} failed:`, error);
      await sleep(errorBackoffMs);
    }
  }
}

// 独立回收定时器：每 60s 主动回收卡死的 running jobs，
// 不依赖 worker 存活——即使所有 worker 全部卡死也能自愈。
const RECLAIM_INTERVAL_MS = 60_000;

function startReclaimTimer() {
  setInterval(async () => {
    try {
      await reclaimStaleRunningJobs();
    } catch (error) {
      console.error("[search_jobs] Reclaim timer failed:", error);
    }
  }, RECLAIM_INTERVAL_MS);
}

export function startSearchJobScheduler() {
  if (!getSchedulerEnabled()) {
    console.warn(
      `[search_jobs] In-process scheduler disabled (env=${process.env.NODE_ENV ?? "unknown"})`,
    );
    return;
  }

  const state = getSchedulerState();
  if (state.started) {
    return;
  }

  state.started = true;
  startReclaimTimer();
  const concurrency = getConfiguredConcurrency();
  console.log(
    `[search_jobs] In-process scheduler started with concurrency=${concurrency}`,
  );
  state.startPromise = Promise.all(
    Array.from({ length: concurrency }, (_, index) => runSchedulerLoop(index + 1)),
  ).catch((error) => {
    state.started = false;
    state.startPromise = null;
    console.error("[search_jobs] Scheduler exited:", error);
    throw error;
  });
}
