import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { count, desc, eq, inArray } from "drizzle-orm";

import { closeDb, db } from "../../src/db/client";
import {
  hirelix_candidates,
  hirelix_github_enrichment_jobs,
  hirelix_search_jobs,
  hirelix_searches,
} from "../../src/db/schema";
import { getDatasetSnapshotMetadata } from "../../src/lib/brightdata";
import {
  enqueueGithubEnrichmentJobsForSearch,
  processNextGithubEnrichmentJob,
} from "../../src/lib/github-enrichment-jobs";
import {
  enqueueSearchJob,
  processNextSearchJob,
} from "../../src/lib/search-jobs";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";

const DEFAULT_JD = `Senior Backend Engineer

We are hiring a senior backend engineer for a US remote role. The person should
have strong production experience with PostgreSQL, API design, distributed
systems, observability, and ownership of backend services in production.

Nice to have: Python, TypeScript, cloud infrastructure, data intensive systems,
startup or growth-stage experience. Avoid frontend-only, mobile-only, data
scientist, or pure ML research profiles.`;

type Args = {
  searchId: string | null;
  resumeFailed: boolean;
  candidateCount: number;
  timeoutMs: number;
  pollMs: number;
  githubLimit: number;
  jdText: string;
};

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function readNumberArg(name: string, fallback: number) {
  const raw = readArg(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid --${name}: ${raw}`);
  }
  return value;
}

function readJdText() {
  const jdFile = readArg("jd-file");
  if (!jdFile) return DEFAULT_JD;
  return fs.readFileSync(path.resolve(process.cwd(), jdFile), "utf8");
}

function readArgs(): Args {
  return {
    searchId: readArg("search-id"),
    resumeFailed: hasFlag("resume-failed"),
    candidateCount: readNumberArg("candidate-count", 5),
    timeoutMs: readNumberArg("timeout-ms", 20 * 60 * 1000),
    pollMs: readNumberArg("poll-ms", 3000),
    githubLimit: readNumberArg("github-limit", 3),
    jdText: readJdText(),
  };
}

function requireRealIntegrationOptIn() {
  if (process.env.REAL_INTEGRATION !== "1") {
    throw new Error(
      "Refusing to run paid/live integration smoke. Set REAL_INTEGRATION=1 explicitly.",
    );
  }
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getGithubStatus(metadata: unknown) {
  const signals = asRecord(asRecord(metadata).github_signals);
  return typeof signals.status === "string" ? signals.status : "none";
}

function getRecallMetadata(search: { parsed_requirements: unknown } | null) {
  return asRecord(asRecord(search?.parsed_requirements).recall_metadata);
}

function getAdditionalSnapshotIds(recall: Record<string, unknown>) {
  const snapshots = Array.isArray(recall.additional_snapshots)
    ? recall.additional_snapshots
    : [];
  return snapshots
    .map((entry) => {
      const record = asRecord(entry);
      return typeof record.snapshot_id === "string" ? record.snapshot_id : null;
    })
    .filter((id): id is string => Boolean(id));
}

async function fetchSearch(searchId: string) {
  const [search] = await db
    .select({
      id: hirelix_searches.id,
      user_id: hirelix_searches.user_id,
      status: hirelix_searches.status,
      pipeline_step: hirelix_searches.pipeline_step,
      error_message: hirelix_searches.error_message,
      parsed_requirements: hirelix_searches.parsed_requirements,
      updated_at: hirelix_searches.updated_at,
    })
    .from(hirelix_searches)
    .where(eq(hirelix_searches.id, searchId))
    .limit(1);
  return search ?? null;
}

async function fetchJob(searchId: string) {
  const [job] = await db
    .select({
      id: hirelix_search_jobs.id,
      status: hirelix_search_jobs.status,
      attempt_count: hirelix_search_jobs.attempt_count,
      available_at: hirelix_search_jobs.available_at,
      last_error: hirelix_search_jobs.last_error,
    })
    .from(hirelix_search_jobs)
    .where(eq(hirelix_search_jobs.search_id, searchId))
    .limit(1);
  return job ?? null;
}

async function fetchCandidateCount(searchId: string) {
  const [row] = await db
    .select({ count: count() })
    .from(hirelix_candidates)
    .where(eq(hirelix_candidates.search_id, searchId));
  return Number(row?.count ?? 0);
}

async function createSearch(args: Args) {
  const now = new Date();
  const userId = process.env.REAL_TEST_USER_ID || randomUUID();
  const [search] = await db
    .insert(hirelix_searches)
    .values({
      user_id: userId,
      jd_text: args.jdText,
      status: "queued",
      pipeline_step: "queued",
      parsed_requirements: {
        candidate_count: args.candidateCount,
        display_count: args.candidateCount,
        highlight_count: Math.min(3, args.candidateCount),
        requested_candidate_count: args.candidateCount,
        outreach_pool_target: args.candidateCount,
      },
      queued_at: now,
      created_at: now,
      updated_at: now,
    })
    .returning({ id: hirelix_searches.id, user_id: hirelix_searches.user_id });
  if (!search) throw new Error("Failed to create search row");

  const job = await enqueueSearchJob({
    searchId: search.id,
    userId: search.user_id,
    jdText: args.jdText,
    candidateCount: args.candidateCount,
  });

  return { searchId: search.id, jobId: job.id };
}

async function resumeFailedSearch(searchId: string) {
  const now = new Date();
  await db
    .update(hirelix_search_jobs)
    .set({
      status: "queued",
      available_at: now,
      locked_at: null,
      finished_at: null,
      last_error: null,
      updated_at: now,
    })
    .where(eq(hirelix_search_jobs.search_id, searchId));
  await db
    .update(hirelix_searches)
    .set({
      status: "queued",
      pipeline_step: "queued",
      error_message: null,
      updated_at: now,
    })
    .where(eq(hirelix_searches.id, searchId));
}

async function printBrightSnapshotFacts(searchId: string) {
  const token = process.env.BRIGHTDATA_API_TOKEN;
  if (!token) return;

  const search = await fetchSearch(searchId);
  const recall = getRecallMetadata(search);
  const ids = [
    typeof recall.snapshot_id === "string" ? recall.snapshot_id : null,
    ...getAdditionalSnapshotIds(recall),
  ].filter((id): id is string => Boolean(id));

  for (const snapshotId of ids) {
    try {
      const meta = await getDatasetSnapshotMetadata(token, snapshotId);
      console.log("[real-smoke] bright_snapshot", {
        snapshot_id: snapshotId,
        status: meta.status,
        dataset_size: meta.dataset_size ?? null,
        cost: meta.cost ?? null,
        warning_code: meta.warning_code ?? null,
        error_code: meta.error_code ?? null,
      });
    } catch (error) {
      console.log("[real-smoke] bright_snapshot_check_failed", {
        snapshot_id: snapshotId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function pollSearch(searchId: string, args: Args) {
  const terminalStatuses = new Set(["done", "error"]);
  const startedAt = Date.now();
  let lastPrintedSnapshotAt = 0;

  while (Date.now() - startedAt < args.timeoutMs) {
    const result = await processNextSearchJob(searchId);
    const [search, job, candidateCount] = await Promise.all([
      fetchSearch(searchId),
      fetchJob(searchId),
      fetchCandidateCount(searchId),
    ]);

    console.log("[real-smoke] poll", {
      elapsed_ms: Date.now() - startedAt,
      processed: result.processed,
      has_more: result.hasMore,
      search_status: search?.status ?? null,
      pipeline_step: search?.pipeline_step ?? null,
      job_status: job?.status ?? null,
      attempt_count: job?.attempt_count ?? null,
      available_at: job?.available_at?.toISOString?.() ?? null,
      candidate_count: candidateCount,
      error: search?.error_message ?? job?.last_error ?? null,
    });

    if (Date.now() - lastPrintedSnapshotAt > 30000) {
      lastPrintedSnapshotAt = Date.now();
      await printBrightSnapshotFacts(searchId);
    }

    if (search?.status && terminalStatuses.has(search.status)) return search.status;
    await sleep(args.pollMs);
  }

  throw new Error(`Timed out waiting for search ${searchId} after ${args.timeoutMs}ms`);
}

async function printCandidates(searchId: string, limit = 10) {
  const candidates = await db
    .select({
      id: hirelix_candidates.id,
      name: hirelix_candidates.name,
      headline: hirelix_candidates.headline,
      location: hirelix_candidates.location,
      match_score: hirelix_candidates.match_score,
      profile_url: hirelix_candidates.profile_url,
      github_url: hirelix_candidates.github_url,
      metadata: hirelix_candidates.metadata,
    })
    .from(hirelix_candidates)
    .where(eq(hirelix_candidates.search_id, searchId))
    .orderBy(desc(hirelix_candidates.match_score))
    .limit(limit);

  console.log("[real-smoke] candidates", candidates.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    headline: candidate.headline,
    location: candidate.location,
    match_score: candidate.match_score,
    profile_url: candidate.profile_url,
    github_url: candidate.github_url,
    github_status: getGithubStatus(candidate.metadata),
  })));

  return candidates;
}

async function runGithubEnrichment(searchId: string, limit: number) {
  const search = await fetchSearch(searchId);
  if (!search) throw new Error(`Search not found: ${searchId}`);

  const enqueueResult = await enqueueGithubEnrichmentJobsForSearch({
    searchId,
    userId: search.user_id,
    limit,
  });
  console.log("[real-smoke] github_enqueue", enqueueResult);

  const candidates = await db
    .select({ id: hirelix_candidates.id })
    .from(hirelix_candidates)
    .where(eq(hirelix_candidates.search_id, searchId))
    .orderBy(desc(hirelix_candidates.match_score))
    .limit(limit);

  for (const candidate of candidates) {
    const result = await processNextGithubEnrichmentJob(candidate.id);
    console.log("[real-smoke] github_process", {
      candidate_id: candidate.id,
      ...result,
    });
  }

  const candidateIds = candidates.map((candidate) => candidate.id);
  if (candidateIds.length === 0) return;
  const rows = await db
    .select({
      candidate_id: hirelix_github_enrichment_jobs.candidate_id,
      status: hirelix_github_enrichment_jobs.status,
      attempt_count: hirelix_github_enrichment_jobs.attempt_count,
      last_error: hirelix_github_enrichment_jobs.last_error,
    })
    .from(hirelix_github_enrichment_jobs)
    .where(inArray(hirelix_github_enrichment_jobs.candidate_id, candidateIds));

  console.log("[real-smoke] github_jobs", rows);
}

async function main() {
  requireRealIntegrationOptIn();
  requireEnv("DATABASE_URL");
  requireEnv("DEEPSEEK_API_KEY");
  requireEnv("BRIGHTDATA_API_TOKEN");
  requireEnv("GITHUB_TOKEN");

  initializeGlobalOutboundProxy();
  const args = readArgs();

  let searchId = args.searchId;
  let jobId: string | null = null;
  if (searchId) {
    if (args.resumeFailed) {
      await resumeFailedSearch(searchId);
      console.log("[real-smoke] resumed_search", { search_id: searchId });
    }
  } else {
    const created = await createSearch(args);
    searchId = created.searchId;
    jobId = created.jobId;
    console.log("[real-smoke] created_search", {
      search_id: searchId,
      job_id: jobId,
    });
  }

  const terminalStatus = await pollSearch(searchId, args);
  const candidateCount = await fetchCandidateCount(searchId);
  console.log("[real-smoke] search_terminal", {
    search_id: searchId,
    terminal_status: terminalStatus,
    candidate_count: candidateCount,
  });

  await printBrightSnapshotFacts(searchId);
  const candidates = await printCandidates(searchId);

  if (candidates.length > 0 && args.githubLimit > 0) {
    await runGithubEnrichment(searchId, Math.min(args.githubLimit, candidates.length));
    await printCandidates(searchId, args.githubLimit);
  }
}

main()
  .catch((error) => {
    console.error("[real-smoke] FAIL", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
