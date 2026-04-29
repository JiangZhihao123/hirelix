import { extractRequiredSkillsForGithub } from "@/lib/github-enrichment-jobs";
import { supabaseAdmin } from "@/lib/supabase-server";
import { enrichPublicEvidenceForCandidate } from "@/lib/public-evidence";
import type { PublicEvidenceItem } from "@/lib/public-evidence/types";

const PUBLIC_EVIDENCE_MAX_ATTEMPTS = 3;
const PUBLIC_EVIDENCE_RETRY_DELAY_MS = 5 * 60 * 1000;
const PUBLIC_EVIDENCE_STALE_MINUTES = 25;
export const PUBLIC_EVIDENCE_VERSION = 1;

type PublicEvidenceJobRow = {
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

function nowIso() {
  return new Date().toISOString();
}

function minutesAgoIso(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
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
  const timestamp = nowIso();
  const { data, error } = await supabaseAdmin
    .from("hirelix_public_evidence_jobs")
    .upsert(
      {
        candidate_id: input.candidateId,
        search_id: input.searchId,
        user_id: input.userId,
        status: "queued",
        attempt_count: 0,
        available_at: timestamp,
        locked_at: null,
        started_at: null,
        finished_at: null,
        last_error: null,
        updated_at: timestamp,
      },
      { onConflict: "candidate_id" },
    )
    .select("id")
    .single();
  if (error || !data?.id) {
    throw new Error(error?.message || "Failed to enqueue public evidence job");
  }
  return data.id as string;
}

export async function enqueuePublicEvidenceJobsForSearch(input: {
  searchId: string;
  userId: string;
  limit?: number;
}) {
  const { data: candidates, error } = await supabaseAdmin
    .from("hirelix_candidates")
    .select("id, metadata")
    .eq("search_id", input.searchId)
    .order("match_score", { ascending: false })
    .limit(Math.max(1, input.limit || 20));
  if (error) throw new Error(error.message);

  let scanned = 0;
  let enqueued = 0;
  let skipped = 0;
  for (const candidate of candidates || []) {
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
    await supabaseAdmin
      .from("hirelix_candidates")
      .update({ metadata })
      .eq("id", candidate.id);
    enqueued += 1;
  }
  return { scanned, enqueued, skipped };
}

async function claimPublicEvidenceJob(preferredCandidateId?: string | null) {
  const timestamp = nowIso();
  let query = supabaseAdmin
    .from("hirelix_public_evidence_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("available_at", timestamp)
    .order("available_at", { ascending: true })
    .limit(10);
  if (preferredCandidateId) query = query.eq("candidate_id", preferredCandidateId);
  const { data } = await query;
  for (const row of (data || []) as PublicEvidenceJobRow[]) {
    const { data: claimed } = await supabaseAdmin
      .from("hirelix_public_evidence_jobs")
      .update({
        status: "running",
        locked_at: timestamp,
        started_at: timestamp,
        attempt_count: (row.attempt_count || 0) + 1,
        updated_at: timestamp,
        last_error: null,
      })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("*")
      .single();
    if (claimed) return claimed as PublicEvidenceJobRow;
  }
  return null;
}

async function hasRunnablePublicEvidenceJobs() {
  const { count } = await supabaseAdmin
    .from("hirelix_public_evidence_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .lte("available_at", nowIso());
  return Boolean(count && count > 0);
}

async function updateJobStatus(
  jobId: string,
  status: "queued" | "done" | "error",
  extra: Record<string, unknown> = {},
) {
  const timestamp = nowIso();
  await supabaseAdmin
    .from("hirelix_public_evidence_jobs")
    .update({
      status,
      updated_at: timestamp,
      ...(status === "done" || status === "error" ? { finished_at: timestamp } : {}),
      ...(status !== "queued" ? { locked_at: null } : {}),
      ...extra,
    })
    .eq("id", jobId);
}

function blendScores(params: {
  matchScore: number;
  metadata: Record<string, unknown>;
  publicEvidenceScore: number | null;
}) {
  if (typeof params.publicEvidenceScore !== "number") {
    return { matchScore: params.matchScore, metadata: params.metadata };
  }
  const boost =
    params.publicEvidenceScore >= 75 ? 3 :
      params.publicEvidenceScore >= 50 ? 2 :
        params.publicEvidenceScore >= 35 ? 1 :
          0;
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
    matchScore: Math.min(100, Math.round(params.matchScore + boost)),
    metadata,
  };
}

async function persistPublicEvidenceItems(params: {
  candidateId: string;
  searchId: string;
  items: PublicEvidenceItem[];
}) {
  await supabaseAdmin
    .from("hirelix_public_evidence_items")
    .delete()
    .eq("candidate_id", params.candidateId);
  if (!params.items.length) return;
  await supabaseAdmin.from("hirelix_public_evidence_items").insert(
    params.items.map((item) => ({
      candidate_id: params.candidateId,
      search_id: params.searchId,
      source_type: item.sourceType,
      source_url: item.sourceUrl,
      title: item.title,
      snippet: item.snippet,
      identity_status: item.identityStatus,
      identity_confidence: item.identityConfidence,
      relevance_score: item.relevanceScore,
      evidence_strength: item.evidenceStrength,
      evidence_summary: item.evidenceSummary,
      outreach_angle: item.outreachAngle,
      raw_metadata: item.rawMetadata,
      updated_at: nowIso(),
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
    const [{ data: candidate }, { data: search }] = await Promise.all([
      supabaseAdmin
        .from("hirelix_candidates")
        .select("id, search_id, name, headline, location, skills, match_score, match_reasons, profile_url, github_url, metadata")
        .eq("id", job.candidate_id)
        .eq("search_id", job.search_id)
        .maybeSingle(),
      supabaseAdmin
        .from("hirelix_searches")
        .select("id, user_id, parsed_requirements")
        .eq("id", job.search_id)
        .maybeSingle(),
    ]);
    if (!candidate || !search) {
      await updateJobStatus(job.id, "error", { last_error: "Candidate or search row no longer exists" });
      return { processed: true, hasMore: await hasRunnablePublicEvidenceJobs() };
    }

    const requiredSkills = extractRequiredSkillsForGithub(search.parsed_requirements);
    const enrichment = await enrichPublicEvidenceForCandidate({
      candidateId: candidate.id,
      searchId: job.search_id,
      userId: job.user_id,
      name: candidate.name || "Unknown candidate",
      headline: candidate.headline,
      location: candidate.location,
      profileUrl: candidate.profile_url,
      githubUrl: candidate.github_url,
      metadata: asRecord(candidate.metadata),
      requiredSkills,
    });
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
    await supabaseAdmin
      .from("hirelix_candidates")
      .update({
        github_url: enrichment.githubUrl || candidate.github_url,
        match_score: blended.matchScore,
        metadata: blended.metadata,
      })
      .eq("id", candidate.id);
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
  const staleBefore = minutesAgoIso(PUBLIC_EVIDENCE_STALE_MINUTES);
  await supabaseAdmin
    .from("hirelix_public_evidence_jobs")
    .update({
      status: "queued",
      locked_at: null,
      last_error: `Public evidence exceeded ${PUBLIC_EVIDENCE_STALE_MINUTES}-minute execution limit`,
      available_at: nowIso(),
      updated_at: nowIso(),
    })
    .eq("status", "running")
    .lt("locked_at", staleBefore);
}
