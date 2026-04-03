import { applyGithubSignalsToCandidateRow, buildPendingGithubSignals, enrichGithubSignalsForCandidate } from "@/lib/github-signals";
import { supabaseAdmin } from "@/lib/supabase-server";

const GITHUB_ENRICHMENT_MAX_ATTEMPTS = getConfiguredPositiveInt(
  "GITHUB_ENRICHMENT_MAX_ATTEMPTS",
  3,
  { min: 1, max: 10 },
);
const GITHUB_ENRICHMENT_RETRY_BASE_MS = getConfiguredPositiveInt(
  "GITHUB_ENRICHMENT_RETRY_BASE_MS",
  60_000,
  { min: 15_000, max: 15 * 60_000 },
);
const GITHUB_ENRICHMENT_STALE_MINUTES = getConfiguredPositiveInt(
  "GITHUB_ENRICHMENT_STALE_MINUTES",
  15,
  { min: 1, max: 180 },
);

type GithubEnrichmentJobRow = {
  id: string;
  candidate_id: string;
  search_id: string;
  user_id: string;
  status: string;
  attempt_count: number | null;
  available_at: string;
  locked_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
};

type CandidateRowForGithubJob = {
  id: string;
  search_id: string;
  name: string;
  headline: string | null;
  location: string | null;
  skills: string[] | null;
  match_score: number;
  match_reasons: string[] | null;
  github_url: string | null;
  metadata: Record<string, unknown> | null;
  search: {
    parsed_requirements?: Record<string, unknown> | null;
  } | null;
};

function getConfiguredPositiveInt(
  envName: string,
  fallback: number,
  options: { min?: number; max?: number } = {},
) {
  const raw = process.env[envName];
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const safeValue = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  const min = options.min ?? 1;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(safeValue, min), max);
}

function nowIso() {
  return new Date().toISOString();
}

function extractRequiredSkillsFromParsedRequirements(parsedRequirements: Record<string, unknown> | null | undefined) {
  const parsed = parsedRequirements && typeof parsedRequirements === "object" ? parsedRequirements : {};
  const hiringBrief =
    parsed.hiring_brief && typeof parsed.hiring_brief === "object"
      ? (parsed.hiring_brief as Record<string, unknown>)
      : {};
  const roleCore =
    hiringBrief.role_core && typeof hiringBrief.role_core === "object"
      ? (hiringBrief.role_core as Record<string, unknown>)
      : {};

  return Array.isArray(roleCore.required_skills)
    ? roleCore.required_skills.filter((value): value is string => typeof value === "string")
    : Array.isArray(parsed.required_skills)
      ? parsed.required_skills.filter((value): value is string => typeof value === "string")
      : [];
}

function extractExistingGithubSignals(candidate: CandidateRowForGithubJob) {
  return candidate.metadata?.github_signals && typeof candidate.metadata.github_signals === "object"
    ? (candidate.metadata.github_signals as Record<string, unknown>)
    : null;
}

async function getCandidateForGithubJob(candidateId: string) {
  const { data, error } = await supabaseAdmin
    .from("hirelix_candidates")
    .select("id, search_id, name, headline, location, skills, match_score, match_reasons, github_url, metadata, search:hirelix_searches(parsed_requirements)")
    .eq("id", candidateId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Candidate not found");
  }

  return data as unknown as CandidateRowForGithubJob;
}

async function updateCandidateGithubQueueState(
  candidate: CandidateRowForGithubJob,
  status: "queued" | "running",
) {
  const requiredSkills = extractRequiredSkillsFromParsedRequirements(candidate.search?.parsed_requirements);
  const nextMetadata = {
    ...(candidate.metadata || {}),
    github_signals: buildPendingGithubSignals({
      status,
      candidateName: candidate.name,
      headline: candidate.headline,
      currentCompany: null,
      requiredSkills,
      existingGithubUrl: candidate.github_url,
      existingSignals: extractExistingGithubSignals(candidate),
      queuedAt: nowIso(),
    }),
    github_signal_score: null,
    github_discovery_confidence: 0,
  };

  await supabaseAdmin
    .from("hirelix_candidates")
    .update({
      metadata: nextMetadata,
      github_url: candidate.github_url,
    })
    .eq("id", candidate.id);

  return nextMetadata;
}

export async function enqueueGithubEnrichmentJob(input: {
  candidateId: string;
  searchId: string;
  userId: string;
}) {
  const candidate = await getCandidateForGithubJob(input.candidateId);
  const existingSignals = extractExistingGithubSignals(candidate);
  if (existingSignals?.status === "verified") {
    return {
      candidateId: candidate.id,
      jobId: null as string | null,
      status: "verified" as const,
      metadata: candidate.metadata || {},
    };
  }

  const { data: existingJob } = await supabaseAdmin
    .from("hirelix_github_enrichment_jobs")
    .select("id, status")
    .eq("candidate_id", input.candidateId)
    .maybeSingle();

  if (existingJob?.status === "queued" || existingJob?.status === "running") {
    const pendingMetadata = await updateCandidateGithubQueueState(
      candidate,
      existingJob.status === "running" ? "running" : "queued",
    );
    return {
      candidateId: candidate.id,
      jobId: existingJob.id,
      status: existingJob.status as "queued" | "running",
      metadata: pendingMetadata,
    };
  }

  const pendingMetadata = await updateCandidateGithubQueueState(candidate, "queued");
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
        last_error: null,
        available_at: timestamp,
        locked_at: null,
        started_at: null,
        finished_at: null,
        updated_at: timestamp,
      },
      { onConflict: "candidate_id" },
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to enqueue GitHub enrichment job");
  }

  return {
    candidateId: candidate.id,
    jobId: data.id as string,
    status: "queued" as const,
    metadata: pendingMetadata,
  };
}

export async function enqueueGithubEnrichmentJobsForSearch(input: {
  searchId: string;
  userId: string;
  limit: number;
}) {
  if (input.limit <= 0) return 0;

  const { data: candidates, error } = await supabaseAdmin
    .from("hirelix_candidates")
    .select("id")
    .eq("search_id", input.searchId)
    .order("match_score", { ascending: false })
    .limit(input.limit);

  if (error) {
    throw new Error(error.message || "Failed to load candidates for GitHub queue");
  }

  let queuedCount = 0;
  for (const candidate of candidates || []) {
    const result = await enqueueGithubEnrichmentJob({
      candidateId: candidate.id as string,
      searchId: input.searchId,
      userId: input.userId,
    });
    if (result.status === "queued" || result.status === "running") {
      queuedCount += 1;
    }
  }

  return queuedCount;
}

async function reclaimStaleRunningGithubJobs() {
  const staleBefore = new Date(Date.now() - GITHUB_ENRICHMENT_STALE_MINUTES * 60_000).toISOString();
  await supabaseAdmin
    .from("hirelix_github_enrichment_jobs")
    .update({
      status: "queued",
      available_at: nowIso(),
      locked_at: null,
      last_error: "Reclaimed stale GitHub enrichment job",
      updated_at: nowIso(),
    })
    .eq("status", "running")
    .lt("locked_at", staleBefore);
}

async function claimGithubEnrichmentJob(): Promise<GithubEnrichmentJobRow | null> {
  await reclaimStaleRunningGithubJobs();

  const now = nowIso();
  const { data: jobs } = await supabaseAdmin
    .from("hirelix_github_enrichment_jobs")
    .select("*")
    .eq("status", "queued")
    .lte("available_at", now)
    .order("available_at", { ascending: true })
    .limit(10);

  for (const job of jobs || []) {
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

async function updateRunningGithubJobStatus(
  jobId: string,
  status: string,
  extra: Record<string, unknown> = {},
) {
  const { data } = await supabaseAdmin
    .from("hirelix_github_enrichment_jobs")
    .update({
      status,
      updated_at: nowIso(),
      ...extra,
    })
    .eq("id", jobId)
    .eq("status", "running")
    .select("id")
    .single();

  return Boolean(data?.id);
}

async function hasRunnableGithubEnrichmentJobs() {
  const { count } = await supabaseAdmin
    .from("hirelix_github_enrichment_jobs")
    .select("id", { count: "exact", head: true })
    .eq("status", "queued")
    .lte("available_at", nowIso());

  return (count || 0) > 0;
}

async function processGithubEnrichmentJob(job: GithubEnrichmentJobRow) {
  const candidate = await getCandidateForGithubJob(job.candidate_id);
  await updateCandidateGithubQueueState(candidate, "running");

  const requiredSkills = extractRequiredSkillsFromParsedRequirements(candidate.search?.parsed_requirements);
  const enrichment = await enrichGithubSignalsForCandidate({
    name: candidate.name,
    headline: candidate.headline,
    location: candidate.location,
    skills: Array.isArray(candidate.skills) ? candidate.skills : [],
    githubUrl: candidate.github_url,
    metadata: candidate.metadata,
    requiredSkills,
  });

  if (
    enrichment.githubSignals.status === "api_error" &&
    enrichment.githubSignals.discovery_notes.includes("api_rate_limited") &&
    (job.attempt_count || 0) < GITHUB_ENRICHMENT_MAX_ATTEMPTS
  ) {
    const retryDelayMs = GITHUB_ENRICHMENT_RETRY_BASE_MS * Math.max(1, job.attempt_count || 1);
    await updateCandidateGithubQueueState(candidate, "queued");
    await updateRunningGithubJobStatus(job.id, "queued", {
      available_at: new Date(Date.now() + retryDelayMs).toISOString(),
      locked_at: null,
      last_error: enrichment.githubSignals.evidence_summary?.[1] || "GitHub API rate limited",
    });
    return { requeued: true };
  }

  const updatedCandidate = applyGithubSignalsToCandidateRow({
    candidate: {
      match_score: candidate.match_score,
      match_reasons: Array.isArray(candidate.match_reasons) ? candidate.match_reasons : [],
      github_url: candidate.github_url,
      metadata: candidate.metadata || {},
    },
    enrichment,
  });

  await supabaseAdmin
    .from("hirelix_candidates")
    .update({
      github_url: updatedCandidate.github_url,
      match_score: updatedCandidate.match_score,
      match_reasons: updatedCandidate.match_reasons,
      metadata: updatedCandidate.metadata,
    })
    .eq("id", candidate.id);

  return { requeued: false };
}

export async function processNextGithubEnrichmentJob() {
  const job = await claimGithubEnrichmentJob();
  if (!job) {
    return { processed: false, hasMore: false };
  }

  try {
    const result = await processGithubEnrichmentJob(job);
    if (!result.requeued) {
      await updateRunningGithubJobStatus(job.id, "done", {
        finished_at: nowIso(),
        locked_at: null,
        last_error: null,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub enrichment job failed";
    const shouldRetry = (job.attempt_count || 0) < GITHUB_ENRICHMENT_MAX_ATTEMPTS;
    await updateRunningGithubJobStatus(job.id, shouldRetry ? "queued" : "fatal_error", {
      available_at: shouldRetry
        ? new Date(Date.now() + GITHUB_ENRICHMENT_RETRY_BASE_MS * Math.max(1, job.attempt_count || 1)).toISOString()
        : null,
      last_error: message,
      locked_at: null,
      finished_at: shouldRetry ? null : nowIso(),
    });
  }

  return {
    processed: true,
    hasMore: await hasRunnableGithubEnrichmentJobs(),
  };
}
