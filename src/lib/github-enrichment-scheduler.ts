import { processNextGithubEnrichmentJob } from "@/lib/github-enrichment-jobs";

const DEFAULT_IDLE_POLL_MS = 3000;
const DEFAULT_ERROR_BACKOFF_MS = 5000;
const DEFAULT_MAX_IDLE_POLL_MS = 30000;
const DEFAULT_CONCURRENCY = 2;

type SchedulerState = {
  started: boolean;
  startPromise: Promise<void[]> | null;
};

declare global {
  var __hirelixGithubEnrichmentSchedulerState__: SchedulerState | undefined;
}

function getSchedulerState(): SchedulerState {
  if (!globalThis.__hirelixGithubEnrichmentSchedulerState__) {
    globalThis.__hirelixGithubEnrichmentSchedulerState__ = {
      started: false,
      startPromise: null,
    };
  }
  return globalThis.__hirelixGithubEnrichmentSchedulerState__;
}

function getSchedulerEnabled() {
  const configured = process.env.GITHUB_ENRICHMENT_SCHEDULER_ENABLED;
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
    "GITHUB_ENRICHMENT_SCHEDULER_CONCURRENCY",
    DEFAULT_CONCURRENCY,
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSchedulerLoop(workerIndex: number) {
  const idlePollMs = getConfiguredPollMs(
    "GITHUB_ENRICHMENT_SCHEDULER_IDLE_POLL_MS",
    DEFAULT_IDLE_POLL_MS,
  );
  const errorBackoffMs = getConfiguredPollMs(
    "GITHUB_ENRICHMENT_SCHEDULER_ERROR_BACKOFF_MS",
    DEFAULT_ERROR_BACKOFF_MS,
  );
  const maxIdlePollMs = getConfiguredPollMs(
    "GITHUB_ENRICHMENT_SCHEDULER_MAX_IDLE_POLL_MS",
    DEFAULT_MAX_IDLE_POLL_MS,
  );

  let currentIdleDelay = idlePollMs;

  for (;;) {
    try {
      const result = await processNextGithubEnrichmentJob();
      if (result.processed || result.hasMore) {
        currentIdleDelay = idlePollMs;
        continue;
      }

      await sleep(currentIdleDelay);
      currentIdleDelay = Math.min(currentIdleDelay * 2, maxIdlePollMs);
    } catch (error) {
      console.error(`[github_enrichment_jobs] Scheduler worker ${workerIndex} failed:`, error);
      await sleep(errorBackoffMs);
      currentIdleDelay = idlePollMs;
    }
  }
}

export function startGithubEnrichmentScheduler() {
  if (!getSchedulerEnabled()) {
    console.warn(
      `[github_enrichment_jobs] In-process scheduler disabled (env=${process.env.NODE_ENV ?? "unknown"})`,
    );
    return;
  }

  const state = getSchedulerState();
  if (state.started) {
    return;
  }

  state.started = true;
  const concurrency = getConfiguredConcurrency();
  console.log(
    `[github_enrichment_jobs] In-process scheduler started with concurrency=${concurrency}`,
  );
  state.startPromise = Promise.all(
    Array.from({ length: concurrency }, (_, index) => runSchedulerLoop(index + 1)),
  ).catch((error) => {
    state.started = false;
    state.startPromise = null;
    console.error("[github_enrichment_jobs] Scheduler exited:", error);
    throw error;
  });
}
