import {
  applyGithubSignalsToCandidateRow,
  buildPendingGithubSignals,
  enrichGithubSignalsForCandidate,
} from "@/lib/github-signals";
import { supabaseAdmin } from "@/lib/supabase-server";

const GITHUB_ENRICHMENT_MAX_ATTEMPTS = 3;
const GITHUB_ENRICHMENT_RETRY_DELAY_MS = 5 * 60 * 1000;
const GITHUB_ENRICHMENT_STALE_MINUTES = 20;

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

function minutesAgoIso(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
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
  const existing = asRecord(asRecord(metadata).github_signals);
  const status = existing.status;
  return !["verified", "missing_public_data", "ambiguous_match", "api_error"].includes(
    typeof status === "string" ? status : "",
  );
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
    queued_at: nowIso(),
    candidate_id: params.candidate.id,
    search_id: params.searchId,
    user_id: params.userId,
  };
  return metadata;
}

async function upsertGithubEnrichmentJob(input: EnqueueGithubEnrichmentJobInput) {
  const timestamp = nowIso();
  const { data, error } = await supabaseAdmin
    .from("hirelix_github_enrichment_jobs")
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
    throw new Error(error?.message || "Failed to enqueue GitHub enrichment job");
  }

  return data.id as string;
}

export async function enqueueGithubEnrichmentJob(
  input: EnqueueGithubEnrichmentJobInput,
): Promise<GithubEnrichmentJobResult> {
  const { data: candidate } = await supabaseAdmin
    .from("hirelix_candidates")
    .select("id, name, headline, github_url, metadata")
    .eq("id", input.candidateId)
    .eq("search_id", input.searchId)
    .maybeSingle();

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

  await supabaseAdmin
    .from("hirelix_candidates")
    .update({ metadata })
    .eq("id", input.candidateId)
    .eq("search_id", input.searchId);

  return { metadata, jobId, enqueued: true };
}

export async function enqueueGithubEnrichmentJobsForSearch(input: {
  searchId: string;
  userId: string;
  limit?: number;
}) {
  const { data: candidates, error } = await supabaseAdmin
    .from("hirelix_candidates")
    .select("id, search_id, name, headline, github_url, metadata")
    .eq("search_id", input.searchId)
    .order("match_score", { ascending: false })
    .limit(input.limit ?? 50);

  if (error) {
    throw new Error(error.message);
  }

  let enqueued = 0;
  let skipped = 0;
  for (const candidate of candidates || []) {
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
    scanned: candidates?.length ?? 0,
    enqueued,
    skipped,
  };
}

async function claimGithubEnrichmentJob(
  preferredCandidateId?: string | null,
): Promise<GithubEnrichmentJobRow | null> {
  const now = nowIso();
  const candidateRows: GithubEnrichmentJobRow[] = [];

  if (preferredCandidateId) {
    const { data } = await supabaseAdmin
      .from("hirelix_github_enrichment_jobs")
      .select("*")
      .eq("candidate_id", preferredCandidateId)
      .eq("status", "queued")
      .lte("available_at", now)
      .limit(1);
    if (data) candidateRows.push(...(data as GithubEnrichmentJobRow[]));
    if (candidateRows.length === 0) return null;
  }

  if (candidateRows.length === 0) {
    const { data } = await supabaseAdmin
      .from("hirelix_github_enrichment_jobs")
      .select("*")
      .eq("status", "queued")
      .lte("available_at", now)
      .order("available_at", { ascending: true })
      .limit(10);
    if (data) candidateRows.push(...(data as GithubEnrichmentJobRow[]));
  }

  for (const job of candidateRows) {
    const { data: claimed } = await supabaseAdmin
      .from("hirelix_github_enrichment_jobs")
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
      return claimed as GithubEnrichmentJobRow;
    }
  }

  return null;
}

async function updateJobStatus(
  jobId: string,
  status: "queued" | "done" | "error",
  extra: Record<string, unknown> = {},
) {
  const timestamp = nowIso();
  await supabaseAdmin
    .from("hirelix_github_enrichment_jobs")
    .update({
      status,
      updated_at: timestamp,
      ...(status === "done" || status === "error" ? { finished_at: timestamp } : {}),
      ...(status !== "queued" ? { locked_at: null } : {}),
      ...extra,
    })
    .eq("id", jobId);
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
      githubUrl: candidate.github_url,
      metadata: asRecord(candidate.metadata),
      requiredSkills,
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
      job_id: job.id,
      finished_at: nowIso(),
    };

    await supabaseAdmin
      .from("hirelix_candidates")
      .update({
        github_url: enriched.github_url,
        match_score: enriched.match_score,
        match_reasons: enriched.match_reasons,
        metadata,
      })
      .eq("id", candidate.id);

    await updateJobStatus(job.id, "done", {
      last_error: null,
      locked_at: null,
    });

    console.log("[github_enrichment] Job done", {
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
    console.error("[github_enrichment] Job failed", {
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
  const cutoff = minutesAgoIso(GITHUB_ENRICHMENT_STALE_MINUTES);
  const { data: staleJobs } = await supabaseAdmin
    .from("hirelix_github_enrichment_jobs")
    .select("id, attempt_count")
    .eq("status", "running")
    .lt("locked_at", cutoff)
    .limit(50);

  if (!staleJobs?.length) return 0;

  let reclaimed = 0;
  for (const job of staleJobs) {
    const shouldRetry = (job.attempt_count || 0) < GITHUB_ENRICHMENT_MAX_ATTEMPTS;
    const { data } = await supabaseAdmin
      .from("hirelix_github_enrichment_jobs")
      .update({
        status: shouldRetry ? "queued" : "error",
        locked_at: null,
        available_at: nowIso(),
        last_error: `GitHub enrichment exceeded ${GITHUB_ENRICHMENT_STALE_MINUTES}-minute execution limit`,
        updated_at: nowIso(),
        ...(shouldRetry ? {} : { finished_at: nowIso() }),
      })
      .eq("id", job.id)
      .eq("status", "running")
      .lt("locked_at", cutoff)
      .select("id")
      .maybeSingle();
    if (data?.id) reclaimed += 1;
  }
  return reclaimed;
}

export async function hasRunnableGithubEnrichmentJobs() {
  const { count } = await supabaseAdmin
    .from("hirelix_github_enrichment_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .lte("available_at", nowIso());

  return (count || 0) > 0;
}
