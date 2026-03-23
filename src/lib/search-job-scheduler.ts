import { processNextSearchJob } from "@/lib/search-jobs";

const DEFAULT_IDLE_POLL_MS = 3000;
const DEFAULT_ERROR_BACKOFF_MS = 5000;
const DEFAULT_MAX_IDLE_POLL_MS = 30000;

type SchedulerState = {
  started: boolean;
  startPromise: Promise<void> | null;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSchedulerLoop() {
  const idlePollMs = getConfiguredPollMs(
    "SEARCH_JOB_SCHEDULER_IDLE_POLL_MS",
    DEFAULT_IDLE_POLL_MS,
  );
  const errorBackoffMs = getConfiguredPollMs(
    "SEARCH_JOB_SCHEDULER_ERROR_BACKOFF_MS",
    DEFAULT_ERROR_BACKOFF_MS,
  );
  const maxIdlePollMs = getConfiguredPollMs(
    "SEARCH_JOB_SCHEDULER_MAX_IDLE_POLL_MS",
    DEFAULT_MAX_IDLE_POLL_MS,
  );

  let currentIdleDelay = idlePollMs;

  for (;;) {
    try {
      const result = await processNextSearchJob();
      if (result.processed || result.hasMore) {
        currentIdleDelay = idlePollMs;
        continue;
      }

      await sleep(currentIdleDelay);
      currentIdleDelay = Math.min(currentIdleDelay * 2, maxIdlePollMs);
    } catch (error) {
      console.error("[search_jobs] Scheduler loop failed:", error);
      await sleep(errorBackoffMs);
      currentIdleDelay = idlePollMs;
    }
  }
}

export function startSearchJobScheduler() {
  if (!getSchedulerEnabled()) {
    return;
  }

  const state = getSchedulerState();
  if (state.started) {
    return;
  }

  state.started = true;
  console.log("[search_jobs] In-process scheduler started");
  state.startPromise = runSchedulerLoop().catch((error) => {
    state.started = false;
    state.startPromise = null;
    console.error("[search_jobs] Scheduler exited:", error);
  });
}
