import { and, asc, desc, eq, lt, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  hirelix_candidates,
  hirelix_public_evidence_items,
  hirelix_public_evidence_jobs,
  hirelix_searches,
} from "@/db/schema";
import { extractRequiredSkillsForGithub } from "@/lib/github-enrichment-jobs";
import { toJsonbSafeRecord } from "@/lib/jsonb-safe";
import { enrichPublicEvidenceForCandidate } from "@/lib/public-evidence";
import { getSellableEvidenceItems } from "@/lib/public-evidence/selling-kit";
import type { PublicEvidenceItem } from "@/lib/public-evidence/types";
import { withTimeout } from "@/lib/search/concurrency";

const PUBLIC_EVIDENCE_MAX_ATTEMPTS = 3;
const PUBLIC_EVIDENCE_RETRY_DELAY_MS = 5 * 60 * 1000;
const PUBLIC_EVIDENCE_STALE_MINUTES = 25;
const DEFAULT_PUBLIC_EVIDENCE_JOB_TIMEOUT_MS = 240_000;
const MIN_PUBLIC_EVIDENCE_JOB_TIMEOUT_MS = 30_000;
const MAX_PUBLIC_EVIDENCE_JOB_TIMEOUT_MS = 240_000;
export const PUBLIC_EVIDENCE_VERSION = 2;

function nowIso() {
  return new Date().toISOString();
}

function nowDate() {
  return new Date();
}

function minutesAgoDate(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

export function getPublicEvidenceJobTimeoutMs(
  env: Record<string, string | undefined> = process.env,
) {
  const parsed = env.PUBLIC_EVIDENCE_JOB_TIMEOUT_MS
    ? Number.parseInt(env.PUBLIC_EVIDENCE_JOB_TIMEOUT_MS, 10)
    : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PUBLIC_EVIDENCE_JOB_TIMEOUT_MS;
  return Math.max(
    MIN_PUBLIC_EVIDENCE_JOB_TIMEOUT_MS,
    Math.min(parsed, MAX_PUBLIC_EVIDENCE_JOB_TIMEOUT_MS),
  );
}

const PUBLIC_EVIDENCE_JOB_TIMESTAMP_FIELDS = new Set([
  "available_at",
  "locked_at",
  "started_at",
  "finished_at",
  "updated_at",
]);

export function normalizePublicEvidenceJobTimestampFields(
  patch: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.entries(patch).map(([key, value]) => {
      if (typeof value === "string" && PUBLIC_EVIDENCE_JOB_TIMESTAMP_FIELDS.has(key)) {
        const date = new Date(value);
        if (!Number.isNaN(date.valueOf())) return [key, date];
      }
      return [key, value];
    }),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export function shouldQueuePublicEvidence(metadata: unknown) {
  const publicEvidence = asRecord(asRecord(metadata).public_evidence);
  const status = publicEvidence.status;
  const version = publicEvidence.version;
  if (status === "verified" && version === PUBLIC_EVIDENCE_VERSION) return false;
  if (status === "running" || status === "queued") return false;
  return true;
}

function buildQueuedMetadata(metadata: unknown) {
  return {
    ...asRecord(metadata),
    public_evidence: {
      ...asRecord(asRecord(metadata).public_evidence),
      status: "queued",
      version: PUBLIC_EVIDENCE_VERSION,
      queued_at: nowIso(),
    },
  };
}

async function upsertPublicEvidenceJob(input: {
  candidateId: string;
  searchId: string;
  userId: string;
}) {
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
    .insert(hirelix_public_evidence_jobs)
    .values(values)
    .onConflictDoUpdate({
      target: hirelix_public_evidence_jobs.candidate_id,
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
    .returning({ id: hirelix_public_evidence_jobs.id });
  const id = inserted[0]?.id;
  if (!id) throw new Error("Failed to enqueue public evidence job");
  return id;
}

export async function enqueuePublicEvidenceJobsForSearch(input: {
  searchId: string;
  userId: string;
  limit?: number;
}) {
  const candidates = await db
    .select({
      id: hirelix_candidates.id,
      metadata: hirelix_candidates.metadata,
    })
    .from(hirelix_candidates)
    .where(eq(hirelix_candidates.search_id, input.searchId))
    .orderBy(desc(hirelix_candidates.match_score))
    .limit(Math.max(1, input.limit || 25));

  let scanned = 0;
  let enqueued = 0;
  let skipped = 0;
  for (const candidate of candidates) {
    scanned += 1;
    if (!shouldQueuePublicEvidence(candidate.metadata)) {
      skipped += 1;
      continue;
    }
    const metadata = buildQueuedMetadata(candidate.metadata);
    await upsertPublicEvidenceJob({
      candidateId: candidate.id,
      searchId: input.searchId,
      userId: input.userId,
    });
    await db
      .update(hirelix_candidates)
      .set({ metadata: toJsonbSafeRecord(metadata) })
      .where(eq(hirelix_candidates.id, candidate.id));
    enqueued += 1;
  }
  return { scanned, enqueued, skipped };
}

async function claimPublicEvidenceJob(preferredCandidateId?: string | null) {
  const ts = nowDate();
  const baseConditions = [
    eq(hirelix_public_evidence_jobs.status, "queued"),
    lte(hirelix_public_evidence_jobs.available_at, ts),
  ];
  if (preferredCandidateId) {
    baseConditions.push(eq(hirelix_public_evidence_jobs.candidate_id, preferredCandidateId));
  }
  const candidates = await db
    .select()
    .from(hirelix_public_evidence_jobs)
    .where(and(...baseConditions))
    .orderBy(asc(hirelix_public_evidence_jobs.available_at))
    .limit(10);

  for (const row of candidates) {
    const claimed = await db
      .update(hirelix_public_evidence_jobs)
      .set({
        status: "running",
        locked_at: ts,
        started_at: ts,
        attempt_count: (row.attempt_count || 0) + 1,
        updated_at: ts,
        last_error: null,
      })
      .where(
        and(
          eq(hirelix_public_evidence_jobs.id, row.id),
          eq(hirelix_public_evidence_jobs.status, "queued"),
        ),
      )
      .returning();
    if (claimed[0]) return claimed[0];
  }
  return null;
}

async function hasRunnablePublicEvidenceJobs() {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(hirelix_public_evidence_jobs)
    .where(
      and(
        eq(hirelix_public_evidence_jobs.status, "queued"),
        lte(hirelix_public_evidence_jobs.available_at, nowDate()),
      ),
    );
  return (rows[0]?.count ?? 0) > 0;
}

async function updateJobStatus(
  jobId: string,
  status: "queued" | "done" | "error",
  extra: Record<string, unknown> = {},
) {
  const ts = nowDate();
  const patch = normalizePublicEvidenceJobTimestampFields({
    status,
    updated_at: ts,
    ...(status === "done" || status === "error" ? { finished_at: ts } : {}),
    ...(status !== "queued" ? { locked_at: null } : {}),
    ...extra,
  });
  await db
    .update(hirelix_public_evidence_jobs)
    .set(patch as Parameters<typeof db.update>[0] extends never ? never : Record<string, unknown>)
    .where(eq(hirelix_public_evidence_jobs.id, jobId));
}

function blendScores(params: {
  matchScore: number;
  metadata: Record<string, unknown>;
  publicEvidenceScore: number | null;
}) {
  const publicEvidence = asRecord(params.metadata.public_evidence);
  const publicEvidenceItems = Array.isArray(publicEvidence.items)
    ? publicEvidence.items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    : [];
  const sellableItems = getSellableEvidenceItems(publicEvidenceItems);
  if (typeof params.publicEvidenceScore !== "number" || sellableItems.length === 0) {
    return { matchScore: params.matchScore, metadata: params.metadata };
  }
  const technicalBoost =
    params.publicEvidenceScore >= 75 ? 8 :
      params.publicEvidenceScore >= 50 ? 4 :
        params.publicEvidenceScore >= 35 ? 1 :
          0;
  const metadata = { ...params.metadata };
  const currentTechnical =
    typeof metadata.technical_evidence_score === "number"
      ? metadata.technical_evidence_score
      : typeof metadata.overall_score === "number"
        ? metadata.overall_score
        : params.matchScore;
  metadata.technical_evidence_score = Math.min(100, Math.round(currentTechnical + technicalBoost));
  metadata.public_evidence_score = params.publicEvidenceScore;
  return {
    matchScore: params.matchScore,
    metadata,
  };
}

async function persistPublicEvidenceItems(params: {
  candidateId: string;
  searchId: string;
  items: PublicEvidenceItem[];
}) {
  await db
    .delete(hirelix_public_evidence_items)
    .where(eq(hirelix_public_evidence_items.candidate_id, params.candidateId));
  if (!params.items.length) return;
  await db.insert(hirelix_public_evidence_items).values(
    params.items.map((item) => ({
      candidate_id: params.candidateId,
      search_id: params.searchId,
      source_type: item.sourceType,
      source_url: item.sourceUrl,
      title: item.title,
      snippet: item.snippet,
      identity_status: item.identityStatus,
      identity_confidence:
        item.identityConfidence === null || item.identityConfidence === undefined
          ? null
          : (item.identityConfidence as unknown as string),
      relevance_score: item.relevanceScore,
      evidence_strength: item.evidenceStrength,
      evidence_summary: item.evidenceSummary,
      outreach_angle: item.outreachAngle,
      raw_metadata: toJsonbSafeRecord(item.rawMetadata),
      updated_at: nowDate(),
    })),
  );
}

export async function processNextPublicEvidenceJob(preferredCandidateId?: string | null) {
  await reclaimStalePublicEvidenceJobs();
  const job = await claimPublicEvidenceJob(preferredCandidateId);
  if (!job) {
    return { processed: false, hasMore: await hasRunnablePublicEvidenceJobs() };
  }

  try {
    const [candidateRows, searchRows] = await Promise.all([
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
    const candidate = candidateRows[0];
    const search = searchRows[0];
    if (!candidate || !search) {
      await updateJobStatus(job.id, "error", { last_error: "Candidate or search row no longer exists" });
      return { processed: true, hasMore: await hasRunnablePublicEvidenceJobs() };
    }

    const requiredSkills = extractRequiredSkillsForGithub(search.parsed_requirements);
    const candidateMetadata = {
      ...asRecord(candidate.metadata),
      match_score: candidate.match_score,
      match_reasons: Array.isArray(candidate.match_reasons) ? candidate.match_reasons : [],
    };
    const enrichment = await withTimeout(
      () => enrichPublicEvidenceForCandidate({
        candidateId: candidate.id,
        searchId: job.search_id,
        userId: job.user_id ?? "",
        name: candidate.name || "Unknown candidate",
        headline: candidate.headline,
        location: candidate.location,
        profileUrl: candidate.profile_url,
        githubUrl: candidate.github_url,
        metadata: candidateMetadata,
        requiredSkills,
      }),
      getPublicEvidenceJobTimeoutMs(),
      `Public evidence job ${job.id}`,
    );
    const metadata = {
      ...asRecord(enrichment.metadata),
      public_evidence: {
        ...asRecord(asRecord(enrichment.metadata).public_evidence),
        version: PUBLIC_EVIDENCE_VERSION,
        status: enrichment.result.status,
        job_id: job.id,
        finished_at: nowIso(),
      },
    };
    const blended = blendScores({
      matchScore: typeof candidate.match_score === "number" ? candidate.match_score : 0,
      metadata,
      publicEvidenceScore: enrichment.result.score,
    });
    await persistPublicEvidenceItems({
      candidateId: candidate.id,
      searchId: job.search_id,
      items: enrichment.result.items,
    });
    await db
      .update(hirelix_candidates)
      .set({
        github_url: enrichment.githubUrl || candidate.github_url,
        match_score: blended.matchScore,
        metadata: toJsonbSafeRecord(blended.metadata),
      })
      .where(eq(hirelix_candidates.id, candidate.id));
    await updateJobStatus(job.id, "done", { last_error: null });
    console.log("[public_evidence] Job done", {
      job_id: job.id,
      candidate_id: job.candidate_id,
      search_id: job.search_id,
      status: enrichment.result.status,
      evidence_count: enrichment.result.items.length,
      score: enrichment.result.score,
    });
    return { processed: true, hasMore: await hasRunnablePublicEvidenceJobs() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldRetry = job.attempt_count < PUBLIC_EVIDENCE_MAX_ATTEMPTS;
    await updateJobStatus(job.id, shouldRetry ? "queued" : "error", {
      last_error: message,
      locked_at: null,
      available_at: shouldRetry
        ? new Date(Date.now() + PUBLIC_EVIDENCE_RETRY_DELAY_MS).toISOString()
        : nowIso(),
    });
    console.error("[public_evidence] Job failed", {
      job_id: job.id,
      candidate_id: job.candidate_id,
      search_id: job.search_id,
      retrying: shouldRetry,
      error: message,
    });
    return { processed: true, hasMore: await hasRunnablePublicEvidenceJobs() };
  }
}

export async function reclaimStalePublicEvidenceJobs() {
  const staleBefore = minutesAgoDate(PUBLIC_EVIDENCE_STALE_MINUTES);
  await db
    .update(hirelix_public_evidence_jobs)
    .set({
      status: "queued",
      locked_at: null,
      last_error: `Public evidence exceeded ${PUBLIC_EVIDENCE_STALE_MINUTES}-minute execution limit`,
      available_at: nowDate(),
      updated_at: nowDate(),
    })
    .where(
      and(
        eq(hirelix_public_evidence_jobs.status, "running"),
        lt(hirelix_public_evidence_jobs.locked_at, staleBefore),
      ),
    );
}
