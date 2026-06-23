import { and, asc, eq, lt, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  hirelix_candidates,
  hirelix_github_enrichment_jobs,
  hirelix_searches,
} from "@/db/schema";
import {
  applyGithubSignalsToCandidateRow,
  buildPendingGithubSignals,
  enrichGithubSignalsForCandidate,
} from "@/lib/github-signals";
import { getLogger } from "@/lib/logger";

const githubEnrichmentLogger = getLogger({ component: "github_enrichment_jobs" });

const GITHUB_ENRICHMENT_MAX_ATTEMPTS = 3;
const GITHUB_ENRICHMENT_RETRY_DELAY_MS = 5 * 60 * 1000;
const GITHUB_ENRICHMENT_STALE_MINUTES = 20;
export const GITHUB_ENRICHMENT_VERSION = 3;

type EnqueueGithubEnrichmentJobInput = {
  candidateId: string;
  searchId: string;
  userId: string;
};

type GithubEnrichmentJobResult = {
  metadata: Record<string, unknown>;
  jobId: string | null;
  enqueued: boolean;
};

type GithubEnrichmentJobRow = {
  id: string;
  candidate_id: string;
  search_id: string;
  user_id: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  available_at: string;
  locked_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

type CandidateForGithubEnrichment = {
  id: string;
  search_id: string;
  name: string | null;
  headline: string | null;
  location: string | null;
  skills: unknown;
  match_score: number | null;
  match_reasons: unknown;
  profile_url: string | null;
  github_url: string | null;
  metadata: unknown;
};

function nowIso() {
  return new Date().toISOString();
}

function nowDate() {
  return new Date();
}

const GITHUB_JOB_TIMESTAMP_FIELDS = new Set([
  "available_at",
  "locked_at",
  "started_at",
  "finished_at",
  "updated_at",
]);

function normalizeTimestampFields(patch: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => {
      if (typeof value === "string" && GITHUB_JOB_TIMESTAMP_FIELDS.has(key)) {
        const date = new Date(value);
        if (!Number.isNaN(date.valueOf())) return [key, date];
      }
      return [key, value];
    }),
  );
}

function minutesAgoDate(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function compactStringArray(values: unknown[], limit = 12) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    result.push(trimmed);
    if (result.length >= limit) break;
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function asStringArray(value: unknown, limit = 12) {
  return Array.isArray(value) ? compactStringArray(value, limit) : [];
}

function getNestedRecord(
  source: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return asRecord(source[key]);
}

export function extractRequiredSkillsForGithub(
  parsedRequirements: unknown,
): string[] {
  const parsed = asRecord(parsedRequirements);
  const hiringBrief = getNestedRecord(parsed, "hiring_brief");
  const roleCore = getNestedRecord(hiringBrief, "role_core");
  const recallSpec = getNestedRecord(parsed, "recall_spec");

  return compactStringArray(
    [
      ...asStringArray(roleCore.required_skills),
      ...asStringArray(roleCore.nice_to_have_skills),
      ...asStringArray(parsed.required_skills),
      ...asStringArray(parsed.skills),
      ...asStringArray(recallSpec.core_skill_terms),
      ...asStringArray(recallSpec.differentiating_skill_terms),
    ],
    16,
  );
}

export function shouldQueueGithubEnrichment(metadata: unknown) {
  const metadataRecord = asRecord(metadata);
  const existing = asRecord(metadataRecord.github_signals);
  const enrichment = asRecord(metadataRecord.github_enrichment);
  const status = existing.status;
  if (status === "verified" || status === "api_error") return false;
  if (status === "missing_public_data" || status === "ambiguous_match") {
    return enrichment.version !== GITHUB_ENRICHMENT_VERSION;
  }
  return true;
}

export function buildQueuedGithubMetadata(params: {
  metadata: unknown;
  candidate: Pick<CandidateForGithubEnrichment, "id" | "name" | "headline" | "github_url">;
  searchId: string;
  userId: string;
}) {
  const metadata = asRecord(params.metadata);
  metadata.github_signals = buildPendingGithubSignals({
    status: "queued",
    candidateName: params.candidate.name || "Unknown candidate",
    headline: params.candidate.headline,
    existingGithubUrl: params.candidate.github_url,
    existingSignals: asRecord(metadata.github_signals),
  });
  metadata.github_enrichment = {
    status: "queued",
    version: GITHUB_ENRICHMENT_VERSION,
    queued_at: nowIso(),
    candidate_id: params.candidate.id,
    search_id: params.searchId,
    user_id: params.userId,
  };
  return metadata;
}

async function upsertGithubEnrichmentJob(input: EnqueueGithubEnrichmentJobInput) {
  const ts = nowDate();
  const values = {
    candidate_id: input.candidateId,
    search_id: input.searchId,
    user_id: input.userId,
    status: "queued",
    attempt_count: 0,
    available_at: ts,
    locked_at: null,
    started_at: null,
    finished_at: null,
    last_error: null,
    updated_at: ts,
  };
  const inserted = await db
    .insert(hirelix_github_enrichment_jobs)
    .values(values)
    .onConflictDoUpdate({
      target: hirelix_github_enrichment_jobs.candidate_id,
      set: {
        search_id: values.search_id,
        user_id: values.user_id,
        status: values.status,
        attempt_count: values.attempt_count,
        available_at: values.available_at,
        locked_at: values.locked_at,
        started_at: values.started_at,
        finished_at: values.finished_at,
        last_error: values.last_error,
        updated_at: values.updated_at,
      },
    })
    .returning({ id: hirelix_github_enrichment_jobs.id });
  const id = inserted[0]?.id;
  if (!id) throw new Error("Failed to enqueue GitHub enrichment job");
  return id;
}

export async function enqueueGithubEnrichmentJob(
  input: EnqueueGithubEnrichmentJobInput,
): Promise<GithubEnrichmentJobResult> {
  const candidateRows = await db
    .select({
      id: hirelix_candidates.id,
      name: hirelix_candidates.name,
      headline: hirelix_candidates.headline,
      github_url: hirelix_candidates.github_url,
      metadata: hirelix_candidates.metadata,
    })
    .from(hirelix_candidates)
    .where(
      and(
        eq(hirelix_candidates.id, input.candidateId),
        eq(hirelix_candidates.search_id, input.searchId),
      ),
    )
    .limit(1);
  const candidate = candidateRows[0];

  if (!candidate) {
    return { metadata: {}, jobId: null, enqueued: false };
  }

  if (!shouldQueueGithubEnrichment(candidate.metadata)) {
    return {
      metadata: asRecord(candidate.metadata),
      jobId: null,
      enqueued: false,
    };
  }

  const metadata = buildQueuedGithubMetadata({
    metadata: candidate.metadata,
    candidate: {
      id: candidate.id,
      name: candidate.name,
      headline: candidate.headline,
      github_url: candidate.github_url,
    },
    searchId: input.searchId,
    userId: input.userId,
  });
  const jobId = await upsertGithubEnrichmentJob(input);

  await db
    .update(hirelix_candidates)
    .set({ metadata })
    .where(
      and(
        eq(hirelix_candidates.id, input.candidateId),
        eq(hirelix_candidates.search_id, input.searchId),
      ),
    );

  return { metadata, jobId, enqueued: true };
}

export async function enqueueGithubEnrichmentJobsForSearch(input: {
  searchId: string;
  userId: string;
  limit?: number;
}) {
  const candidates = await db
    .select({
      id: hirelix_candidates.id,
      search_id: hirelix_candidates.search_id,
      name: hirelix_candidates.name,
      headline: hirelix_candidates.headline,
      github_url: hirelix_candidates.github_url,
      metadata: hirelix_candidates.metadata,
    })
    .from(hirelix_candidates)
    .where(eq(hirelix_candidates.search_id, input.searchId))
    .orderBy(sql`${hirelix_candidates.match_score} DESC NULLS LAST`)
    .limit(input.limit ?? 50);

  let enqueued = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    if (!shouldQueueGithubEnrichment(candidate.metadata)) {
      skipped += 1;
      continue;
    }
    const result = await enqueueGithubEnrichmentJob({
      candidateId: candidate.id,
      searchId: input.searchId,
      userId: input.userId,
    });
    if (result.enqueued) enqueued += 1;
  }

  return {
    scanned: candidates.length,
    enqueued,
    skipped,
  };
}

async function claimGithubEnrichmentJob(
  preferredCandidateId?: string | null,
): Promise<GithubEnrichmentJobRow | null> {
  const now = nowDate();
  const candidateRows: Array<typeof hirelix_github_enrichment_jobs.$inferSelect> = [];

  if (preferredCandidateId) {
    const data = await db
      .select()
      .from(hirelix_github_enrichment_jobs)
      .where(
        and(
          eq(hirelix_github_enrichment_jobs.candidate_id, preferredCandidateId),
          eq(hirelix_github_enrichment_jobs.status, "queued"),
          lte(hirelix_github_enrichment_jobs.available_at, now),
        ),
      )
      .limit(1);
    candidateRows.push(...data);
    if (candidateRows.length === 0) return null;
  }

  if (candidateRows.length === 0) {
    const data = await db
      .select()
      .from(hirelix_github_enrichment_jobs)
      .where(
        and(
          eq(hirelix_github_enrichment_jobs.status, "queued"),
          lte(hirelix_github_enrichment_jobs.available_at, now),
        ),
      )
      .orderBy(asc(hirelix_github_enrichment_jobs.available_at))
      .limit(10);
    candidateRows.push(...data);
  }

  for (const job of candidateRows) {
    const ts = nowDate();
    const claimed = await db
      .update(hirelix_github_enrichment_jobs)
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
          eq(hirelix_github_enrichment_jobs.id, job.id),
          eq(hirelix_github_enrichment_jobs.status, "queued"),
        ),
      )
      .returning();

    if (claimed[0]) {
      const row = claimed[0];
      return {
        id: row.id,
        candidate_id: row.candidate_id,
        search_id: row.search_id,
        user_id: row.user_id,
        status: row.status,
        attempt_count: row.attempt_count,
        last_error: row.last_error,
        available_at: row.available_at.toISOString(),
        locked_at: row.locked_at?.toISOString() ?? null,
        started_at: row.started_at?.toISOString() ?? null,
        finished_at: row.finished_at?.toISOString() ?? null,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      };
    }
  }

  return null;
}

async function updateJobStatus(
  jobId: string,
  status: "queued" | "done" | "error",
  extra: Record<string, unknown> = {},
) {
  const ts = nowDate();
  const patch: Record<string, unknown> = normalizeTimestampFields({
    status,
    updated_at: ts,
    ...(status === "done" || status === "error" ? { finished_at: ts } : {}),
    ...(status !== "queued" ? { locked_at: null } : {}),
    ...extra,
  });
  await db
    .update(hirelix_github_enrichment_jobs)
    .set(patch)
    .where(eq(hirelix_github_enrichment_jobs.id, jobId));
}

export async function processNextGithubEnrichmentJob(
  preferredCandidateId?: string | null,
) {
  await reclaimStaleGithubEnrichmentJobs();
  const job = await claimGithubEnrichmentJob(preferredCandidateId);
  if (!job) {
    return { processed: false, hasMore: await hasRunnableGithubEnrichmentJobs() };
  }

  try {
    const [candRows, searchRows] = await Promise.all([
      db
        .select({
          id: hirelix_candidates.id,
          search_id: hirelix_candidates.search_id,
          name: hirelix_candidates.name,
          headline: hirelix_candidates.headline,
          location: hirelix_candidates.location,
          skills: hirelix_candidates.skills,
          match_score: hirelix_candidates.match_score,
          match_reasons: hirelix_candidates.match_reasons,
          profile_url: hirelix_candidates.profile_url,
          github_url: hirelix_candidates.github_url,
          metadata: hirelix_candidates.metadata,
        })
        .from(hirelix_candidates)
        .where(
          and(
            eq(hirelix_candidates.id, job.candidate_id),
            eq(hirelix_candidates.search_id, job.search_id),
          ),
        )
        .limit(1),
      db
        .select({
          id: hirelix_searches.id,
          user_id: hirelix_searches.user_id,
          parsed_requirements: hirelix_searches.parsed_requirements,
        })
        .from(hirelix_searches)
        .where(eq(hirelix_searches.id, job.search_id))
        .limit(1),
    ]);
    const candidate = candRows[0];
    const search = searchRows[0];

    if (!candidate || !search) {
      await updateJobStatus(job.id, "error", {
        last_error: "Candidate or search row no longer exists",
        locked_at: null,
      });
      return { processed: true, hasMore: await hasRunnableGithubEnrichmentJobs() };
    }

    const requiredSkills = extractRequiredSkillsForGithub(search.parsed_requirements);
    const enrichment = await enrichGithubSignalsForCandidate({
      name: candidate.name || "Unknown candidate",
      headline: candidate.headline,
      location: candidate.location,
      skills: asStringArray(candidate.skills),
      profileUrl: candidate.profile_url,
      githubUrl: candidate.github_url,
      metadata: asRecord(candidate.metadata),
      requiredSkills,
      searchId: job.search_id,
      jobId: job.id,
      userId: job.user_id,
    });
    const enriched = applyGithubSignalsToCandidateRow({
      candidate: {
        match_score: typeof candidate.match_score === "number" ? candidate.match_score : 0,
        match_reasons: asStringArray(candidate.match_reasons, 8),
        github_url: candidate.github_url,
        metadata: asRecord(candidate.metadata),
      },
      enrichment,
    });

    const metadata = asRecord(enriched.metadata);
    metadata.github_enrichment = {
      ...asRecord(metadata.github_enrichment),
      status: "done",
      version: GITHUB_ENRICHMENT_VERSION,
      job_id: job.id,
      finished_at: nowIso(),
    };

    await db
      .update(hirelix_candidates)
      .set({
        github_url: enriched.github_url,
        match_score: enriched.match_score,
        match_reasons: enriched.match_reasons,
        metadata,
      })
      .where(eq(hirelix_candidates.id, candidate.id));

    await updateJobStatus(job.id, "done", {
      last_error: null,
      locked_at: null,
    });

    githubEnrichmentLogger.info({
      event: "github_enrichment_job_done",
      job_id: job.id,
      candidate_id: job.candidate_id,
      search_id: job.search_id,
      status: enrichment.githubSignals.status,
      github_url: enrichment.githubUrl,
      github_signal_score: enrichment.githubSignalScore,
    });

    return { processed: true, hasMore: await hasRunnableGithubEnrichmentJobs() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldRetry = job.attempt_count < GITHUB_ENRICHMENT_MAX_ATTEMPTS;
    await updateJobStatus(job.id, shouldRetry ? "queued" : "error", {
      last_error: message,
      locked_at: null,
      available_at: shouldRetry
        ? new Date(Date.now() + GITHUB_ENRICHMENT_RETRY_DELAY_MS).toISOString()
        : nowIso(),
    });
    githubEnrichmentLogger.error({
      event: "github_enrichment_job_failed",
      job_id: job.id,
      candidate_id: job.candidate_id,
      search_id: job.search_id,
      attempt_count: job.attempt_count,
      retrying: shouldRetry,
      error: message,
    });
    return { processed: true, hasMore: await hasRunnableGithubEnrichmentJobs() };
  }
}

export async function reclaimStaleGithubEnrichmentJobs() {
  const cutoff = minutesAgoDate(GITHUB_ENRICHMENT_STALE_MINUTES);
  const staleJobs = await db
    .select({
      id: hirelix_github_enrichment_jobs.id,
      attempt_count: hirelix_github_enrichment_jobs.attempt_count,
    })
    .from(hirelix_github_enrichment_jobs)
    .where(
      and(
        eq(hirelix_github_enrichment_jobs.status, "running"),
        lt(hirelix_github_enrichment_jobs.locked_at, cutoff),
      ),
    )
    .limit(50);

  if (!staleJobs.length) return 0;

  let reclaimed = 0;
  for (const job of staleJobs) {
    const shouldRetry = (job.attempt_count || 0) < GITHUB_ENRICHMENT_MAX_ATTEMPTS;
    const ts = nowDate();
    const patch: Record<string, unknown> = {
      status: shouldRetry ? "queued" : "error",
      locked_at: null,
      available_at: ts,
      last_error: `GitHub enrichment exceeded ${GITHUB_ENRICHMENT_STALE_MINUTES}-minute execution limit`,
      updated_at: ts,
      ...(shouldRetry ? {} : { finished_at: ts }),
    };
    const updated = await db
      .update(hirelix_github_enrichment_jobs)
      .set(patch)
      .where(
        and(
          eq(hirelix_github_enrichment_jobs.id, job.id),
          eq(hirelix_github_enrichment_jobs.status, "running"),
          lt(hirelix_github_enrichment_jobs.locked_at, cutoff),
        ),
      )
      .returning({ id: hirelix_github_enrichment_jobs.id });
    if (updated[0]?.id) reclaimed += 1;
  }
  return reclaimed;
}

export async function hasRunnableGithubEnrichmentJobs() {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(hirelix_github_enrichment_jobs)
    .where(
      and(
        eq(hirelix_github_enrichment_jobs.status, "queued"),
        lte(hirelix_github_enrichment_jobs.available_at, nowDate()),
      ),
    );

  return (rows[0]?.count ?? 0) > 0;
}
