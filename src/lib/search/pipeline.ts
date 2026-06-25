import {
  adaptDatasetRecordToBrightDataProfile,
  brightDataProfileToRichText,
  computeFilterHash,
  downloadDatasetSnapshot,
  formatBrightDataSnapshotFailure,
  getBrightDataAccountBalance,
  getDatasetSnapshotMetadata,
  normalizeBrightDataSnapshotCost,
  triggerDatasetFilter,
  type BrightDataDatasetFilterRequest,
  type BrightDataProfile,
  type BrightDataSnapshotMetadata,
} from "@/lib/brightdata";
import { and, eq, gte } from "drizzle-orm";

import { db } from "@/db/client";
import {
  hirelix_llm_usage_events,
  hirelix_searches,
  hirelix_user_settings,
} from "@/db/schema";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import {
  BRIGHTDATA_COMPANY_TARGET_LIMIT,
  BRIGHTDATA_FILTER_POLL_INTERVAL_MS,
  BRIGHTDATA_FILTER_TIMEOUT_MS,
  BRIGHTDATA_HIDDEN_GEM_LIMIT,
  DEEP_REVIEW_DEBUG_LOGS,
  DEEP_SCORING_BATCH_SIZE,
  DEEP_SCORING_CONCURRENCY,
  FAST_JUDGE_BATCH_SIZE,
  FAST_JUDGE_CONCURRENCY,
  HIGHLIGHT_CANDIDATE_COUNT,
  OUTREACH_POOL_TARGET,
  getExecutionRuntime,
  resolveStageConcurrency,
} from "@/lib/search/config";
import { completeSearch } from "@/lib/search/finalize";
import {
  cacheSnapshotEntry,
  expireCachedSnapshot,
  flushPendingLlmUsageEvents,
  loadCachedSnapshotProfiles,
  lookupCachedSnapshot,
  persistSnapshotProfiles,
  retagSearchCandidatePoolTypes,
  setSearchStatus,
  updateCachedSnapshotMetadata,
  updateSearchParsedRequirements,
  updateSearchUsageEventMetadata,
  upsertCandidatesForSearch,
  upsertSingleCandidate,
  type SnapshotCacheEntry,
} from "@/lib/search/persistence";
import {
  buildBrightDataCandidateRows,
  buildBrightDataRecallFilters,
  getRecallPersonas,
  getTotalRecallRequestLimit,
  type RecallRound,
} from "@/lib/search/recall";
import {
  arbitrateCandidateScore,
  deepScoreSelectedProfiles,
  judgeScoreBatch,
  scoreCandidateBatch,
} from "@/lib/search/scoring-runtime";
import { selectShortlistedAssessments, tagPoolRows } from "@/lib/search/scoring";
import { normalizeStoredSearchExpansionFeedback } from "@/lib/search-expansion";
import type {
  CandidateRowInput,
  AdditionalRecallSnapshot,
  CandidateDeliveryBucket,
  ConstraintVerdict,
  ExcludedReasonCount,
  HiringBrief,
  PipelineContext,
  RecallMetadata,
  SearchQualityDiagnosis,
  RecallRoundDiagnostics,
  RecallRoundQualityDistribution,
  RecallSpec,
  ScoredCandidateAssessment,
  SearchDisplayStats,
  SearchJobRow,
  SearchPipelineResult,
  SearchRow,
  SourcingLane,
} from "@/lib/search/types";
import {
  applyProfileScanBudgetToExecutionProfile,
  getInitialSearchExecutionProfile,
  getSearchExecutionProfile,
  normalizeSearchExecutionProfileName,
  normalizeSearchPlanCode,
  type SearchExecutionProfile,
} from "@/lib/search-execution";

export class DatasetRecallPendingError extends Error {
  retryImmediately: boolean;
  retryDelayMs: number;

  constructor(message: string, options?: { retryImmediately?: boolean; retryDelayMs?: number }) {
    super(message);
    this.name = "DatasetRecallPendingError";
    this.retryImmediately = options?.retryImmediately ?? true;
    this.retryDelayMs = Math.max(1000, options?.retryDelayMs ?? BRIGHTDATA_FILTER_POLL_INTERVAL_MS);
  }
}

export class ZeroRecallError extends Error {
  snapshotId: string;

  constructor(snapshotId: string, message?: string) {
    super(message ?? `Bright Data recall produced no profiles for snapshot ${snapshotId}.`);
    this.name = "ZeroRecallError";
    this.snapshotId = snapshotId;
  }
}

export class RecallUnderfilledError extends Error {
  returnedCount: number;
  requestedCount: number;
  minimumCount: number;

  constructor(params: {
    returnedCount: number;
    requestedCount: number;
    minimumCount: number;
  }) {
    super(
      `Bright Data recall returned ${params.returnedCount} profiles, below the minimum ${params.minimumCount} for ${params.requestedCount} requested profiles.`,
    );
    this.name = "RecallUnderfilledError";
    this.returnedCount = params.returnedCount;
    this.requestedCount = params.requestedCount;
    this.minimumCount = params.minimumCount;
  }
}

type SearchPipelineHelpers = {
  nowIso: () => string;
  logSearchEvent: (eventName: string, payload: Record<string, unknown>) => void;
  normalizeNullableString: (value: unknown) => string | null;
  normalizeCountryCode: (value: unknown) => string | null;
  normalizeText: (value: string | null | undefined) => string;
  normalizeScore: (value: unknown) => number;
  normalizeStringArray: (value: unknown, maxItems: number) => string[];
  normalizeEnumValue: <T extends string>(value: unknown, allowed: readonly T[], fallback: T) => T;
  normalizeExperienceYears: (value: unknown) => number | null;
  truncateForPrompt: (text: string, maxChars: number) => string;
  isPlaceholderTitle: (title: string | null | undefined) => boolean;
  deriveCoreSkillsFromJdText: (jdText: string, maxItems?: number) => string[];
  inferCountriesFromJdText: (jdText: string) => string[];
  sanitizeAdvancementRubric: (
    value: unknown,
    parsed: Record<string, unknown>,
  ) => Record<string, string[]>;
  sanitizeHiringBrief: (value: unknown, fallbackParsed: Record<string, unknown>) => HiringBrief;
  sanitizeCompanyProfile: (value: unknown) => Record<string, unknown> | null;
  sanitizeCandidateSuitability: (value: unknown) => ScoredCandidateAssessment["suitability"] | null;
  sanitizeConstraintVerdicts: (value: unknown) => ConstraintVerdict;
  normalizeBlockingConstraints: (value: unknown) => string[];
  normalizeBlockingSeverity: (value: unknown) => ScoredCandidateAssessment["suitability"]["blocking_severity"];
  normalizeAdvanceRecommendation: (
    value: unknown,
  ) => ScoredCandidateAssessment["suitability"]["advance_recommendation"];
  normalizeRecallSpec: (
    value: unknown,
    requestedLimit: number,
    options?: { recordLimitOverride?: number },
  ) => RecallSpec;
  normalizeRecallMetadata: (value: unknown) => RecallMetadata | null;
  normalizeSearchDisplayStats: (value: unknown) => SearchDisplayStats | null;
  buildSearchDisplayStats: (overrides: Partial<SearchDisplayStats>) => SearchDisplayStats;
  buildSearchIntentInput: (jdText: string, userClarification: string | null) => string;
  isWeakParsedIntent: (candidate: Record<string, unknown>, candidateCount: number) => boolean;
  enrichRecallSpecFromJd: (
    parsed: Record<string, unknown>,
    jdText: string,
    requestedLimit: number,
  ) => RecallSpec;
  isActivationRun: (parsed: Record<string, unknown> | null | undefined) => boolean;
  getSearchStartedAt: (parsed: Record<string, unknown>, context: PipelineContext) => string | null | undefined;
  elapsedSince: (startedAt: string | null | undefined, endAt: string) => number | undefined;
  withExecutionState: (
    parsed: Record<string, unknown>,
    executionProfile: SearchExecutionProfile,
    overrides: { planCode: string; displayCount?: number },
  ) => Record<string, unknown>;
  withDisplayStats: (
    parsed: Record<string, unknown>,
    stats: SearchDisplayStats,
  ) => Record<string, unknown>;
  canReuseParsedRequirements: (search: SearchRow) => boolean;
  buildStandardSkillFilter: (
    recallSpec: RecallSpec,
    mode: "primary" | "relaxed",
  ) => BrightDataDatasetFilterRequest["filter"] | null;
  buildRecallLocationFilter: (
    hiringBrief: HiringBrief,
    recallSpec: RecallSpec,
    countryCodes: string[],
    mode: "primary" | "relaxed",
  ) => BrightDataDatasetFilterRequest["filter"] | null;
  buildAdditionalSnapshotMetadata: (params: {
    round: string;
    snapshotId?: string | null;
    recordsLimit?: number | null;
    existing?: AdditionalRecallSnapshot | null;
    status?: AdditionalRecallSnapshot["status"];
    submittedAt?: string | null;
    readyAt?: string | null;
    failedAt?: string | null;
    failureCode?: string | null;
    clearFailure?: boolean;
    lastPolledAt?: string | null;
    downloadStartedAt?: string | null;
    downloadCompletedAt?: string | null;
    profilesReturned?: number | null;
    incrementPollAttempt?: boolean;
    incrementDownloadAttempt?: boolean;
  }) => AdditionalRecallSnapshot;
  hasRecallSnapshotDrift: (
    metadata: RecallMetadata | null,
    filterSummary: RecallFilterSummary,
    executionProfile: SearchExecutionProfile,
    runtime: ReturnType<typeof getExecutionRuntime>,
    requestedLimit: number,
    totalProfileScanBudget?: number,
  ) => boolean;
  mapSnapshotStatus: (metadata: BrightDataSnapshotMetadata | null | undefined) => AdditionalRecallSnapshot["status"];
  isTransientSnapshotDownloadError: (error: unknown) => boolean;
  updateSearchDisplayStat: (
    searchId: string,
    parsed: Record<string, unknown>,
    key: keyof SearchDisplayStats,
    value: number,
  ) => Promise<void>;
  updateSearchDisplayStats: (
    searchId: string,
    parsed: Record<string, unknown>,
    patch: Partial<SearchDisplayStats>,
  ) => Promise<void>;
  markSearchReviewable: (
    context: PipelineContext,
    parsed: Record<string, unknown>,
    statsPatch: Partial<SearchDisplayStats>,
  ) => Promise<void>;
  estimateBrightPipelineLlmCost: (params: {
    context: PipelineContext;
    parsed: Record<string, unknown>;
    renderProfileEntries: string[];
    selectedCount: number;
    finalRows: CandidateRowInput[];
    runtime: ReturnType<typeof getExecutionRuntime>;
  }) => { estimatedLlmCost: number; estimatedSearchTotalCost: number };
  sortCandidateAssessments: (
    left: ScoredCandidateAssessment,
    right: ScoredCandidateAssessment,
  ) => number;
  computeQualityScore: (capabilityScore: number, relevanceScore: number) => number;
  computeAdvanceScore: (
    capabilityScore: number,
    relevanceScore: number,
    joinLikelihoodScore: number,
    blockingSeverity: ScoredCandidateAssessment["suitability"]["blocking_severity"],
  ) => number;
  deriveAdvanceRecommendation: (
    advanceScore: number,
    blockingSeverity: ScoredCandidateAssessment["suitability"]["blocking_severity"],
  ) => ScoredCandidateAssessment["suitability"]["advance_recommendation"];
  deriveFitDecisionFromScore: (
    score: number,
  ) => ScoredCandidateAssessment["suitability"]["fit_decision"];
  deriveShortlistDecision: (
    advanceRecommendation: ScoredCandidateAssessment["suitability"]["advance_recommendation"],
    blockingSeverity: ScoredCandidateAssessment["suitability"]["blocking_severity"],
  ) => "yes" | "no";
  shouldDisplayCandidate: (assessment: ScoredCandidateAssessment) => boolean;
  getDisplayTierForAssessment: (assessment: ScoredCandidateAssessment) => "priority_outreach" | "worth_reviewing" | null;
  buildExcludedReasonCounts: (assessments: ScoredCandidateAssessment[]) => ExcludedReasonCount[];
  buildPromptSearchContext: (parsed: Record<string, unknown>) => string;
  buildCompanyProfileContext: (parsed: Record<string, unknown>) => string;
  getJudgeModel: () => string;
  getArbiterModel: () => string;
  stripSpeculativeRelocation: (texts: string[]) => string[];
  generateOutreachDraftsForRows: (
    context: PipelineContext,
    runtime: ReturnType<typeof getExecutionRuntime>,
    parsed: Record<string, unknown>,
    rows: CandidateRowInput[],
  ) => Promise<CandidateRowInput[]>;
};

export function getDeliveryBucketForAssessment(
  assessment: ScoredCandidateAssessment,
  displayTier: "priority_outreach" | "worth_reviewing" | null,
  shouldRecommendCandidate: (assessment: ScoredCandidateAssessment) => boolean = () => Boolean(displayTier),
): CandidateDeliveryBucket {
  const isRecommended = Boolean(displayTier) && shouldRecommendCandidate(assessment);
  if (isRecommended && displayTier === "priority_outreach") return "reach_first";
  if (isRecommended && displayTier === "worth_reviewing") return "review_next";
  if (
    assessment.suitability.blocking_severity === "hard" ||
    assessment.suitability.advance_recommendation === "reject" ||
    assessment.suitability.bucket === "do_not_show"
  ) {
    return "not_recommended";
  }
  return "lower_priority";
}

function countDeliveryBuckets(rows: CandidateRowInput[]) {
  return rows.reduce(
    (counts, row) => {
      const bucket = row.metadata?.delivery_bucket;
      if (bucket === "reach_first") counts.reachFirst += 1;
      else if (bucket === "review_next") counts.reviewNext += 1;
      else if (bucket === "not_recommended") counts.notRecommended += 1;
      else counts.lowerPriority += 1;
      return counts;
    },
    {
      reachFirst: 0,
      reviewNext: 0,
      lowerPriority: 0,
      notRecommended: 0,
    },
  );
}

type RecallSnapshotRef = {
  round: string;
  snapshotId: string;
  request: BrightDataDatasetFilterRequest;
  recordsLimit: number;
  filterHash: string;
  diagnostics: Omit<RecallRoundDiagnostics, "filter_hash" | "returned_count" | "quality_distribution">;
  submittedAt?: string;
  cacheEntry?: SnapshotCacheEntry | null;
};

type RecallFilterSummary = {
  title_terms: string[];
  country_codes: string[];
  location_terms: string[];
  strict_location_terms?: string[];
  nearby_location_terms?: string[];
  must_have_signals?: string[];
  avoid_profiles?: string[];
};

const SNAPSHOT_PROFILE_CACHE_RERUN_MODE = "snapshot_profile_cache";

function isSnapshotProfileCacheRerun(parsed: Record<string, unknown>) {
  return parsed.rerun_mode === SNAPSHOT_PROFILE_CACHE_RERUN_MODE;
}

export function canAdditionalRecallRoundsOwnEmptyStandardSnapshot(
  additionalSnapshots: Array<Pick<BrightDataSnapshotMetadata, "status">>,
) {
  return additionalSnapshots.some(
    (snapshot) =>
      snapshot.status === "ready" ||
      snapshot.status === "scheduled" ||
      snapshot.status === "building",
  );
}

async function loadSearchLlmUsageStats(
  searchId: string,
  jobId: string,
  startedAtIso: string,
): Promise<Partial<SearchDisplayStats>> {
  const data = await db
    .select({
      model: hirelix_llm_usage_events.model,
      input_tokens: hirelix_llm_usage_events.input_tokens,
      output_tokens: hirelix_llm_usage_events.output_tokens,
      cached_input_tokens: hirelix_llm_usage_events.cached_input_tokens,
      cache_miss_input_tokens: hirelix_llm_usage_events.cache_miss_input_tokens,
    })
    .from(hirelix_llm_usage_events)
    .where(
      and(
        eq(hirelix_llm_usage_events.search_id, searchId),
        eq(hirelix_llm_usage_events.job_id, jobId),
        gte(hirelix_llm_usage_events.created_at, new Date(startedAtIso)),
      ),
    );

  if (!data.length) return {};

  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let cacheMissInputTokens = 0;
  let cost = 0;

  for (const row of data) {
    const model = typeof row.model === "string" ? row.model : "";
    const cached = typeof row.cached_input_tokens === "number" ? row.cached_input_tokens : 0;
    const miss = typeof row.cache_miss_input_tokens === "number" ? row.cache_miss_input_tokens : 0;
    const input = typeof row.input_tokens === "number" ? row.input_tokens : cached + miss;
    const output = typeof row.output_tokens === "number" ? row.output_tokens : 0;
    const isPro = model.includes("pro");
    const hitRate = isPro ? 0.003625 : 0.0028;
    const missRate = isPro ? 0.435 : 0.14;
    const outputRate = isPro ? 0.87 : 0.28;

    inputTokens += input;
    outputTokens += output;
    cachedInputTokens += cached;
    cacheMissInputTokens += miss;
    cost += (cached * hitRate + miss * missRate + output * outputRate) / 1_000_000;
  }

  return {
    llm_input_tokens: inputTokens,
    llm_output_tokens: outputTokens,
    llm_cached_input_tokens: cachedInputTokens,
    llm_cache_miss_input_tokens: cacheMissInputTokens,
    llm_actual_estimated_cost: Math.round(cost * 10000) / 10000,
  };
}

export function shouldReuseProfileCacheDespiteSnapshotDrift(params: {
  hasSnapshotDrift: boolean;
  existingSnapshotId?: string | null;
  standardProfileRowCount?: number | null;
  allowReuse?: boolean;
}) {
  return Boolean(
    params.allowReuse !== false &&
    params.hasSnapshotDrift &&
    params.existingSnapshotId &&
    (params.standardProfileRowCount ?? 0) > 0,
  );
}

const MIN_RECALL_PROFILES_BEFORE_SCORING = 100;

export function getRecallReadyProfileThreshold(requestedProfileCount?: number | null) {
  const requested = Number.isFinite(requestedProfileCount)
    ? Math.max(0, Math.round(requestedProfileCount ?? 0))
    : 0;
  if (requested <= 0) return MIN_RECALL_PROFILES_BEFORE_SCORING;
  return Math.min(MIN_RECALL_PROFILES_BEFORE_SCORING, requested);
}

export function shouldContinueScoringWithStandardRecall(params: {
  standardProfileCount: number;
  deferredAdditionalRoundCount: number;
  requestedProfileCount?: number | null;
}) {
  if (params.deferredAdditionalRoundCount <= 0) return params.standardProfileCount > 0;
  return (
    params.standardProfileCount >=
    getRecallReadyProfileThreshold(params.requestedProfileCount)
  );
}

export function shouldFailUnderfilledRecallAfterSubmittedRounds(params: {
  availableProfileCount: number;
  deferredAdditionalRoundCount: number;
  requestedProfileCount?: number | null;
}) {
  if (params.availableProfileCount <= 0 || params.deferredAdditionalRoundCount > 0) {
    return false;
  }
  return params.availableProfileCount < getRecallReadyProfileThreshold(params.requestedProfileCount);
}

export function shouldWaitForAdditionalRecallBeforeZeroRecall(params: {
  standardProfileCount: number;
  availableProfileCount: number;
  deferredAdditionalRoundCount: number;
}) {
  return (
    params.standardProfileCount === 0 &&
    params.availableProfileCount === 0 &&
    params.deferredAdditionalRoundCount > 0
  );
}

export function shouldWaitForAdditionalRecallBeforeScoring(params: {
  standardProfileCount: number;
  availableProfileCount: number;
  metadataDeferredRoundCount: number;
  downloadDeferredRoundCount: number;
  requestedProfileCount?: number | null;
}) {
  const totalDeferredRoundCount =
    params.metadataDeferredRoundCount + params.downloadDeferredRoundCount;
  if (totalDeferredRoundCount <= 0) return false;
  if (
    shouldWaitForAdditionalRecallBeforeZeroRecall({
      standardProfileCount: params.standardProfileCount,
      availableProfileCount: params.availableProfileCount,
      deferredAdditionalRoundCount: totalDeferredRoundCount,
    })
  ) {
    return true;
  }
  return !shouldContinueScoringWithStandardRecall({
    standardProfileCount: params.standardProfileCount,
    deferredAdditionalRoundCount: totalDeferredRoundCount,
    requestedProfileCount: params.requestedProfileCount,
  });
}

function emptyRecallRoundQualityDistribution(): RecallRoundQualityDistribution {
  return {
    strong_now: 0,
    consider_next: 0,
    do_not_show: 0,
    total_scored: 0,
  };
}

function buildRoundQualityDistribution(
  assessments: ScoredCandidateAssessment[] | undefined,
  profiles: BrightDataProfile[],
) {
  const byRound = new Map<string, RecallRoundQualityDistribution>();
  for (const assessment of assessments ?? []) {
    const profile = profiles[assessment.index] as (BrightDataProfile & { __recall_source?: unknown }) | undefined;
    const round =
      typeof profile?.__recall_source === "string" && profile.__recall_source.length > 0
        ? profile.__recall_source
        : "standard";
    const current = byRound.get(round) ?? emptyRecallRoundQualityDistribution();
    current.total_scored += 1;
    if (assessment.suitability.bucket === "strong_now") current.strong_now += 1;
    else if (assessment.suitability.bucket === "consider_next") current.consider_next += 1;
    else current.do_not_show += 1;
    byRound.set(round, current);
  }
  return byRound;
}

export function buildSearchQualityDiagnosis(stats: {
  requestedCount?: number | null;
  returnedCount?: number | null;
  strictAdvanceCount?: number | null;
  reachFirstCount?: number | null;
  reviewNextCount?: number | null;
}): SearchQualityDiagnosis {
  const requestedCount = Math.max(0, Math.round(stats.requestedCount ?? 0));
  const returnedCount = Math.max(0, Math.round(stats.returnedCount ?? 0));
  const strictAdvanceCount = Math.max(0, Math.round(stats.strictAdvanceCount ?? 0));
  const reachFirstCount = Math.max(0, Math.round(stats.reachFirstCount ?? 0));
  const reviewNextCount = Math.max(0, Math.round(stats.reviewNextCount ?? 0));
  const recommendedCount = reachFirstCount + reviewNextCount;
  const targetRequestedCount = 250;
  const targetReturnedCount = 100;
  const targetStrictAdvanceCount = 5;
  const targetReachFirstCount = 1;
  const targetReviewNextCount = 5;
  const notes: string[] = [];

  let primaryIssue: SearchQualityDiagnosis["primary_issue"] = "healthy";
  if (requestedCount < targetRequestedCount) {
    primaryIssue = "needs_search_calibration";
    notes.push("Profile scan budget was not fully exercised.");
  }
  if (returnedCount < targetReturnedCount) {
    primaryIssue = primaryIssue === "healthy" ? "recall_underfilled" : primaryIssue;
    notes.push("Bright recall returned too few profiles for a robust recruiter decision.");
  }
  if (strictAdvanceCount < targetStrictAdvanceCount) {
    primaryIssue = primaryIssue === "healthy" ? "weak_actionable_yield" : primaryIssue;
    notes.push("Too few candidates cleared the strict advance bar.");
  }
  if (reachFirstCount < targetReachFirstCount) {
    primaryIssue = primaryIssue === "healthy" ? "missing_reach_first" : primaryIssue;
    notes.push("No candidate reached the first-outreach priority tier.");
  }
  if (reviewNextCount < targetReviewNextCount) {
    primaryIssue = primaryIssue === "healthy" ? "review_pool_underfilled" : primaryIssue;
    notes.push("The review-next backup pool is underfilled.");
  }

  const status = primaryIssue === "healthy" ? "meets_bar" : "needs_calibration";
  return {
    status,
    primary_issue: primaryIssue,
    requested_count: requestedCount,
    returned_count: returnedCount,
    strict_advance_count: strictAdvanceCount,
    reach_first_count: reachFirstCount,
    review_next_count: reviewNextCount,
    recommended_count: recommendedCount,
    target_requested_count: targetRequestedCount,
    target_returned_count: targetReturnedCount,
    target_strict_advance_count: targetStrictAdvanceCount,
    target_reach_first_count: targetReachFirstCount,
    target_review_next_count: targetReviewNextCount,
    notes: notes.length > 0 ? notes : ["Search meets the current actionable-delivery bar."],
  };
}

function buildCachedSnapshotMetadata(
  snapshotId: string,
  rows: Record<string, unknown>[],
  cacheEntry?: SnapshotCacheEntry | null,
): BrightDataSnapshotMetadata {
  return {
    id: snapshotId,
    status: "ready",
    dataset_id: "cached",
    dataset_size: cacheEntry?.datasetSize ?? rows.length,
    cost: cacheEntry?.cost ?? undefined,
  };
}

async function persistDownloadedSnapshotProfiles(
  params: {
    rows: Record<string, unknown>[];
    snapshotId: string;
    searchId: string;
    jobId: string;
    sourceRound: string;
    logSearchEvent: SearchPipelineHelpers["logSearchEvent"];
  },
) {
  const result = await persistSnapshotProfiles(params.rows, {
    snapshotId: params.snapshotId,
    searchId: params.searchId,
    jobId: params.jobId,
    sourceRound: params.sourceRound,
  });
  if (!result.ok) {
    params.logSearchEvent("search_snapshot_profile_persist_failed", {
      search_id: params.searchId,
      snapshot_id: params.snapshotId,
      source_round: params.sourceRound,
      row_count: params.rows.length,
      job_id: params.jobId,
      error: result.error instanceof Error ? result.error.message : String(result.error),
    });
    throw new Error(
      `Failed to persist Bright Data snapshot profiles for ${params.sourceRound} snapshot ${params.snapshotId}: ${
        result.error instanceof Error ? result.error.message : String(result.error)
      }`,
      { cause: result.error },
    );
  }
  return result;
}

async function parseJobDescription(
  context: PipelineContext,
  existingParsed: Record<string, unknown> | null | undefined,
  helpers: SearchPipelineHelpers,
) {
  await setSearchStatus(context.searchId, "parsing");
  helpers.logSearchEvent("search_step_started", {
    search_id: context.searchId,
    step: "parsing",
    job_id: context.jobId,
  });

  let parsed: Record<string, unknown> | null = null;
  let lastParseError: string | null = null;
  let estimatedParseCost = 0;
  const userClarification = helpers.normalizeNullableString(existingParsed?.user_clarification);
  const parseInput = helpers.buildSearchIntentInput(context.jdText, userClarification);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const {
        generateLlmJson,
        getLightweightLlmModel,
        resolveDeepSeekThinkingMode,
      } = await import("@/lib/llm-client");
      const { JD_SEARCH_INTENT_JSON_SCHEMA } = await import("@/lib/llm-schemas");
      const { JD_SEARCH_INTENT_PROMPT } = await import("@/lib/prompts");
      const { estimateSearchIntentCost, PARSE_MAX_OUTPUT_TOKENS, PARSE_MAX_ATTEMPTS } = await import("@/lib/search/config");
      const { withTimeout } = await import("@/lib/search/concurrency");

      const { text, data: candidate } = await withTimeout(
        (signal) => generateLlmJson<Record<string, unknown>>({
          model: getLightweightLlmModel(),
          system: JD_SEARCH_INTENT_PROMPT,
          prompt: parseInput,
          maxOutputTokens: PARSE_MAX_OUTPUT_TOKENS,
          abortSignal: signal,
          timeoutMs: 60000,
          temperature: 0,
          jsonSchema: JD_SEARCH_INTENT_JSON_SCHEMA,
          deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_PARSE_THINKING", "disabled"),
          usageEvent: {
            searchId: context.searchId,
            jobId: context.jobId,
            userId: context.userId,
            stage: "parse",
          },
        }),
        60000,
        "Search intent generation",
      );
      estimatedParseCost += estimateSearchIntentCost(parseInput, text);
      if (helpers.isWeakParsedIntent(candidate, context.candidateCount)) {
        lastParseError = "weak_parsed_intent";
        helpers.logSearchEvent("search_parse_retry", {
          search_id: context.searchId,
          attempt,
          reason: lastParseError,
          job_id: context.jobId,
        });
        if (attempt < PARSE_MAX_ATTEMPTS) continue;
      }
      parsed = candidate;
      break;
    } catch (error) {
      lastParseError = error instanceof Error ? error.message : String(error);
      helpers.logSearchEvent("search_parse_retry", {
        search_id: context.searchId,
        attempt,
        reason: lastParseError,
        job_id: context.jobId,
      });
      if (attempt >= 3) break;
    }
  }

  if (!parsed) {
    throw new Error(`Failed to parse job description with LLM: ${lastParseError ?? "unknown error"}`);
  }

  parsed.title = helpers.normalizeNullableString(parsed.title) || "Untitled Role";
  if (userClarification) {
    parsed.user_clarification = userClarification;
  }
  parsed.parse_origin = "pipeline_llm";
  parsed.hiring_brief = helpers.sanitizeHiringBrief(parsed.hiring_brief, parsed);
  parsed.candidate_count = context.candidateCount;
  parsed.display_count = Number(existingParsed?.display_count) || context.candidateCount;
  parsed.highlight_count = Number(existingParsed?.highlight_count) || context.highlightCount;
  parsed.outreach_pool_target = Number(existingParsed?.outreach_pool_target) || context.outreachPoolTarget;
  parsed.plan_code = normalizeSearchPlanCode(existingParsed?.plan_code);
  parsed.activation_run = helpers.isActivationRun(existingParsed);

  try {
    const settingsRows = await db
      .select({ company_profile: hirelix_user_settings.company_profile })
      .from(hirelix_user_settings)
      .where(eq(hirelix_user_settings.user_id, context.userId))
      .limit(1);
    const settings = settingsRows[0] ?? null;
    const companyProfile = helpers.sanitizeCompanyProfile(settings?.company_profile);
    if (companyProfile) {
      parsed.company_profile = companyProfile;
    }
  } catch (error) {
    throw new Error(
      `Failed to load recruiter company profile: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const existingJdCompanyProfile = helpers.sanitizeCompanyProfile(existingParsed?.jd_company_profile);
  const existingJdCompanyWebsite = helpers.normalizeNullableString(existingParsed?.jd_company_website);
  if (existingJdCompanyProfile) {
    parsed.jd_company_profile = existingJdCompanyProfile;
  }
  if (existingJdCompanyWebsite) {
    parsed.jd_company_website = existingJdCompanyWebsite;
  }

  parsed.recall_provider = "brightdata_dataset";
  parsed.recall_spec = helpers.enrichRecallSpecFromJd(parsed, context.jdText, context.candidateCount);
  parsed.advancement_rubric = helpers.sanitizeAdvancementRubric(parsed.advancement_rubric, parsed);
  const { estimateSearchIntentCost, roundCurrency } = await import("@/lib/search/config");
  parsed.estimated_parse_llm_cost = roundCurrency(
    estimatedParseCost || estimateSearchIntentCost(parseInput),
  );
  const existingRecallMetadata = helpers.normalizeRecallMetadata(existingParsed?.recall_metadata);
  if (existingRecallMetadata?.provider === "brightdata_dataset") {
    parsed.recall_metadata = existingRecallMetadata;
  }
  const parseCompletedAt = helpers.nowIso();
  const startedAt = helpers.getSearchStartedAt(parsed, context);
  const currentStats = helpers.normalizeSearchDisplayStats(parsed.display_stats) ?? helpers.buildSearchDisplayStats({});
  parsed.display_stats = helpers.buildSearchDisplayStats({
    ...currentStats,
    brief_ready_at: parseCompletedAt,
    time_to_ack_ms: currentStats.time_to_ack_ms ?? 0,
    time_to_brief_ready_ms:
      currentStats.time_to_brief_ready_ms ?? helpers.elapsedSince(startedAt, parseCompletedAt),
  });
  await db
    .update(hirelix_searches)
    .set({
      title: (parsed.title as string | undefined) || "Untitled Role",
      parsed_requirements: parsed as unknown as Record<string, unknown>,
      parse_completed_at: new Date(parseCompletedAt),
      updated_at: new Date(),
    })
    .where(eq(hirelix_searches.id, context.searchId));

  helpers.logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "parsing",
    brief_ready_at: parseCompletedAt,
    time_to_brief_ready_ms:
      (parsed.display_stats as SearchDisplayStats | undefined)?.time_to_brief_ready_ms ?? null,
    job_id: context.jobId,
  });
  helpers.logSearchEvent("search_brief_ready", {
    search_id: context.searchId,
    brief_ready_at: parseCompletedAt,
    job_id: context.jobId,
  });

  return parsed;
}

async function scoreBrightDataProfiles(
  context: PipelineContext,
  parsed: Record<string, unknown>,
  brightProfiles: BrightDataProfile[],
  retrievalCount: number,
  executionProfile: SearchExecutionProfile,
  helpers: SearchPipelineHelpers,
  options?: {
    progressOffset?: number;
    onFirstVisibleCandidate?: (statsPatch: Partial<SearchDisplayStats>) => Promise<void>;
    totalProfileScanBudget?: number;
    totalProfilesRequested?: number;
  },
): Promise<SearchPipelineResult> {
  const scoringStartMs = Date.now();
  const scoringStartedAtIso = helpers.nowIso();
  const runtime = getExecutionRuntime(executionProfile);
  const renderProfileEntries = brightProfiles.map((profile, index) =>
    brightDataProfileToRichText(profile, index),
  );
  const selectedIndexes = brightProfiles.map((_, index) => index);
  const progressOffset = Math.max(0, options?.progressOffset ?? 0);
  let firstVisibleSignalled = false;
  let scoringStats: Partial<SearchDisplayStats> = {};

  const deepAssessments = await deepScoreSelectedProfiles(
    runtime,
    parsed,
    context.jdText,
    renderProfileEntries,
    selectedIndexes,
    brightProfiles.length,
    {
      scoreCandidateBatch,
      sortCandidateAssessments: helpers.sortCandidateAssessments,
      scoringHelpers: {
        judgeScoreBatch,
        arbitrateCandidateScore,
        logSearchEvent: helpers.logSearchEvent,
        computeQualityScore: helpers.computeQualityScore,
        computeAdvanceScore: helpers.computeAdvanceScore,
        deriveAdvanceRecommendation: helpers.deriveAdvanceRecommendation,
        sanitizeCandidateSuitability: helpers.sanitizeCandidateSuitability,
        normalizeNullableString: helpers.normalizeNullableString,
        deriveFitDecisionFromScore: helpers.deriveFitDecisionFromScore,
        judgeHelpers: {
          truncateForPrompt: helpers.truncateForPrompt,
          buildPromptSearchContext: helpers.buildPromptSearchContext,
          getJudgeModel: helpers.getJudgeModel,
          logSearchEvent: helpers.logSearchEvent,
          sanitizeCandidateSuitability: helpers.sanitizeCandidateSuitability,
          normalizeScore: helpers.normalizeScore,
          stripSpeculativeRelocation: helpers.stripSpeculativeRelocation,
          normalizeStringArray: helpers.normalizeStringArray,
          normalizeBlockingConstraints: helpers.normalizeBlockingConstraints,
          normalizeBlockingSeverity: helpers.normalizeBlockingSeverity,
          normalizeAdvanceRecommendation: helpers.normalizeAdvanceRecommendation,
          normalizeEnumValue: helpers.normalizeEnumValue,
          deriveShortlistDecision: helpers.deriveShortlistDecision,
          normalizeNullableString: helpers.normalizeNullableString,
          sanitizeConstraintVerdicts: helpers.sanitizeConstraintVerdicts,
          normalizeExperienceYears: helpers.normalizeExperienceYears,
        },
        arbiterHelpers: {
          truncateForPrompt: helpers.truncateForPrompt,
          buildPromptSearchContext: helpers.buildPromptSearchContext,
          buildCompanyProfileContext: helpers.buildCompanyProfileContext,
          getArbiterModel: helpers.getArbiterModel,
          logSearchEvent: helpers.logSearchEvent,
          sanitizeCandidateSuitability: helpers.sanitizeCandidateSuitability,
          normalizeStringArray: helpers.normalizeStringArray,
          normalizeExperienceYears: helpers.normalizeExperienceYears,
          normalizeNullableString: helpers.normalizeNullableString,
          sortCandidateAssessments: helpers.sortCandidateAssessments,
        },
      },
    },
    {
      onCandidateScored: async (assessment, completedCount) => {
        const completedTotal = progressOffset + completedCount;
        const displayTier = helpers.getDisplayTierForAssessment(assessment);
        const rows = buildBrightDataCandidateRows(
          brightProfiles,
          [assessment],
          1,
          "outreach_pool",
          {
            getDisplayTierForAssessment: helpers.getDisplayTierForAssessment,
            getDeliveryBucketForAssessment: (candidateAssessment, candidateDisplayTier) =>
              getDeliveryBucketForAssessment(
                candidateAssessment,
                candidateDisplayTier,
                helpers.shouldDisplayCandidate,
              ),
          },
        );
        if (rows.length > 0) {
          await upsertSingleCandidate(context.searchId, rows[0]);
          await retagSearchCandidatePoolTypes(context.searchId);
          if (displayTier && helpers.shouldDisplayCandidate(assessment) && !firstVisibleSignalled) {
            firstVisibleSignalled = true;
            await options?.onFirstVisibleCandidate?.({
              visible_candidate_count: 1,
              shortlist_count: 1,
              priority_outreach_count: displayTier === "priority_outreach" ? 1 : 0,
              worth_reviewing_count: displayTier === "worth_reviewing" ? 1 : 0,
              shortlist_yes_count: helpers.shouldDisplayCandidate(assessment) ? 1 : 0,
              shortlist_no_count: helpers.shouldDisplayCandidate(assessment) ? 0 : 1,
            });
          }
        }
        if (completedTotal % 5 === 0) {
          await helpers.updateSearchDisplayStat(context.searchId, parsed, "deep_review_completed_count", completedTotal);
        }
      },
      onScoringStats: async (stats) => {
        scoringStats = {
          fast_judge_count: stats.fastJudgeCount,
          deep_judge_count: stats.deepJudgeCount,
          arbiter_count: stats.arbiterCount,
          fast_judge_wall_time_ms: stats.fastJudgeWallTimeMs,
          deep_judge_wall_time_ms: stats.deepJudgeWallTimeMs,
          llm_wall_time_ms: stats.llmWallTimeMs,
        };
      },
      searchId: context.searchId,
      jobId: context.jobId,
      userId: context.userId,
    },
  );

  helpers.logSearchEvent("search_timing", {
    search_id: context.searchId,
    phase: "scoring_complete",
    scoring_elapsed_ms: Date.now() - scoringStartMs,
    recall_profile_count: brightProfiles.length,
    deep_review_input: selectedIndexes.length,
    deep_review_output: deepAssessments.length,
    job_id: context.jobId,
  });

  await flushPendingLlmUsageEvents();
  const llmUsageStats = await loadSearchLlmUsageStats(
    context.searchId,
    context.jobId,
    scoringStartedAtIso,
  );
  scoringStats = {
    ...scoringStats,
    ...llmUsageStats,
  };

  if (DEEP_REVIEW_DEBUG_LOGS) {
    helpers.logSearchEvent("deep_review_distribution", {
      search_id: context.searchId,
      requested_count: selectedIndexes.length,
      completed_count: deepAssessments.length,
      selected_indexes: selectedIndexes,
      scores: deepAssessments.map((assessment) => ({
        index: assessment.index,
        match_score: assessment.suitability.match_score,
        quality_score: assessment.suitability.quality_score,
        advance_score: assessment.suitability.advance_score,
        capability_score: assessment.suitability.scoring_breakdown.capability_score,
        relevance_score: assessment.suitability.scoring_breakdown.relevance_score,
        join_likelihood_score: assessment.suitability.scoring_breakdown.join_likelihood_score,
        fit_decision: assessment.suitability.fit_decision,
        actionability: assessment.suitability.actionability,
        advance_recommendation: assessment.suitability.advance_recommendation,
        blocking_severity: assessment.suitability.blocking_severity,
        blocking_constraints: assessment.suitability.blocking_constraints,
      })),
    });
  }

  const fullDetailIncomplete = deepAssessments.length < selectedIndexes.length;
  const hardBlockedCount = deepAssessments.filter(
    (assessment) => assessment.suitability.blocking_severity === "hard",
  ).length;
  const softBlockedCount = deepAssessments.filter(
    (assessment) => assessment.suitability.blocking_severity === "soft",
  ).length;
  const advanceableCount = deepAssessments.filter(
    (assessment) => assessment.suitability.advance_recommendation === "advance",
  ).length;
  const deepSelection = selectShortlistedAssessments(deepAssessments, {
    shouldDisplayCandidate: helpers.shouldDisplayCandidate,
    sortCandidateAssessments: helpers.sortCandidateAssessments,
  });
  const priorityAssessments = deepSelection.selected
    .filter((assessment) => helpers.getDisplayTierForAssessment(assessment) === "priority_outreach");
  const worthReviewingAssessments = deepSelection.selected
    .filter((assessment) => helpers.getDisplayTierForAssessment(assessment) === "worth_reviewing");
  const ruledOutAssessments = deepAssessments
    .filter((assessment) => assessment.suitability.bucket === "do_not_show");
  const visibleAssessments = [...priorityAssessments, ...worthReviewingAssessments];
  const rankedAssessments = [...deepAssessments].sort(helpers.sortCandidateAssessments);
  const excludedReasonCounts = helpers.buildExcludedReasonCounts(ruledOutAssessments);
  helpers.logSearchEvent("search_shortlist_decisions", {
    search_id: context.searchId,
    shortlist_yes_count: deepSelection.shortlistYesCount,
    shortlist_no_count: deepSelection.shortlistNoCount,
    hard_blocked_count: hardBlockedCount,
    job_id: context.jobId,
  });

  const deepRows = buildBrightDataCandidateRows(
    brightProfiles,
    rankedAssessments,
    rankedAssessments.length,
    "main",
    {
      getDisplayTierForAssessment: helpers.getDisplayTierForAssessment,
      getDeliveryBucketForAssessment: (assessment, displayTier) =>
        getDeliveryBucketForAssessment(
          assessment,
          displayTier,
          helpers.shouldDisplayCandidate,
        ),
    },
  );
  const taggedRows = tagPoolRows(deepRows, [], deepRows.length);
  const deliveryCounts = countDeliveryBuckets(taggedRows);
  const finalRows = taggedRows;
  const strictAdvanceCount = deepAssessments.filter((assessment) =>
    assessment.suitability.shortlist_decision === "yes" &&
    assessment.suitability.advance_recommendation === "advance"
  ).length;
  const topQualityScore = deepAssessments.reduce(
    (best, assessment) => Math.max(best, assessment.suitability.quality_score),
    0,
  );
  const top50QualityCutoff = finalRows.length > 0 ? finalRows[finalRows.length - 1]?.match_score ?? 0 : 0;

  if (finalRows.length === 0) {
    throw new Error("No candidates were ranked into the delivered candidate pool.");
  }
  if (fullDetailIncomplete) {
    throw new Error(
      `Deep scoring incomplete: reviewed ${deepAssessments.length}/${selectedIndexes.length} recalled profiles.`,
    );
  }

  const estimatedCosts = helpers.estimateBrightPipelineLlmCost({
    context,
    parsed,
    renderProfileEntries,
    selectedCount: selectedIndexes.length,
    finalRows,
    runtime,
  });
  const contactUnlockCandidates = finalRows.filter((row) => {
    const metadata = row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : null;
    const suitability = helpers.sanitizeCandidateSuitability(metadata?.suitability);
    return suitability?.blocking_severity !== "hard" && suitability?.advance_recommendation !== "reject";
  }).length;
  const shortlistYesCount = deepSelection.shortlistYesCount;
  const shortlistNoCount = deepSelection.shortlistNoCount;
  const clearLocationFitCount = finalRows.filter((row) => {
    const metadata = row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : null;
    const verdicts = metadata?.constraint_verdicts && typeof metadata.constraint_verdicts === "object"
      ? (metadata.constraint_verdicts as ConstraintVerdict)
      : null;
    return verdicts?.location_fit === "local" || verdicts?.location_fit === "nearby";
  }).length;
  const mustHaveStrongCount = finalRows.filter((row) => {
    const metadata = row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : null;
    const verdicts = metadata?.constraint_verdicts && typeof metadata.constraint_verdicts === "object"
      ? (metadata.constraint_verdicts as ConstraintVerdict)
      : null;
    return verdicts?.must_have_coverage === "strong";
  }).length;
  const firstContactConfidenceCount = finalRows.filter((row) => {
    const metadata = row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : null;
    return metadata?.first_contact_confidence === "high";
  }).length;

  return {
    finalRows,
    assessments: deepAssessments,
    displayStats: helpers.buildSearchDisplayStats({
      retrieval_count: retrievalCount,
      recall_profile_count: brightProfiles.length,
      deep_review_requested_count: selectedIndexes.length,
      deep_review_completed_count: deepAssessments.length,
      qualified_count: finalRows.length,
      outreach_pool_count: finalRows.length,
      shortlist_count: finalRows.length,
      brightdata_scrape_count: brightProfiles.length,
      bright_profile_budget: options?.totalProfileScanBudget ?? executionProfile.filterLimit,
      bright_profiles_requested: options?.totalProfilesRequested ?? executionProfile.filterLimit,
      bright_profiles_returned: brightProfiles.length,
      estimated_llm_cost: estimatedCosts.estimatedLlmCost,
      estimated_search_total_cost: estimatedCosts.estimatedSearchTotalCost,
      ...scoringStats,
      judge_mode: runtime.judgeMode,
      activation_run: helpers.isActivationRun(parsed),
      quality_floor_applied: false,
      visible_candidate_count: finalRows.length,
      pre_gate_blocked_count: 0,
      prescreen_blocked_count: 0,
      contact_unlock_candidates: contactUnlockCandidates,
      shortlist_yes_count: shortlistYesCount,
      shortlist_no_count: shortlistNoCount,
      priority_outreach_count: deliveryCounts.reachFirst,
      worth_reviewing_count: deliveryCounts.reviewNext,
      recommended_count: deliveryCounts.reachFirst + deliveryCounts.reviewNext,
      lower_priority_count: deliveryCounts.lowerPriority + deliveryCounts.notRecommended,
      ruled_out_count: ruledOutAssessments.length,
      clear_location_fit_count: clearLocationFitCount,
      must_have_strong_count: mustHaveStrongCount,
      first_contact_confidence_count: firstContactConfidenceCount,
      deep_qualified_rate: deepAssessments.length > 0 ? visibleAssessments.length / deepAssessments.length : 0,
      hard_blocked_count: hardBlockedCount,
      soft_blocked_count: softBlockedCount,
      advanceable_count: advanceableCount,
      top_quality_score: topQualityScore,
      top50_quality_cutoff: top50QualityCutoff,
      strong_now_count: deliveryCounts.reachFirst,
      consider_next_count: deliveryCounts.reviewNext,
      do_not_show_count: deliveryCounts.notRecommended,
      excluded_reason_counts: excludedReasonCounts,
      search_quality_diagnosis: buildSearchQualityDiagnosis({
        requestedCount: options?.totalProfilesRequested ?? executionProfile.filterLimit,
        returnedCount: brightProfiles.length,
        strictAdvanceCount,
        reachFirstCount: deliveryCounts.reachFirst,
        reviewNextCount: deliveryCounts.reviewNext,
      }),
    }),
  };
}

function getProfileRecallSource(profile: BrightDataProfile) {
  const source = (profile as BrightDataProfile & { __recall_source?: unknown }).__recall_source;
  return typeof source === "string" && source.length > 0 ? source : "standard";
}

function safeTruncate(text: string, maxChars: number) {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}...`;
}

function buildRecallObservationPrompt(params: {
  parsed: Record<string, unknown>;
  jdText: string;
  profiles: BrightDataProfile[];
  recallSpec: RecallSpec;
  roundDiagnostics: RecallRoundDiagnostics[];
}) {
  const sourceCounts = params.profiles.reduce<Record<string, number>>((counts, profile) => {
    const source = getProfileRecallSource(profile);
    counts[source] = (counts[source] ?? 0) + 1;
    return counts;
  }, {});
  const profileSamples = params.profiles.slice(0, 36).map((profile, index) => {
    const currentRole = profile.current_company
      ? [profile.current_company.title, profile.current_company.name].filter(Boolean).join(" at ")
      : null;
    const experience = (profile.experience ?? []).slice(0, 2)
      .map((entry) => [entry.title, entry.company, entry.description].filter(Boolean).join(" | "))
      .filter(Boolean)
      .map((entry) => safeTruncate(entry, 280));
    return {
      index,
      recall_source: getProfileRecallSource(profile),
      name: profile.name,
      headline: profile.headline,
      current_role: currentRole,
      location: [profile.city, profile.country_code].filter(Boolean).join(", "),
      about: profile.about ? safeTruncate(profile.about, 360) : null,
      experience,
      skills: (profile.skills ?? []).slice(0, 12),
    };
  });

  return JSON.stringify({
    job_title: params.parsed.title ?? null,
    jd_excerpt: safeTruncate(params.jdText, 1800),
    expansion_feedback: normalizeStoredSearchExpansionFeedback(params.parsed.expansion_feedback),
    current_sourcing_lanes: params.recallSpec.sourcing_lanes,
    recall_rounds: params.roundDiagnostics.map((round) => ({
      round: round.round,
      requested_count: round.requested_count,
      returned_count: round.returned_count ?? null,
      title_terms: round.title_terms,
      skill_terms: [
        ...round.skill_signal_groups.search_domain,
        ...round.skill_signal_groups.platform_engineering,
      ],
    })),
    source_counts: sourceCounts,
    observed_profiles: profileSamples,
  });
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function buildExpansionFeedbackPrompt(params: {
  parsed: Record<string, unknown>;
  jdText: string;
  recallSpec: RecallSpec;
  feedback: NonNullable<ReturnType<typeof normalizeStoredSearchExpansionFeedback>>;
}) {
  const recallMetadata = readRecord(params.parsed.recall_metadata);
  const displayStats = readRecord(params.parsed.display_stats);
  return JSON.stringify({
    job_title: params.parsed.title ?? null,
    jd_excerpt: safeTruncate(params.jdText, 1800),
    expansion_feedback: params.feedback,
    current_sourcing_lanes: params.recallSpec.sourcing_lanes,
    recall_spec_summary: {
      title_variants: params.recallSpec.title_variants,
      core_skill_terms: params.recallSpec.core_skill_terms,
      differentiating_skill_terms: params.recallSpec.differentiating_skill_terms,
      domain_terms: params.recallSpec.domain_terms,
      must_have_signals: params.recallSpec.must_have_signals,
      avoid_profiles: params.recallSpec.avoid_profiles,
      target_companies: params.recallSpec.target_companies,
      countries: params.recallSpec.countries,
      strict_location_terms: params.recallSpec.strict_location_terms,
      nearby_location_terms: params.recallSpec.nearby_location_terms,
    },
    previous_recall: {
      filter_summary: readRecord(recallMetadata?.filter_summary),
      bright_profiles_requested: recallMetadata?.bright_profiles_requested ?? null,
      bright_profiles_returned: recallMetadata?.bright_profiles_returned ?? null,
      recall_profile_count: recallMetadata?.recall_profile_count ?? displayStats?.recall_profile_count ?? null,
      recommended_count: displayStats?.recommended_count ?? null,
      ruled_out_count: displayStats?.ruled_out_count ?? null,
      excluded_reason_counts: Array.isArray(displayStats?.excluded_reason_counts)
        ? displayStats.excluded_reason_counts
        : [],
    },
  });
}

function normalizeReactSourcingLanes(value: unknown, helpers: SearchPipelineHelpers): SourcingLane[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((rawLane) => {
    const lane = rawLane && typeof rawLane === "object"
      ? (rawLane as Record<string, unknown>)
      : {};
    const strategy = helpers.normalizeEnumValue(
      lane.strategy,
      ["title", "skill", "seniority", "company"] as const,
      "skill",
    );
    const titleTerms = helpers.normalizeStringArray(lane.title_terms, 18);
    const skillTerms = helpers.normalizeStringArray(lane.skill_terms, 18);
    const companyTerms = helpers.normalizeStringArray(lane.company_terms, 15);
    if (titleTerms.length === 0 && skillTerms.length === 0 && companyTerms.length === 0) return [];
    const rawWeight = typeof lane.budget_weight === "number" && Number.isFinite(lane.budget_weight)
      ? lane.budget_weight
      : 1;
    return [{
      name: helpers.normalizeNullableString(lane.name) || `react_${strategy}`,
      strategy,
      title_terms: titleTerms,
      skill_terms: skillTerms,
      company_terms: companyTerms,
      avoid_terms: helpers.normalizeStringArray(lane.avoid_terms, 8),
      budget_weight: Math.max(0.25, Math.min(4, rawWeight)),
    } satisfies SourcingLane];
  }).slice(0, 3);
}

async function applyExpansionFeedbackToRecallSpec(params: {
  context: PipelineContext;
  parsed: Record<string, unknown>;
  helpers: SearchPipelineHelpers;
}) {
  const feedback = normalizeStoredSearchExpansionFeedback(params.parsed.expansion_feedback);
  if (!feedback) return;
  const existingExpansionReact = readRecord(params.parsed.expansion_react);
  if (
    existingExpansionReact?.applied === true &&
    existingExpansionReact.feedback_requested_at === feedback.requestedAt
  ) {
    return;
  }

  const {
    generateLlmJson,
    getLightweightLlmModel,
    resolveDeepSeekThinkingMode,
  } = await import("@/lib/llm-client");
  const { RECALL_REACT_JSON_SCHEMA } = await import("@/lib/llm-schemas");
  const { EXPANSION_REACT_PROMPT } = await import("@/lib/prompts");
  const { withTimeout } = await import("@/lib/search/concurrency");

  const recallSpec = params.helpers.normalizeRecallSpec(
    params.parsed.recall_spec,
    params.context.candidateCount,
  );
  const prompt = buildExpansionFeedbackPrompt({
    parsed: params.parsed,
    jdText: params.context.jdText,
    recallSpec,
    feedback,
  });
  const { data } = await withTimeout(
    (signal) => generateLlmJson<Record<string, unknown>>({
      model: getLightweightLlmModel(),
      system: EXPANSION_REACT_PROMPT,
      prompt,
      maxOutputTokens: 2200,
      abortSignal: signal,
      timeoutMs: 60000,
      temperature: 0,
      jsonSchema: RECALL_REACT_JSON_SCHEMA,
      deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_PARSE_THINKING", "disabled"),
      usageEvent: {
        searchId: params.context.searchId,
        jobId: params.context.jobId,
        userId: params.context.userId,
        stage: "expansion_react",
      },
    }),
    60000,
    "Expansion ReAct planning",
  );

  const decision = params.helpers.normalizeEnumValue(
    data.decision,
    ["score_now", "revise_recall"] as const,
    "score_now",
  );
  const revisedLanes = normalizeReactSourcingLanes(data.revised_lanes, params.helpers);
  const diagnosis = params.helpers.normalizeNullableString(data.diagnosis);
  const appliedAt = params.helpers.nowIso();

  params.helpers.logSearchEvent("search_expansion_react_planned", {
    search_id: params.context.searchId,
    decision,
    revised_lane_count: revisedLanes.length,
    feedback_reason: feedback.reasonCode,
    diagnosis,
    job_id: params.context.jobId,
  });

  if (decision === "revise_recall" && revisedLanes.length > 0) {
    params.parsed.recall_spec = {
      ...(params.parsed.recall_spec && typeof params.parsed.recall_spec === "object"
        ? params.parsed.recall_spec as Record<string, unknown>
        : {}),
      sourcing_lanes: revisedLanes,
      recall_strategy: "multi_round",
    };
    params.parsed.recall_metadata = undefined;
  }

  params.parsed.expansion_react = {
    applied: true,
    decision,
    diagnosis,
    revised_lanes: decision === "revise_recall" ? revisedLanes : [],
    feedback_reason_code: feedback.reasonCode,
    feedback_reason: feedback.reasonLabel,
    feedback_note: feedback.note,
    feedback_requested_at: feedback.requestedAt,
    applied_at: appliedAt,
  };
  await updateSearchParsedRequirements(params.context.searchId, params.parsed);
}

async function observeRecallAndMaybeRevise(params: {
  context: PipelineContext;
  parsed: Record<string, unknown>;
  recallSpec: RecallSpec;
  profiles: BrightDataProfile[];
  roundDiagnostics: RecallRoundDiagnostics[];
  helpers: SearchPipelineHelpers;
}) {
  const expansionFeedback = normalizeStoredSearchExpansionFeedback(params.parsed.expansion_feedback);
  if (params.profiles.length === 0) return;
  if (!expansionFeedback && params.profiles.length < Math.max(10, params.context.candidateCount)) return;
  const existingReact = params.parsed.recall_react && typeof params.parsed.recall_react === "object"
    ? (params.parsed.recall_react as Record<string, unknown>)
    : null;
  if (existingReact?.completed === true || existingReact?.revision_applied === true) return;

  const {
    generateLlmJson,
    getLightweightLlmModel,
    resolveDeepSeekThinkingMode,
  } = await import("@/lib/llm-client");
  const { RECALL_REACT_JSON_SCHEMA } = await import("@/lib/llm-schemas");
  const { RECALL_REACT_PROMPT } = await import("@/lib/prompts");
  const { withTimeout } = await import("@/lib/search/concurrency");

  const prompt = buildRecallObservationPrompt({
    parsed: params.parsed,
    jdText: params.context.jdText,
    profiles: params.profiles,
    recallSpec: params.recallSpec,
    roundDiagnostics: params.roundDiagnostics,
  });
  const { data } = await withTimeout(
    (signal) => generateLlmJson<Record<string, unknown>>({
      model: getLightweightLlmModel(),
      system: RECALL_REACT_PROMPT,
      prompt,
      maxOutputTokens: 2600,
      abortSignal: signal,
      timeoutMs: 60000,
      temperature: 0,
      jsonSchema: RECALL_REACT_JSON_SCHEMA,
      deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_PARSE_THINKING", "disabled"),
      usageEvent: {
        searchId: params.context.searchId,
        jobId: params.context.jobId,
        userId: params.context.userId,
        stage: "recall_react",
      },
    }),
    60000,
    "Recall ReAct observation",
  );

  const decision = params.helpers.normalizeEnumValue(
    data.decision,
    ["score_now", "revise_recall"] as const,
    "score_now",
  );
  const revisedLanes = normalizeReactSourcingLanes(data.revised_lanes, params.helpers);
  const diagnosis = params.helpers.normalizeNullableString(data.diagnosis);

  params.helpers.logSearchEvent("search_recall_react_observed", {
    search_id: params.context.searchId,
    decision,
    revised_lane_count: revisedLanes.length,
    diagnosis,
    expansion_feedback_reason: expansionFeedback?.reasonCode ?? null,
    job_id: params.context.jobId,
  });

  if (decision !== "revise_recall" || revisedLanes.length === 0) {
    params.parsed.recall_react = {
      completed: true,
      decision,
      diagnosis,
      revised_lane_count: 0,
      observed_at: params.helpers.nowIso(),
    };
    await updateSearchParsedRequirements(params.context.searchId, params.parsed);
    return;
  }

  params.parsed.recall_spec = {
    ...(params.parsed.recall_spec && typeof params.parsed.recall_spec === "object"
      ? params.parsed.recall_spec as Record<string, unknown>
      : {}),
    sourcing_lanes: revisedLanes,
    recall_strategy: "multi_round",
  };
  params.parsed.recall_react = {
    completed: true,
    revision_applied: true,
    decision,
    diagnosis,
    revised_lanes: revisedLanes,
    observed_profile_count: params.profiles.length,
    observed_at: params.helpers.nowIso(),
  };
  params.parsed.recall_metadata = undefined;
  await updateSearchParsedRequirements(params.context.searchId, params.parsed);
  throw new DatasetRecallPendingError(
    "Recall ReAct revised sourcing lanes after observing Bright Data results",
    { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
  );
}

async function buildBrightDataDatasetCandidates(
  context: PipelineContext,
  parsed: Record<string, unknown>,
  executionProfile: SearchExecutionProfile,
  helpers: SearchPipelineHelpers,
): Promise<SearchPipelineResult | null> {
  const brightDataToken = process.env.BRIGHTDATA_API_TOKEN;
  const runtime = getExecutionRuntime(executionProfile);
  const forceSnapshotProfileCache = isSnapshotProfileCacheRerun(parsed);
  const recallSpec = helpers.normalizeRecallSpec(parsed.recall_spec, context.candidateCount, {
    recordLimitOverride: executionProfile.filterLimit,
  });
  if (!brightDataToken && !forceSnapshotProfileCache) {
    return null;
  }
  const brightDataAuthToken = brightDataToken ?? "";
  const pipelineStartMs = Date.now();

  await setSearchStatus(context.searchId, "searching");
  const existingRecallMetadata = helpers.normalizeRecallMetadata(parsed.recall_metadata);
  let brightBalanceBefore =
    typeof existingRecallMetadata?.bright_balance_before === "number" &&
    Number.isFinite(existingRecallMetadata.bright_balance_before)
      ? existingRecallMetadata.bright_balance_before
      : null;
  let brightBalanceAfter: number | null = null;
  const captureBrightBalanceBefore = async () => {
    if (brightBalanceBefore != null || !brightDataToken) return;
    try {
      brightBalanceBefore = await getBrightDataAccountBalance(brightDataAuthToken);
    } catch (error) {
      helpers.logSearchEvent("bright_balance_check_failed", {
        search_id: context.searchId,
        phase: "before_recall",
        job_id: context.jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const captureBrightBalanceAfter = async () => {
    if (brightBalanceBefore == null || brightBalanceAfter != null || !brightDataToken) return;
    try {
      brightBalanceAfter = await getBrightDataAccountBalance(brightDataAuthToken);
    } catch (error) {
      helpers.logSearchEvent("bright_balance_check_failed", {
        search_id: context.searchId,
        phase: "after_recall",
        job_id: context.jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const getBalanceDeltaCost = () => {
    if (brightBalanceBefore == null || brightBalanceAfter == null) return null;
    const delta = brightBalanceBefore - brightBalanceAfter;
    return Number.isFinite(delta) && delta > 0
      ? Math.round(delta * 10000) / 10000
      : null;
  };
  const getMetadataCost = (snapshot: BrightDataSnapshotMetadata | null | undefined) =>
    normalizeBrightDataSnapshotCost(snapshot?.cost);
  if (forceSnapshotProfileCache && !existingRecallMetadata?.snapshot_id) {
    throw new Error("Snapshot-profile rerun requires an existing Bright Data snapshot id.");
  }
  let snapshotId = existingRecallMetadata?.snapshot_id ?? null;
  let requestedAt = existingRecallMetadata?.requested_at ? Date.parse(existingRecallMetadata.requested_at) : Number.NaN;
  const recallRounds = buildBrightDataRecallFilters(
    parsed,
    context.candidateCount,
    executionProfile,
    {
      normalizeRecallSpec: helpers.normalizeRecallSpec,
      sanitizeHiringBrief: helpers.sanitizeHiringBrief,
      buildStandardSkillFilter: helpers.buildStandardSkillFilter,
      buildRecallLocationFilter: helpers.buildRecallLocationFilter,
      isPlaceholderTitle: helpers.isPlaceholderTitle,
      hiddenGemLimit: BRIGHTDATA_HIDDEN_GEM_LIMIT,
      companyTargetLimit: BRIGHTDATA_COMPANY_TARGET_LIMIT,
    },
  );
  const standardRound = recallRounds.find((round) => round.round === "standard");
  if (!standardRound) {
    return null;
  }
  const additionalRounds = recallRounds.filter((round) => round.round !== "standard");
  let recallRequest = standardRound.request;
  const totalRequestedLimit = getTotalRecallRequestLimit(recallRounds);
  const recallPersonas = getRecallPersonas(recallRounds);
  const totalProfileScanBudget =
    executionProfile.filterLimit + executionProfile.hiddenGemLimit + executionProfile.companyTargetLimit;
  const persistedAdditionalSnapshots = new Map(
    (existingRecallMetadata?.additional_snapshots ?? []).map((snapshot) => [snapshot.round, snapshot]),
  );
  let additionalSnapshotRefs: RecallSnapshotRef[] = [];
  const markAdditionalRoundPending = (round: RecallRound, error: unknown, submittedAt: string) => {
    const message = error instanceof Error ? error.message : String(error);
    persistedAdditionalSnapshots.set(
      round.round,
      helpers.buildAdditionalSnapshotMetadata({
        round: round.round,
        snapshotId: null,
        recordsLimit: round.request.recordsLimit,
        existing: persistedAdditionalSnapshots.get(round.round) ?? null,
        status: "failed",
        submittedAt,
        failedAt: submittedAt,
        failureCode: message.slice(0, 180),
      }),
    );
    helpers.logSearchEvent("search_multi_round_trigger_retrying", {
      search_id: context.searchId,
      round: round.round,
      records_limit: round.request.recordsLimit,
      error: message,
      job_id: context.jobId,
    });
  };
  const submitAdditionalRoundSnapshot = async (round: RecallRound): Promise<RecallSnapshotRef | null> => {
    const submittedAt = helpers.nowIso();
    const roundHash = computeFilterHash(round.request);
    const cachedRoundEntry = await lookupCachedSnapshot(roundHash);
    let roundSnapshotId: string;
    let roundCacheEntry: SnapshotCacheEntry | null = null;
    if (cachedRoundEntry) {
      roundSnapshotId = cachedRoundEntry.snapshotId;
      roundCacheEntry = cachedRoundEntry;
      helpers.logSearchEvent("search_snapshot_cache_hit", {
        search_id: context.searchId,
        round: round.round,
        snapshot_id: roundSnapshotId,
        expires_at: cachedRoundEntry.expiresAt,
        job_id: context.jobId,
      });
    } else {
      if (forceSnapshotProfileCache) {
        throw new Error("Snapshot-profile rerun cannot submit additional Bright Data snapshots.");
      }
      await captureBrightBalanceBefore();
      try {
        roundSnapshotId = await triggerDatasetFilter(brightDataAuthToken, round.request);
      } catch (error) {
        markAdditionalRoundPending(round, error, submittedAt);
        return null;
      }
      void cacheSnapshotEntry({
        snapshotId: roundSnapshotId,
        round: round.round,
        filterHash: roundHash,
        filterSummary: null,
        recordsLimit: round.request.recordsLimit,
      });
      helpers.logSearchEvent("search_multi_round_triggered", {
        search_id: context.searchId,
        round: round.round,
        snapshot_id: roundSnapshotId,
        records_limit: round.request.recordsLimit,
        job_id: context.jobId,
      });
    }
    const ref = {
      round: round.round,
      snapshotId: roundSnapshotId,
      request: round.request,
      recordsLimit: round.request.recordsLimit,
      filterHash: roundHash,
      diagnostics: round.diagnostics,
      submittedAt,
      cacheEntry: roundCacheEntry,
    };
    persistedAdditionalSnapshots.set(
      round.round,
      helpers.buildAdditionalSnapshotMetadata({
        round: round.round,
        snapshotId: roundSnapshotId,
        recordsLimit: round.request.recordsLimit,
        existing: persistedAdditionalSnapshots.get(round.round) ?? null,
        status: "submitted",
        submittedAt,
        clearFailure: true,
      }),
    );
    return ref;
  };
  const buildSubmittedAdditionalSnapshotMetadata = () =>
    additionalRounds.map((round) => {
      const submitted = additionalSnapshotRefs.find((snapshot) => snapshot.round === round.round);
      if (submitted) {
        return helpers.buildAdditionalSnapshotMetadata({
          round: submitted.round,
          snapshotId: submitted.snapshotId,
          recordsLimit: submitted.recordsLimit,
          existing: persistedAdditionalSnapshots.get(submitted.round) ?? null,
          status: "submitted",
          submittedAt: submitted.submittedAt,
        });
      }
      return helpers.buildAdditionalSnapshotMetadata({
        round: round.round,
        snapshotId: null,
        recordsLimit: round.request.recordsLimit,
        existing: persistedAdditionalSnapshots.get(round.round) ?? null,
        status: persistedAdditionalSnapshots.get(round.round)?.status ?? "failed",
      });
    });

  const filterSummary = {
    title_terms: recallSpec.title_variants.length > 0
      ? recallSpec.title_variants
      : [helpers.normalizeNullableString(parsed.title)].filter((value): value is string => Boolean(value)),
    country_codes: recallSpec.countries
      .map((country) => helpers.normalizeCountryCode(country))
      .filter((country): country is string => Boolean(country))
      .slice(0, 4),
    location_terms: recallSpec.location_terms
      .map((term) => helpers.normalizeText(term))
      .filter((term) => term.length >= 3)
      .slice(0, 24),
    strict_location_terms: recallSpec.strict_location_terms
      .map((term) => helpers.normalizeText(term))
      .filter((term) => term.length >= 3)
      .slice(0, 24),
    nearby_location_terms: recallSpec.nearby_location_terms
      .map((term) => helpers.normalizeText(term))
      .filter((term) => term.length >= 3)
      .slice(0, 16),
    must_have_signals: recallSpec.must_have_signals
      .map((term) => helpers.normalizeText(term))
      .filter((term) => term.length >= 3)
      .slice(0, 12),
    avoid_profiles: recallSpec.avoid_profiles
      .map((term) => helpers.normalizeText(term))
      .filter((term) => term.length >= 3)
      .slice(0, 10),
  };
  let standardCacheEntry: SnapshotCacheEntry | null = null;
  const preloadedSnapshotProfileRows = new Map<string, Record<string, unknown>[] | null>();
  const getSnapshotProfileRows = async (targetSnapshotId: string, sourceRound: string) => {
    const key = `${targetSnapshotId}:${sourceRound}`;
    if (preloadedSnapshotProfileRows.has(key)) {
      return preloadedSnapshotProfileRows.get(key) ?? null;
    }
    const rows = await loadCachedSnapshotProfiles(targetSnapshotId, sourceRound);
    const cachedRows = rows?.length ? rows : null;
    preloadedSnapshotProfileRows.set(key, cachedRows);
    return cachedRows;
  };

  const buildRoundDiagnostics = (params: {
    standardReturned?: number | null;
    additionalReturned?: Map<string, number>;
    qualityDistribution?: Map<string, RecallRoundQualityDistribution>;
  } = {}): RecallRoundDiagnostics[] => {
    const roundsForDiagnostics = [
      ...(standardRound ? [standardRound] : []),
      ...additionalRounds,
    ];
    return roundsForDiagnostics.map((round) => {
      const ref = round.round === "standard"
        ? null
        : additionalSnapshotRefs.find((candidate) => candidate.round === round.round);
      const filterHash = ref?.filterHash ?? computeFilterHash(round.request);
      const returnedCount = round.round === "standard"
        ? params.standardReturned
        : params.additionalReturned?.get(round.round);
      return {
        ...round.diagnostics,
        filter_hash: filterHash,
        returned_count: returnedCount ?? null,
        quality_distribution: params.qualityDistribution?.get(round.round) ?? null,
      };
    });
  };

  const submitStandardSnapshot = async (
    request: BrightDataDatasetFilterRequest,
    options?: { relaxed?: boolean },
  ) => {
    const submittedAt = helpers.nowIso();
    const standardHash = computeFilterHash(request);
    const cachedStandardEntry = await lookupCachedSnapshot(standardHash);
    if (cachedStandardEntry) {
      snapshotId = cachedStandardEntry.snapshotId;
      standardCacheEntry = cachedStandardEntry;
      helpers.logSearchEvent("search_snapshot_cache_hit", {
        search_id: context.searchId,
        round: options?.relaxed ? "standard_relaxed" : "standard",
        snapshot_id: snapshotId,
        expires_at: cachedStandardEntry.expiresAt,
        job_id: context.jobId,
      });
    } else {
      if (forceSnapshotProfileCache) {
        throw new Error("Snapshot-profile rerun cannot submit a new Bright Data snapshot.");
      }
      await captureBrightBalanceBefore();
      snapshotId = await triggerDatasetFilter(brightDataAuthToken, request);
      standardCacheEntry = null;
      void cacheSnapshotEntry({
        snapshotId,
        round: options?.relaxed ? "standard_relaxed" : "standard",
        filterHash: standardHash,
        filterSummary,
        recordsLimit: request.recordsLimit,
      });
      helpers.logSearchEvent(options?.relaxed ? "search_standard_round_relaxed" : "search_snapshot_cache_miss", {
        search_id: context.searchId,
        round: options?.relaxed ? "standard_relaxed" : "standard",
        snapshot_id: snapshotId,
        job_id: context.jobId,
      });
    }

    requestedAt = Date.now();
    recallRequest = request;
    parsed.recall_provider = "brightdata_dataset";
    parsed.recall_metadata = {
      provider: "brightdata_dataset",
      snapshot_id: snapshotId,
      requested_at: submittedAt,
      status: "submitted",
      filter_summary: filterSummary,
      bright_profile_budget: totalProfileScanBudget,
      bright_profiles_requested: totalRequestedLimit,
      judge_mode: runtime.judgeMode,
      standard_recall_requested_at: submittedAt,
      recall_personas: recallPersonas,
      round_diagnostics: buildRoundDiagnostics(),
      additional_snapshots: additionalSnapshotRefs.map((round) => ({
        ...helpers.buildAdditionalSnapshotMetadata({
          round: round.round,
          snapshotId: round.snapshotId,
          recordsLimit: round.recordsLimit,
          existing: persistedAdditionalSnapshots.get(round.round) ?? null,
          status: "submitted",
          submittedAt,
        }),
      })),
    } satisfies RecallMetadata;
    await updateSearchParsedRequirements(context.searchId, parsed);
  };

  const existingStandardSnapshotRows = snapshotId
    ? await getSnapshotProfileRows(snapshotId, "standard")
    : null;
  const hasSnapshotDrift = helpers.hasRecallSnapshotDrift(
    existingRecallMetadata,
    filterSummary,
    executionProfile,
    runtime,
    totalRequestedLimit,
    totalProfileScanBudget,
  );
  const shouldKeepSnapshotProfileCache = forceSnapshotProfileCache || shouldReuseProfileCacheDespiteSnapshotDrift({
    hasSnapshotDrift,
    existingSnapshotId: existingRecallMetadata?.snapshot_id,
    standardProfileRowCount: existingStandardSnapshotRows?.length,
    allowReuse: parsed.expand_recall_mode !== "fresh_snapshot",
  });

  if (shouldKeepSnapshotProfileCache) {
    helpers.logSearchEvent("search_recall_snapshot_drift_ignored_for_profile_cache", {
      search_id: context.searchId,
      snapshot_id: existingRecallMetadata?.snapshot_id,
      standard_profile_rows: existingStandardSnapshotRows?.length ?? 0,
      previous_budget: existingRecallMetadata?.bright_profile_budget ?? null,
      next_budget: totalProfileScanBudget,
      previous_judge_mode: existingRecallMetadata?.judge_mode ?? null,
      next_judge_mode: runtime.judgeMode,
      rerun_mode: forceSnapshotProfileCache ? SNAPSHOT_PROFILE_CACHE_RERUN_MODE : null,
      job_id: context.jobId,
    });
  } else if (hasSnapshotDrift) {
    helpers.logSearchEvent("search_recall_snapshot_invalidated", {
      search_id: context.searchId,
      old_snapshot_id: existingRecallMetadata?.snapshot_id,
      execution_profile: executionProfile.name,
      previous_filter_summary: existingRecallMetadata?.filter_summary ?? null,
      next_filter_summary: filterSummary,
      previous_budget: existingRecallMetadata?.bright_profile_budget ?? null,
      next_budget: totalProfileScanBudget,
      previous_judge_mode: existingRecallMetadata?.judge_mode ?? null,
      next_judge_mode: runtime.judgeMode,
      job_id: context.jobId,
    });
    snapshotId = null;
    requestedAt = Number.NaN;
    parsed.recall_metadata = undefined;
    await updateSearchParsedRequirements(context.searchId, parsed);
  }

  if (!snapshotId) {
    await submitStandardSnapshot(recallRequest);

    for (const round of additionalRounds) {
      const submitted = await submitAdditionalRoundSnapshot(round);
      if (submitted) additionalSnapshotRefs.push(submitted);
    }

    parsed.recall_provider = "brightdata_dataset";
    parsed.recall_metadata = {
      ...(helpers.normalizeRecallMetadata(parsed.recall_metadata) ?? {
        provider: "brightdata_dataset" as const,
        snapshot_id: snapshotId!,
      }),
      provider: "brightdata_dataset",
      snapshot_id: snapshotId!,
      requested_at: new Date(requestedAt).toISOString(),
      status: "submitted",
      filter_summary: filterSummary,
      bright_profile_budget: totalProfileScanBudget,
      bright_profiles_requested: totalRequestedLimit,
      judge_mode: runtime.judgeMode,
      recall_personas: recallPersonas,
      round_diagnostics: buildRoundDiagnostics(),
      additional_snapshots: buildSubmittedAdditionalSnapshotMetadata(),
    } satisfies RecallMetadata;
    await updateSearchParsedRequirements(context.searchId, parsed);
    if (additionalSnapshotRefs.length < additionalRounds.length) {
      throw new DatasetRecallPendingError(
        "Bright Data additional recall round submission is incomplete; retrying missing rounds",
        { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
      );
    }
    helpers.logSearchEvent("search_step_started", {
      search_id: context.searchId,
      step: "searching",
      provider: "brightdata_dataset",
      execution_profile: executionProfile.name,
      record_limit: recallRequest.recordsLimit,
      snapshot_id: snapshotId!,
      filter_summary: filterSummary,
      job_id: context.jobId,
    });
  } else {
    additionalSnapshotRefs = forceSnapshotProfileCache
      ? (existingRecallMetadata?.additional_snapshots ?? []).flatMap((snapshot) => {
        if (!snapshot.snapshot_id) return [];
        return [{
          round: snapshot.round,
          snapshotId: snapshot.snapshot_id,
          request: recallRequest,
          recordsLimit: snapshot.records_limit ?? recallRequest.recordsLimit,
          filterHash: snapshot.filter_hash ?? "",
          diagnostics: {
            round: snapshot.round,
            requested_count: snapshot.requested_count ?? snapshot.records_limit ?? 0,
            title_terms: [],
            skill_signal_groups: { search_domain: [], platform_engineering: [] },
            location_mode: "country_only" as const,
          },
          submittedAt: snapshot.submitted_at ?? undefined,
          cacheEntry: null,
        }];
      })
      : additionalRounds.flatMap((round) => {
      const persisted = persistedAdditionalSnapshots.get(round.round);
      if (!persisted?.snapshot_id) return [];
      return [{
        round: round.round,
        snapshotId: persisted.snapshot_id,
        request: round.request,
        recordsLimit: round.request.recordsLimit,
        filterHash: computeFilterHash(round.request),
        diagnostics: round.diagnostics,
        submittedAt: persisted.submitted_at ?? undefined,
      }];
    });
    const submittedRoundNames = new Set(additionalSnapshotRefs.map((round) => round.round));
    for (const round of additionalRounds) {
      if (submittedRoundNames.has(round.round)) continue;
      const submitted = await submitAdditionalRoundSnapshot(round);
      if (submitted) {
        additionalSnapshotRefs.push(submitted);
        submittedRoundNames.add(round.round);
      }
    }
    if (additionalSnapshotRefs.length < additionalRounds.length) {
      parsed.recall_metadata = {
        ...(helpers.normalizeRecallMetadata(parsed.recall_metadata) ?? {
          provider: "brightdata_dataset" as const,
          snapshot_id: snapshotId,
        }),
        provider: "brightdata_dataset",
        snapshot_id: snapshotId,
        requested_at: new Date(requestedAt).toISOString(),
        status: "submitted",
        filter_summary: filterSummary,
        bright_profile_budget: totalProfileScanBudget,
        bright_profiles_requested: totalRequestedLimit,
        judge_mode: runtime.judgeMode,
        recall_personas: recallPersonas,
        round_diagnostics: buildRoundDiagnostics(),
        additional_snapshots: buildSubmittedAdditionalSnapshotMetadata(),
      } satisfies RecallMetadata;
      await updateSearchParsedRequirements(context.searchId, parsed);
      throw new DatasetRecallPendingError(
        "Bright Data additional recall round submission is incomplete; retrying missing rounds",
        { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
      );
    }
    if (!Number.isFinite(requestedAt)) {
      requestedAt = Date.now();
    }
    helpers.logSearchEvent("search_step_started", {
      search_id: context.searchId,
      step: "searching",
      provider: "brightdata_dataset",
      execution_profile: executionProfile.name,
      record_limit: recallRequest.recordsLimit,
      snapshot_id: snapshotId,
      resumed: true,
      filter_summary: filterSummary,
      job_id: context.jobId,
    });
  }

  if (!snapshotId) {
    throw new Error("Bright Data snapshot submission did not return a snapshot id.");
  }
  const activeSnapshotId = snapshotId;

  const totalElapsedMs = Math.max(0, Date.now() - requestedAt);

  let metadata: BrightDataSnapshotMetadata | null = null;
  let profiles: BrightDataProfile[] = [];
  let standardLoadedFromProfileCache = false;

  const cachedStandardRows = await getSnapshotProfileRows(activeSnapshotId, "standard");
  if (cachedStandardRows?.length) {
    standardLoadedFromProfileCache = true;
    profiles = cachedStandardRows.map(adaptDatasetRecordToBrightDataProfile);
    for (const profile of profiles) {
      (profile as BrightDataProfile & { __recall_source?: string }).__recall_source = "standard";
    }
    metadata = buildCachedSnapshotMetadata(activeSnapshotId, cachedStandardRows, standardCacheEntry);
    helpers.logSearchEvent("search_snapshot_profile_cache_hit", {
      search_id: context.searchId,
      round: "standard",
      snapshot_id: activeSnapshotId,
      profiles_returned: profiles.length,
      job_id: context.jobId,
    });
  } else {
    if (forceSnapshotProfileCache) {
      const additionalSnapshotRows = await Promise.all(
        additionalSnapshotRefs.map(async (round) => ({
          ...round,
          rows: await getSnapshotProfileRows(round.snapshotId, round.round),
        })),
      );
      const additionalSnapshotMetadata = additionalSnapshotRows.map((round) =>
        round.rows?.length
          ? buildCachedSnapshotMetadata(round.snapshotId, round.rows, round.cacheEntry)
          : ({
              id: round.snapshotId,
              status: "failed" as const,
              dataset_id: "cached",
              dataset_size: 0,
              warning_code: "profile_cache_rows_missing",
            })
      );

      if (canAdditionalRecallRoundsOwnEmptyStandardSnapshot(additionalSnapshotMetadata)) {
        metadata = {
          id: activeSnapshotId,
          status: "failed",
          dataset_id: "cached",
          dataset_size: 0,
          warning_code: "no_records_found",
        };
      } else {
        throw new Error(`Snapshot-profile rerun could not find DB rows for standard snapshot ${activeSnapshotId}.`);
      }
    } else {
      try {
        metadata = await getDatasetSnapshotMetadata(brightDataAuthToken, activeSnapshotId);
      } catch (error) {
        if (helpers.isTransientSnapshotDownloadError(error)) {
          helpers.logSearchEvent("search_snapshot_metadata_retrying", {
            search_id: context.searchId,
            round: "standard",
            snapshot_id: activeSnapshotId,
            job_id: context.jobId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw new DatasetRecallPendingError(
            `Bright Data metadata temporarily unavailable for snapshot ${activeSnapshotId}`,
            { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
          );
        }
        if (!standardCacheEntry) {
          throw error;
        }
        await expireCachedSnapshot(activeSnapshotId);
        helpers.logSearchEvent("search_snapshot_cache_expired", {
          search_id: context.searchId,
          round: "standard",
          snapshot_id: activeSnapshotId,
          reason: "metadata_unavailable_after_db_miss",
          job_id: context.jobId,
          error: error instanceof Error ? error.message : String(error),
        });
        snapshotId = null;
        await submitStandardSnapshot(recallRequest);
        throw new DatasetRecallPendingError(
          `Bright Data cached snapshot ${activeSnapshotId} was unavailable; submitted replacement snapshot ${snapshotId}`,
          { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
        );
      }
    }
  }

  const additionalSnapshotStates = await Promise.all(
    additionalSnapshotRefs.map(async (round) => {
      const cachedRoundRows = await getSnapshotProfileRows(round.snapshotId, round.round);
      if (cachedRoundRows?.length) {
        helpers.logSearchEvent("search_snapshot_profile_cache_hit", {
          search_id: context.searchId,
          round: round.round,
          snapshot_id: round.snapshotId,
          profiles_returned: cachedRoundRows.length,
          job_id: context.jobId,
        });
        return {
          ...round,
          metadata: buildCachedSnapshotMetadata(round.snapshotId, cachedRoundRows, round.cacheEntry),
          cachedRows: cachedRoundRows,
        };
      }
      if (forceSnapshotProfileCache) {
        throw new Error(
          `Snapshot-profile rerun could not find DB rows for ${round.round} snapshot ${round.snapshotId}.`,
        );
      }
      try {
        const roundMetadata = await getDatasetSnapshotMetadata(brightDataAuthToken, round.snapshotId);
        return { ...round, metadata: roundMetadata, cachedRows: null };
      } catch (error) {
        if (helpers.isTransientSnapshotDownloadError(error)) {
          helpers.logSearchEvent("search_snapshot_metadata_retrying", {
            search_id: context.searchId,
            round: round.round,
            snapshot_id: round.snapshotId,
            job_id: context.jobId,
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            ...round,
            metadata: {
              id: round.snapshotId,
              status: "scheduled" as const,
              dataset_id: round.request.datasetId,
            },
            cachedRows: null,
          };
        }
        if (!round.cacheEntry) {
          throw error;
        }
        await expireCachedSnapshot(round.snapshotId);
        const replacementSubmittedAt = helpers.nowIso();
        await captureBrightBalanceBefore();
        const replacementSnapshotId = await triggerDatasetFilter(brightDataAuthToken, round.request);
        void cacheSnapshotEntry({
          snapshotId: replacementSnapshotId,
          round: round.round,
          filterHash: computeFilterHash(round.request),
          filterSummary: null,
          recordsLimit: round.recordsLimit,
        });
        helpers.logSearchEvent("search_snapshot_cache_expired", {
          search_id: context.searchId,
          round: round.round,
          snapshot_id: round.snapshotId,
          replacement_snapshot_id: replacementSnapshotId,
          reason: "metadata_unavailable_after_db_miss",
          job_id: context.jobId,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          ...round,
          snapshotId: replacementSnapshotId,
          submittedAt: replacementSubmittedAt,
          cacheEntry: null,
          metadata: {
            id: replacementSnapshotId,
            status: "scheduled" as const,
            dataset_id: "cached",
          },
          cachedRows: null,
        };
      }
    }),
  );
  additionalSnapshotRefs = additionalSnapshotStates.map((round) => ({
    round: round.round,
    snapshotId: round.snapshotId,
    request: round.request,
    recordsLimit: round.recordsLimit,
    filterHash: round.filterHash,
    diagnostics: round.diagnostics,
    submittedAt: round.submittedAt,
    cacheEntry: round.cacheEntry,
  }));
  const pollRecordedAt = helpers.nowIso();
  for (const round of additionalSnapshotStates) {
    persistedAdditionalSnapshots.set(
      round.round,
      helpers.buildAdditionalSnapshotMetadata({
        round: round.round,
        snapshotId: round.snapshotId,
        recordsLimit: round.recordsLimit,
        existing: persistedAdditionalSnapshots.get(round.round) ?? null,
        status: helpers.mapSnapshotStatus(round.metadata),
        submittedAt: round.submittedAt ?? persistedAdditionalSnapshots.get(round.round)?.submitted_at ?? null,
        readyAt: round.metadata.status === "ready" ? pollRecordedAt : undefined,
        failedAt: round.metadata.status === "failed" ? pollRecordedAt : undefined,
        failureCode: round.metadata.status === "failed"
          ? String(round.metadata.warning_code ?? round.metadata.error_code ?? "unknown")
          : undefined,
        lastPolledAt: pollRecordedAt,
        profilesReturned: round.metadata.dataset_size ?? null,
        incrementPollAttempt: true,
      }),
    );
  }

  const deferredAdditionalRounds = additionalSnapshotStates.filter(
    (round) => round.metadata.status === "scheduled" || round.metadata.status === "building",
  );
  const waitingOnAdditional = deferredAdditionalRounds.length > 0;
  const standardNoRecords =
    metadata?.status === "failed" && metadata.warning_code === "no_records_found";
  const hasActiveAdditionalRecallRound = additionalSnapshotStates.some(
    (round) =>
      round.metadata.status === "ready" ||
      round.metadata.status === "scheduled" ||
      round.metadata.status === "building",
  );

  if (standardNoRecords && !hasActiveAdditionalRecallRound) {
    throw new ZeroRecallError(
      activeSnapshotId,
      `Bright Data dataset recall returned no records for snapshot ${activeSnapshotId}.`,
    );
  } else if (metadata?.status === "failed" && !standardNoRecords) {
    if (standardCacheEntry) {
      await expireCachedSnapshot(activeSnapshotId);
      helpers.logSearchEvent("search_snapshot_cache_expired", {
        search_id: context.searchId,
        round: "standard",
        snapshot_id: activeSnapshotId,
        reason: "snapshot_failed",
        job_id: context.jobId,
        error: formatBrightDataSnapshotFailure(activeSnapshotId, metadata),
      });
    }
    throw new Error(formatBrightDataSnapshotFailure(activeSnapshotId, metadata));
  }

  const waitingOnStandard = metadata?.status !== "ready" && (!standardNoRecords || waitingOnAdditional);

  if (waitingOnStandard) {
    helpers.logSearchEvent("search_snapshot_poll_status", {
      search_id: context.searchId,
      job_id: context.jobId,
      elapsed_ms: totalElapsedMs,
      timeout_ms: BRIGHTDATA_FILTER_TIMEOUT_MS,
      standard: {
        snapshot_id: activeSnapshotId,
        status: metadata?.status ?? null,
        dataset_size: metadata?.dataset_size ?? null,
        cost: getMetadataCost(metadata),
        warning_code: metadata?.warning_code ?? null,
        error_code: metadata?.error_code ?? null,
      },
      additional: additionalSnapshotStates.map((round) => ({
        round: round.round,
        snapshot_id: round.snapshotId,
        status: round.metadata.status,
        dataset_size: round.metadata.dataset_size ?? null,
        cost: getMetadataCost(round.metadata),
        warning_code: round.metadata.warning_code ?? null,
        error_code: round.metadata.error_code ?? null,
      })),
    });
    parsed.recall_provider = "brightdata_dataset";
    parsed.recall_metadata = {
      provider: "brightdata_dataset",
      snapshot_id: activeSnapshotId,
      requested_at: new Date(requestedAt).toISOString(),
      status: "polling",
      filter_summary: filterSummary,
      bright_profile_budget: totalProfileScanBudget,
      bright_profiles_requested: totalRequestedLimit,
      judge_mode: runtime.judgeMode,
      standard_recall_requested_at:
        helpers.normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_requested_at ??
        new Date(requestedAt).toISOString(),
      standard_recall_ready_at:
        metadata?.status === "ready"
          ? helpers.normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_ready_at ?? pollRecordedAt
          : helpers.normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_ready_at ?? null,
      additional_snapshots: additionalSnapshotStates.map((round) => ({
        ...helpers.buildAdditionalSnapshotMetadata({
          round: round.round,
          snapshotId: round.snapshotId,
          recordsLimit: round.recordsLimit,
          existing: persistedAdditionalSnapshots.get(round.round) ?? null,
          status: helpers.mapSnapshotStatus(round.metadata),
          submittedAt: round.submittedAt ?? persistedAdditionalSnapshots.get(round.round)?.submitted_at ?? null,
          readyAt: round.metadata.status === "ready" ? pollRecordedAt : undefined,
          failedAt: round.metadata.status === "failed" ? pollRecordedAt : undefined,
          failureCode: round.metadata.status === "failed"
            ? String(round.metadata.warning_code ?? round.metadata.error_code ?? "unknown")
            : undefined,
          lastPolledAt: pollRecordedAt,
          profilesReturned: round.metadata.dataset_size ?? null,
        }),
      })),
    } satisfies RecallMetadata;
    await updateSearchParsedRequirements(context.searchId, parsed);
    if (totalElapsedMs >= BRIGHTDATA_FILTER_TIMEOUT_MS) {
      throw new Error(
        `Bright Data dataset recall timed out after ${BRIGHTDATA_FILTER_TIMEOUT_MS}ms (standard=${metadata?.status ?? "unknown"})`,
      );
    }
    throw new DatasetRecallPendingError(
      `Bright Data dataset recall still processing for snapshot ${activeSnapshotId}`,
      { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
    );
  }

  if (waitingOnAdditional) {
    helpers.logSearchEvent("search_additional_rounds_deferred", {
      search_id: context.searchId,
      job_id: context.jobId,
      standard_snapshot_id: activeSnapshotId,
      additional: deferredAdditionalRounds
        .map((round) => ({
          round: round.round,
          snapshot_id: round.snapshotId,
          status: round.metadata.status,
          elapsed_ms: totalElapsedMs,
        })),
    });
  }

  if (metadata?.status === "ready" && !standardLoadedFromProfileCache) {
    const standardDownloadStartedAt = helpers.nowIso();
    try {
      const rows = await downloadDatasetSnapshot(brightDataAuthToken, activeSnapshotId);
      profiles = rows.map(adaptDatasetRecordToBrightDataProfile);
      for (const profile of profiles) {
        (profile as BrightDataProfile & { __recall_source?: string }).__recall_source = "standard";
      }
      await persistDownloadedSnapshotProfiles({
        rows,
        snapshotId: activeSnapshotId,
        searchId: context.searchId,
        jobId: context.jobId,
        sourceRound: "standard",
        logSearchEvent: helpers.logSearchEvent,
      });
      parsed.recall_metadata = {
        ...(helpers.normalizeRecallMetadata(parsed.recall_metadata) ?? {
          provider: "brightdata_dataset" as const,
          snapshot_id: activeSnapshotId,
        }),
        provider: "brightdata_dataset",
        snapshot_id: activeSnapshotId,
        requested_at: new Date(requestedAt).toISOString(),
        standard_recall_requested_at:
          helpers.normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_requested_at ??
          new Date(requestedAt).toISOString(),
        standard_recall_ready_at:
          helpers.normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_ready_at ?? pollRecordedAt,
        standard_download_started_at: standardDownloadStartedAt,
        standard_download_completed_at: helpers.nowIso(),
        recall_personas: recallPersonas,
        round_diagnostics: buildRoundDiagnostics({ standardReturned: profiles.length }),
      } satisfies RecallMetadata;
    } catch (error) {
      if (!helpers.isTransientSnapshotDownloadError(error) && standardCacheEntry) {
        await expireCachedSnapshot(activeSnapshotId);
        helpers.logSearchEvent("search_snapshot_cache_expired", {
          search_id: context.searchId,
          round: "standard",
          snapshot_id: activeSnapshotId,
          reason: "download_unavailable_after_db_miss",
          job_id: context.jobId,
          error: error instanceof Error ? error.message : String(error),
        });
        snapshotId = null;
        await submitStandardSnapshot(recallRequest);
        throw new DatasetRecallPendingError(
          `Bright Data cached snapshot ${activeSnapshotId} could not be downloaded; submitted replacement snapshot ${snapshotId}`,
          { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
        );
      }
      if (!helpers.isTransientSnapshotDownloadError(error)) {
        throw error;
      }
      parsed.recall_provider = "brightdata_dataset";
      parsed.recall_metadata = {
        provider: "brightdata_dataset",
        snapshot_id: activeSnapshotId,
        requested_at: new Date(requestedAt).toISOString(),
        status: "polling",
        filter_summary: filterSummary,
        bright_profile_budget: totalProfileScanBudget,
        bright_profiles_requested: totalRequestedLimit,
        judge_mode: runtime.judgeMode,
        standard_recall_requested_at:
          helpers.normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_requested_at ??
          new Date(requestedAt).toISOString(),
        standard_recall_ready_at:
          helpers.normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_ready_at ?? pollRecordedAt,
        standard_download_started_at: standardDownloadStartedAt,
        recall_personas: recallPersonas,
        round_diagnostics: buildRoundDiagnostics({ standardReturned: profiles.length }),
        additional_snapshots: additionalSnapshotStates.map((round) => ({
          ...helpers.buildAdditionalSnapshotMetadata({
            round: round.round,
            snapshotId: round.snapshotId,
            recordsLimit: round.recordsLimit,
            existing: persistedAdditionalSnapshots.get(round.round) ?? null,
            status: helpers.mapSnapshotStatus(round.metadata),
            submittedAt: round.submittedAt ?? persistedAdditionalSnapshots.get(round.round)?.submitted_at ?? null,
            readyAt: round.metadata.status === "ready" ? pollRecordedAt : undefined,
            failedAt: round.metadata.status === "failed" ? pollRecordedAt : undefined,
            lastPolledAt: pollRecordedAt,
            profilesReturned: round.metadata.dataset_size ?? null,
          }),
        })),
      } satisfies RecallMetadata;
      await updateSearchParsedRequirements(context.searchId, parsed);
      throw new DatasetRecallPendingError(
        `Bright Data snapshot ${activeSnapshotId} is ready but the download is still finalizing`,
        { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
      );
    }
  }

  if (!profiles.length && !standardNoRecords && !hasActiveAdditionalRecallRound) {
    helpers.logSearchEvent("search_provider_failed", {
      search_id: context.searchId,
      provider: "brightdata_dataset",
      reason: "no_results",
      snapshot_id: activeSnapshotId,
      job_id: context.jobId,
    });
    throw new Error(
      `Bright Data standard recall returned no profiles for snapshot ${activeSnapshotId}.`,
    );
  }

  helpers.logSearchEvent("search_timing", {
    search_id: context.searchId,
    phase: "standard_recall_complete",
    elapsed_ms: Date.now() - pipelineStartMs,
    profiles_count: profiles.length,
    job_id: context.jobId,
  });

  const previousRecallMetadataAfterDownload = helpers.normalizeRecallMetadata(parsed.recall_metadata);
  const standardRecallCompletedAt =
    previousRecallMetadataAfterDownload?.standard_recall_completed_at ??
    previousRecallMetadataAfterDownload?.standard_download_completed_at ??
    previousRecallMetadataAfterDownload?.standard_recall_ready_at ??
    helpers.nowIso();
  const standardRecallReadyAt =
    previousRecallMetadataAfterDownload?.standard_recall_ready_at ??
    previousRecallMetadataAfterDownload?.standard_download_completed_at ??
    standardRecallCompletedAt;
  const standardDownloadStartedAt =
    previousRecallMetadataAfterDownload?.standard_download_started_at ??
    standardRecallCompletedAt;
  const standardDownloadCompletedAt =
    previousRecallMetadataAfterDownload?.standard_download_completed_at ??
    standardRecallCompletedAt;
  const searchStartedAt = helpers.getSearchStartedAt(parsed, context);
  const timeToStandardRecallReadyMs =
    helpers.elapsedSince(searchStartedAt, standardRecallReadyAt) ?? (Date.now() - requestedAt);
  parsed.recall_provider = "brightdata_dataset";
  parsed.recall_metadata = {
    provider: "brightdata_dataset",
    snapshot_id: activeSnapshotId,
    dataset_size: metadata.dataset_size ?? profiles.length,
    recall_latency_ms: Date.now() - requestedAt,
    cost: getMetadataCost(metadata),
    bright_profile_budget: totalProfileScanBudget,
    bright_profiles_requested: totalRequestedLimit,
    bright_profiles_returned: profiles.length,
    judge_mode: runtime.judgeMode,
    requested_at: new Date(requestedAt).toISOString(),
    completed_at: standardRecallCompletedAt,
    standard_recall_requested_at: new Date(requestedAt).toISOString(),
    standard_recall_ready_at: standardRecallReadyAt,
    standard_recall_completed_at: standardRecallCompletedAt,
    standard_download_started_at: standardDownloadStartedAt,
    standard_download_completed_at: standardDownloadCompletedAt,
    additional_snapshots: additionalSnapshotStates.map((round) => ({
      ...helpers.buildAdditionalSnapshotMetadata({
        round: round.round,
        snapshotId: round.snapshotId,
        recordsLimit: round.recordsLimit,
        existing: persistedAdditionalSnapshots.get(round.round) ?? null,
        status: helpers.mapSnapshotStatus(round.metadata),
        submittedAt: round.submittedAt ?? persistedAdditionalSnapshots.get(round.round)?.submitted_at ?? null,
        readyAt: round.metadata.status === "ready" ? standardRecallCompletedAt : undefined,
        failedAt: round.metadata.status === "failed" ? standardRecallCompletedAt : undefined,
        failureCode: round.metadata.status === "failed"
          ? String(round.metadata.warning_code ?? round.metadata.error_code ?? "unknown")
          : undefined,
        lastPolledAt: pollRecordedAt,
        profilesReturned: round.metadata.dataset_size ?? null,
      }),
    })),
    recall_personas: recallPersonas,
    round_diagnostics: buildRoundDiagnostics({ standardReturned: profiles.length }),
    status: "ready",
    filter_summary: filterSummary,
  };
  parsed.display_stats = helpers.buildSearchDisplayStats({
    ...(helpers.normalizeSearchDisplayStats(parsed.display_stats) ?? helpers.buildSearchDisplayStats({})),
    bright_profile_budget: totalProfileScanBudget,
    bright_profiles_requested: totalRequestedLimit,
    bright_profiles_returned: profiles.length,
    recall_profile_count: profiles.length,
    retrieval_count: profiles.length,
    deep_review_requested_count: profiles.length,
    deep_review_completed_count: 0,
    judge_mode: runtime.judgeMode,
    time_to_ack_ms: 0,
    time_to_standard_recall_ready_ms: timeToStandardRecallReadyMs,
  });
  await updateSearchParsedRequirements(context.searchId, parsed);
  void updateCachedSnapshotMetadata(activeSnapshotId, {
    datasetSize: metadata.dataset_size ?? profiles.length,
    cost: getMetadataCost(metadata),
  });

  const standardProfileCount = profiles.length;
  const allProfiles = [...profiles];
  let totalRecallCost = getMetadataCost(metadata);
  const additionalReturnedCounts = new Map<string, number>();
  const downloadDeferredAdditionalRounds: Array<{
    round: string;
    snapshotId: string;
    status: BrightDataSnapshotMetadata["status"] | "polling";
  }> = [];

  if (additionalSnapshotRefs.length > 0) {
    const seenIds = new Set<string>();
    for (const profile of allProfiles) {
      const key = profile.linkedin_id || profile.url || profile.name;
      if (key) seenIds.add(key);
    }

    for (const roundRef of additionalSnapshotStates) {
      const { round, snapshotId: roundSnapId, metadata: roundMeta } = roundRef;
      if (roundMeta.status !== "ready") {
        helpers.logSearchEvent("search_multi_round_deferred", {
          search_id: context.searchId,
          round,
          snapshot_id: roundSnapId,
          status: roundMeta.status,
          job_id: context.jobId,
        });
        continue;
      }
      let roundProfiles: BrightDataProfile[];
      const roundDownloadStartedAt = helpers.nowIso();
      if (roundRef.cachedRows?.length) {
        roundProfiles = roundRef.cachedRows.map(adaptDatasetRecordToBrightDataProfile);
      } else {
        try {
          const roundRows = await downloadDatasetSnapshot(brightDataAuthToken, roundSnapId);
          roundProfiles = roundRows.map(adaptDatasetRecordToBrightDataProfile);
          await persistDownloadedSnapshotProfiles({
            rows: roundRows,
            snapshotId: roundSnapId,
            searchId: context.searchId,
            jobId: context.jobId,
            sourceRound: round,
            logSearchEvent: helpers.logSearchEvent,
          });
        } catch (error) {
          if (!helpers.isTransientSnapshotDownloadError(error) && roundRef.cacheEntry) {
            await expireCachedSnapshot(roundSnapId);
            helpers.logSearchEvent("search_snapshot_cache_expired", {
              search_id: context.searchId,
              round,
              snapshot_id: roundSnapId,
              reason: "download_unavailable_after_db_miss",
              job_id: context.jobId,
              error: error instanceof Error ? error.message : String(error),
            });
            persistedAdditionalSnapshots.set(
              round,
              helpers.buildAdditionalSnapshotMetadata({
                round,
                snapshotId: roundSnapId,
                recordsLimit: roundRef.recordsLimit,
                existing: persistedAdditionalSnapshots.get(round) ?? null,
                status: "failed",
                submittedAt: roundRef.submittedAt ?? persistedAdditionalSnapshots.get(round)?.submitted_at ?? null,
                failedAt: helpers.nowIso(),
                failureCode: "cached_snapshot_download_unavailable",
                profilesReturned: null,
              }),
            );
            additionalReturnedCounts.set(round, 0);
            continue;
          }
          if (!helpers.isTransientSnapshotDownloadError(error)) {
            persistedAdditionalSnapshots.set(
              round,
              helpers.buildAdditionalSnapshotMetadata({
                round,
                snapshotId: roundSnapId,
                recordsLimit: roundRef.recordsLimit,
                existing: persistedAdditionalSnapshots.get(round) ?? null,
                status: "failed",
                submittedAt: roundRef.submittedAt ?? persistedAdditionalSnapshots.get(round)?.submitted_at ?? null,
                failedAt: helpers.nowIso(),
                failureCode: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180),
                profilesReturned: null,
              }),
            );
            additionalReturnedCounts.set(round, 0);
            helpers.logSearchEvent("search_multi_round_download_failed_nonblocking", {
              search_id: context.searchId,
              round,
              snapshot_id: roundSnapId,
              job_id: context.jobId,
              error: error instanceof Error ? error.message : String(error),
            });
            continue;
          }
          persistedAdditionalSnapshots.set(
            round,
            helpers.buildAdditionalSnapshotMetadata({
              round,
              snapshotId: roundSnapId,
              recordsLimit: roundRef.recordsLimit,
              existing: persistedAdditionalSnapshots.get(round) ?? null,
              status: "ready",
              submittedAt: roundRef.submittedAt ?? persistedAdditionalSnapshots.get(round)?.submitted_at ?? null,
              readyAt: persistedAdditionalSnapshots.get(round)?.ready_at ?? helpers.nowIso(),
              lastPolledAt: helpers.nowIso(),
              downloadStartedAt: roundDownloadStartedAt,
              profilesReturned: roundMeta?.dataset_size ?? null,
              incrementDownloadAttempt: true,
            }),
          );
          additionalReturnedCounts.set(round, 0);
          downloadDeferredAdditionalRounds.push({
            round,
            snapshotId: roundSnapId,
            status: "polling",
          });
          helpers.logSearchEvent("search_multi_round_download_deferred_nonblocking", {
            search_id: context.searchId,
            round,
            snapshot_id: roundSnapId,
            job_id: context.jobId,
            error: error instanceof Error ? error.message : String(error),
          });
          continue;
        }
      }
      persistedAdditionalSnapshots.set(
        round,
        helpers.buildAdditionalSnapshotMetadata({
          round,
          snapshotId: roundSnapId,
          recordsLimit: roundRef.recordsLimit,
          existing: persistedAdditionalSnapshots.get(round) ?? null,
          status: "ready",
          submittedAt: roundRef.submittedAt ?? persistedAdditionalSnapshots.get(round)?.submitted_at ?? null,
          readyAt: persistedAdditionalSnapshots.get(round)?.ready_at ?? helpers.nowIso(),
          lastPolledAt: persistedAdditionalSnapshots.get(round)?.last_polled_at ?? helpers.nowIso(),
          downloadStartedAt: roundDownloadStartedAt,
          downloadCompletedAt: helpers.nowIso(),
          profilesReturned: roundMeta?.dataset_size ?? roundProfiles.length,
          incrementDownloadAttempt: true,
        }),
      );
      additionalReturnedCounts.set(round, roundProfiles.length);
      if (roundProfiles.length === 0) {
        helpers.logSearchEvent("search_multi_round_empty", {
          search_id: context.searchId,
          round,
          snapshot_id: roundSnapId,
          job_id: context.jobId,
        });
        continue;
      }
      let addedCount = 0;
      for (const profile of roundProfiles) {
        const key = profile.linkedin_id || profile.url || profile.name;
        if (key && seenIds.has(key)) continue;
        if (key) seenIds.add(key);
        (profile as Record<string, unknown>).__recall_source = round;
        allProfiles.push(profile);
        addedCount += 1;
      }
      const roundCost = getMetadataCost(roundMeta);
      if (roundCost != null) {
        totalRecallCost = (totalRecallCost ?? 0) + roundCost;
      }
      void updateCachedSnapshotMetadata(roundSnapId, {
        datasetSize: roundMeta?.dataset_size ?? roundProfiles.length,
        cost: roundCost,
      });
      helpers.logSearchEvent("search_multi_round_completed", {
        search_id: context.searchId,
        round,
        snapshot_id: roundSnapId,
        profiles_returned: roundProfiles.length,
        unique_added: addedCount,
        job_id: context.jobId,
      });
    }
  }

  if (
    shouldWaitForAdditionalRecallBeforeScoring({
      standardProfileCount,
      availableProfileCount: allProfiles.length,
      metadataDeferredRoundCount: deferredAdditionalRounds.length,
      downloadDeferredRoundCount: downloadDeferredAdditionalRounds.length,
      requestedProfileCount: totalRequestedLimit,
    })
  ) {
    const blockedAdditionalRounds = [
      ...deferredAdditionalRounds.map((round) => ({
        round: round.round,
        snapshot_id: round.snapshotId,
        status: round.metadata.status,
      })),
      ...downloadDeferredAdditionalRounds.map((round) => ({
        round: round.round,
        snapshot_id: round.snapshotId,
        status: round.status,
      })),
    ];
    helpers.logSearchEvent("search_additional_rounds_deferred_before_score", {
      search_id: context.searchId,
      job_id: context.jobId,
      standard_profiles: standardProfileCount,
      currently_available_profiles: allProfiles.length,
      deferred_rounds: blockedAdditionalRounds,
    });

    parsed.recall_metadata = {
      ...(helpers.normalizeRecallMetadata(parsed.recall_metadata) ?? {
        provider: "brightdata_dataset" as const,
        snapshot_id: snapshotId,
      }),
      provider: "brightdata_dataset",
      snapshot_id: snapshotId,
      dataset_size: metadata.dataset_size ?? profiles.length,
      recall_latency_ms: Date.now() - requestedAt,
      cost: null,
      cost_source: null,
      bright_balance_before: brightBalanceBefore,
      bright_balance_after: brightBalanceAfter,
      bright_profile_budget: totalProfileScanBudget,
      bright_profiles_requested: totalRequestedLimit,
      bright_profiles_returned: allProfiles.length,
      judge_mode: runtime.judgeMode,
      requested_at: new Date(requestedAt).toISOString(),
      completed_at: standardRecallCompletedAt,
      standard_recall_requested_at: new Date(requestedAt).toISOString(),
      standard_recall_ready_at: standardRecallReadyAt,
      standard_recall_completed_at: standardRecallCompletedAt,
      standard_download_started_at: standardDownloadStartedAt,
      standard_download_completed_at: standardDownloadCompletedAt,
      all_recall_completed_at: null,
      recall_personas: recallPersonas,
      round_diagnostics: buildRoundDiagnostics({
        standardReturned: standardProfileCount,
        additionalReturned: additionalReturnedCounts,
      }),
      additional_snapshots: additionalSnapshotRefs.map((round) => ({
        ...helpers.buildAdditionalSnapshotMetadata({
          round: round.round,
          snapshotId: round.snapshotId,
          recordsLimit: round.recordsLimit,
          existing: persistedAdditionalSnapshots.get(round.round) ?? null,
          status: persistedAdditionalSnapshots.get(round.round)?.status ?? "polling",
          submittedAt: round.submittedAt ?? persistedAdditionalSnapshots.get(round.round)?.submitted_at ?? null,
          readyAt: persistedAdditionalSnapshots.get(round.round)?.ready_at ?? null,
          failedAt: persistedAdditionalSnapshots.get(round.round)?.failed_at ?? null,
          lastPolledAt: persistedAdditionalSnapshots.get(round.round)?.last_polled_at ?? null,
          downloadStartedAt: persistedAdditionalSnapshots.get(round.round)?.download_started_at ?? null,
          downloadCompletedAt: persistedAdditionalSnapshots.get(round.round)?.download_completed_at ?? null,
          profilesReturned: persistedAdditionalSnapshots.get(round.round)?.profiles_returned ?? null,
        }),
      })),
      status: "polling",
      filter_summary: filterSummary,
    };
    await updateSearchParsedRequirements(context.searchId, parsed);
    throw new DatasetRecallPendingError(
      `Waiting for ${blockedAdditionalRounds.length} additional recall round(s) before scoring ${allProfiles.length} profiles`,
      { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
    );
  }

  if (deferredAdditionalRounds.length > 0) {
    helpers.logSearchEvent("search_additional_rounds_nonblocking_before_score", {
      search_id: context.searchId,
      job_id: context.jobId,
      standard_profiles: standardProfileCount,
      currently_available_profiles: allProfiles.length,
      deferred_rounds: deferredAdditionalRounds.map((round) => ({
        round: round.round,
        snapshot_id: round.snapshotId,
        status: round.metadata.status,
      })),
    });
  }

  await captureBrightBalanceAfter();
  const balanceDeltaCost = getBalanceDeltaCost();
  const resolvedRecallCost = totalRecallCost ?? balanceDeltaCost;
  const resolvedRecallCostSource = totalRecallCost != null
    ? "metadata"
    : balanceDeltaCost != null
      ? "balance_delta"
      : null;
  const scoringRecallReadyAt = helpers.nowIso();
  const allRecallCompletedAt = deferredAdditionalRounds.length === 0 ? scoringRecallReadyAt : null;
  const persistedAdditionalSnapshotList = additionalSnapshotRefs.map((round) =>
    persistedAdditionalSnapshots.get(round.round) ??
    helpers.buildAdditionalSnapshotMetadata({
      round: round.round,
      snapshotId: round.snapshotId,
      recordsLimit: round.recordsLimit,
      existing: null,
      status: "ready",
      submittedAt: round.submittedAt ?? null,
    }),
  );
  parsed.recall_metadata = {
    ...(helpers.normalizeRecallMetadata(parsed.recall_metadata) ?? {
      provider: "brightdata_dataset" as const,
      snapshot_id: snapshotId,
    }),
    provider: "brightdata_dataset",
    snapshot_id: snapshotId,
    dataset_size: metadata.dataset_size ?? profiles.length,
    recall_latency_ms: Date.now() - requestedAt,
    cost: resolvedRecallCost ?? null,
    cost_source: resolvedRecallCostSource,
    bright_balance_before: brightBalanceBefore,
    bright_balance_after: brightBalanceAfter,
    bright_profile_budget: totalProfileScanBudget,
    bright_profiles_requested: totalRequestedLimit,
    bright_profiles_returned: allProfiles.length,
    judge_mode: runtime.judgeMode,
    requested_at: new Date(requestedAt).toISOString(),
    completed_at: standardRecallCompletedAt,
    standard_recall_requested_at: new Date(requestedAt).toISOString(),
    standard_recall_ready_at: standardRecallReadyAt,
    standard_recall_completed_at: standardRecallCompletedAt,
    standard_download_started_at: standardDownloadStartedAt,
    standard_download_completed_at: standardDownloadCompletedAt,
    all_recall_completed_at: allRecallCompletedAt,
    recall_personas: recallPersonas,
    round_diagnostics: buildRoundDiagnostics({
      standardReturned: standardProfileCount,
      additionalReturned: additionalReturnedCounts,
    }),
    additional_snapshots: persistedAdditionalSnapshotList,
    status: "ready",
    filter_summary: filterSummary,
  };
  await updateSearchParsedRequirements(context.searchId, parsed);

  const recallReadyProfileThreshold = getRecallReadyProfileThreshold(totalRequestedLimit);
  if (
    shouldFailUnderfilledRecallAfterSubmittedRounds({
      availableProfileCount: allProfiles.length,
      deferredAdditionalRoundCount: deferredAdditionalRounds.length + downloadDeferredAdditionalRounds.length,
      requestedProfileCount: totalRequestedLimit,
    })
  ) {
    helpers.logSearchEvent("search_recall_underfilled_after_all_rounds", {
      search_id: context.searchId,
      job_id: context.jobId,
      requested_profiles: totalRequestedLimit,
      returned_profiles: allProfiles.length,
      minimum_profiles: recallReadyProfileThreshold,
      standard_profiles: standardProfileCount,
      additional_profiles: allProfiles.length - standardProfileCount,
    });
    throw new RecallUnderfilledError({
      returnedCount: allProfiles.length,
      requestedCount: totalRequestedLimit,
      minimumCount: recallReadyProfileThreshold,
    });
  }

  await observeRecallAndMaybeRevise({
    context,
    parsed,
    recallSpec,
    profiles: allProfiles,
    roundDiagnostics: buildRoundDiagnostics({
      standardReturned: standardProfileCount,
      additionalReturned: additionalReturnedCounts,
    }),
    helpers,
  });

  helpers.logSearchEvent("search_timing", {
    search_id: context.searchId,
    phase: deferredAdditionalRounds.length > 0 ? "standard_recall_ready_for_scoring" : "all_recall_complete",
    elapsed_ms: Date.now() - pipelineStartMs,
    total_profiles: allProfiles.length,
    standard_profiles: standardProfileCount,
    additional_profiles: allProfiles.length - standardProfileCount,
    additional_rounds_in_progress: deferredAdditionalRounds.length,
    job_id: context.jobId,
  });

  await setSearchStatus(context.searchId, "screening", {
    search_completed_at: standardRecallCompletedAt,
    parsed_requirements: parsed,
  });
  helpers.logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "searching",
    provider: "brightdata_dataset",
    execution_profile: executionProfile.name,
    snapshot_id: activeSnapshotId,
    result_count: allProfiles.length,
    dataset_size: metadata.dataset_size ?? profiles.length,
    recall_latency_ms: Date.now() - requestedAt,
    additional_rounds_in_progress: deferredAdditionalRounds.length,
    job_id: context.jobId,
  });
  helpers.logSearchEvent("search_step_started", {
    search_id: context.searchId,
    step: "screening",
    provider: "brightdata_dataset",
    execution_profile: executionProfile.name,
    recall_batch: "unified",
    deep_scoring_batch_size: DEEP_SCORING_BATCH_SIZE,
    deep_scoring_concurrency: resolveStageConcurrency(
      DEEP_SCORING_CONCURRENCY,
      Math.ceil(allProfiles.length / DEEP_SCORING_BATCH_SIZE),
    ),
    fast_judge_batch_size: FAST_JUDGE_BATCH_SIZE,
    fast_judge_concurrency: resolveStageConcurrency(
      FAST_JUDGE_CONCURRENCY,
      Math.ceil(allProfiles.length / FAST_JUDGE_BATCH_SIZE),
    ),
    low_cost_mode: executionProfile.lowCostMode,
    single_judge_mode: executionProfile.singleJudgeMode,
    job_id: context.jobId,
  });

  await helpers.updateSearchDisplayStats(context.searchId, parsed, {
    bright_profiles_returned: allProfiles.length,
    recall_profile_count: allProfiles.length,
    retrieval_count: allProfiles.length,
    deep_review_requested_count: allProfiles.length,
    deep_review_completed_count: 0,
    bright_snapshot_cost: resolvedRecallCost ?? undefined,
    bright_profile_budget: totalProfileScanBudget,
    bright_profiles_requested: totalRequestedLimit,
    judge_mode: runtime.judgeMode,
    time_to_ack_ms: 0,
    time_to_standard_recall_ready_ms: timeToStandardRecallReadyMs,
  });

  const handleFirstVisibleCandidate = async (statsPatch: Partial<SearchDisplayStats>) => {
    await helpers.markSearchReviewable(context, parsed, statsPatch);
  };

  if (allProfiles.length === 0) {
    throw new ZeroRecallError(activeSnapshotId);
  }
  const combinedResult = await scoreBrightDataProfiles(
    context,
    parsed,
    allProfiles,
    allProfiles.length,
    executionProfile,
    helpers,
    {
      progressOffset: 0,
      onFirstVisibleCandidate: handleFirstVisibleCandidate,
      totalProfileScanBudget,
      totalProfilesRequested: totalRequestedLimit,
    },
  );

  const qualityDistributionByRound = buildRoundQualityDistribution(
    combinedResult.assessments,
    allProfiles,
  );
  parsed.recall_metadata = {
    ...(helpers.normalizeRecallMetadata(parsed.recall_metadata) ?? {
      provider: "brightdata_dataset" as const,
      snapshot_id: activeSnapshotId,
    }),
    provider: "brightdata_dataset",
    snapshot_id: activeSnapshotId,
    recall_personas: recallPersonas,
    round_diagnostics: buildRoundDiagnostics({
      standardReturned: standardProfileCount,
      additionalReturned: additionalReturnedCounts,
      qualityDistribution: qualityDistributionByRound,
    }),
  };

  helpers.logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "deep_scoring",
    provider: "brightdata_dataset",
    execution_profile: executionProfile.name,
    result_count: combinedResult.finalRows.length,
    retrieved_count: allProfiles.length,
    shortlist_count: combinedResult.displayStats.shortlist_count,
    job_id: context.jobId,
  });

  helpers.logSearchEvent("search_timing", {
    search_id: context.searchId,
    phase: "pipeline_complete",
    total_elapsed_ms: Date.now() - pipelineStartMs,
    job_id: context.jobId,
  });

  return {
    ...combinedResult,
    displayStats: helpers.buildSearchDisplayStats({
      ...(helpers.normalizeSearchDisplayStats(parsed.display_stats) ?? helpers.buildSearchDisplayStats({})),
      ...combinedResult.displayStats,
      bright_snapshot_cost: resolvedRecallCost ?? undefined,
      bright_profile_budget: totalProfileScanBudget,
      bright_profiles_requested: totalRequestedLimit,
      bright_profiles_returned: allProfiles.length,
      judge_mode: runtime.judgeMode,
    }),
  };
}

export async function runSearchPipeline(job: SearchJobRow, helpers: SearchPipelineHelpers) {
  const searchRows = await db
    .select({
      id: hirelix_searches.id,
      user_id: hirelix_searches.user_id,
      jd_text: hirelix_searches.jd_text,
      parsed_requirements: hirelix_searches.parsed_requirements,
      status: hirelix_searches.status,
      parse_completed_at: hirelix_searches.parse_completed_at,
      created_at: hirelix_searches.created_at,
    })
    .from(hirelix_searches)
    .where(eq(hirelix_searches.id, job.search_id))
    .limit(1);
  const search = searchRows[0];

  if (!search) {
    throw new Error("Search not found");
  }

  const existingParsed =
    (search as SearchRow).parsed_requirements &&
    typeof (search as SearchRow).parsed_requirements === "object"
      ? ((search as SearchRow).parsed_requirements as Record<string, unknown>)
      : null;
  let planCode = normalizeSearchPlanCode(existingParsed?.plan_code);
  if (!existingParsed?.plan_code) {
    const billing = await getBillingSummaryForUser(job.user_id);
    planCode = normalizeSearchPlanCode(billing.plan.code);
  }
  const storedInitialProfileName = normalizeSearchExecutionProfileName(existingParsed?.execution_profile);
  const initialExecutionProfile = storedInitialProfileName
    ? getSearchExecutionProfile(storedInitialProfileName)
    : getInitialSearchExecutionProfile(planCode);
  const storedProfileScanBudget =
    typeof existingParsed?.profile_scan_budget === "number" &&
    Number.isFinite(existingParsed.profile_scan_budget)
      ? Math.max(1, Math.round(existingParsed.profile_scan_budget))
      : null;
  const initialExecutionProfileWithBudget =
    storedProfileScanBudget === null
      ? initialExecutionProfile
      : applyProfileScanBudgetToExecutionProfile(initialExecutionProfile, storedProfileScanBudget);
  const deliveryReferenceCount = Math.max(
    1,
    storedProfileScanBudget ??
      (Number(job.candidate_count || (search as SearchRow).parsed_requirements?.candidate_count) ||
        initialExecutionProfileWithBudget.deliveryReferenceCount),
  );

  const context: PipelineContext = {
    searchId: job.search_id,
    jobId: job.id,
    userId: job.user_id,
    jdText: job.jd_text || (search as SearchRow).jd_text,
    createdAt:
      typeof (search as SearchRow & { created_at?: string | null }).created_at === "string"
        ? (search as SearchRow & { created_at?: string | null }).created_at ?? null
        : null,
    planCode,
    candidateCount: deliveryReferenceCount,
    highlightCount:
      Number((search as SearchRow).parsed_requirements?.highlight_count) ||
      HIGHLIGHT_CANDIDATE_COUNT,
    outreachPoolTarget:
      Number((search as SearchRow).parsed_requirements?.outreach_pool_target) ||
      deliveryReferenceCount ||
      OUTREACH_POOL_TARGET,
  };

  const parsed = helpers.canReuseParsedRequirements(search as SearchRow)
    ? {
      ...((search as SearchRow).parsed_requirements || {}),
      candidate_count: context.candidateCount,
      display_count: context.candidateCount,
      highlight_count:
        Number((search as SearchRow).parsed_requirements?.highlight_count) ||
        context.highlightCount,
      outreach_pool_target:
        Number((search as SearchRow).parsed_requirements?.outreach_pool_target) ||
        context.outreachPoolTarget,
      plan_code: planCode,
      activation_run: false,
      recall_provider: "brightdata_dataset",
      hiring_brief: helpers.sanitizeHiringBrief(
        (search as SearchRow).parsed_requirements?.hiring_brief,
        (search as SearchRow).parsed_requirements || {},
      ),
      recall_spec: helpers.normalizeRecallSpec(
        (search as SearchRow).parsed_requirements?.recall_spec,
        context.candidateCount,
      ),
      advancement_rubric: helpers.sanitizeAdvancementRubric(
        (search as SearchRow).parsed_requirements?.advancement_rubric,
        (search as SearchRow).parsed_requirements || {},
      ),
    }
    : await parseJobDescription(context, (search as SearchRow).parsed_requirements, helpers);

  await applyExpansionFeedbackToRecallSpec({
    context,
    parsed,
    helpers,
  });

  parsed.recall_provider = "brightdata_dataset";
  parsed.recall_spec = helpers.normalizeRecallSpec(parsed.recall_spec, context.candidateCount, {
    recordLimitOverride: initialExecutionProfileWithBudget.filterLimit,
  });
  const phase1Parsed = helpers.withExecutionState(parsed, initialExecutionProfileWithBudget, {
    planCode,
    displayCount: context.candidateCount,
  });

  const isFreshExpandRun = phase1Parsed.expand_recall_mode === "fresh_snapshot";
  const phase1Result = await buildBrightDataDatasetCandidates(
    context,
    phase1Parsed,
    initialExecutionProfileWithBudget,
    helpers,
  );
  if (!phase1Result) {
    throw new Error("Bright Data recall did not return a pipeline result.");
  }
  if (isSnapshotProfileCacheRerun(phase1Parsed)) {
    phase1Parsed.last_rerun_mode = SNAPSHOT_PROFILE_CACHE_RERUN_MODE;
    phase1Parsed.last_rerun_completed_at = helpers.nowIso();
    delete phase1Parsed.rerun_mode;
  }
  if (isFreshExpandRun) {
    phase1Parsed.last_expand_completed_at = helpers.nowIso();
    phase1Parsed.last_expanded_profile_scan_budget = storedProfileScanBudget;
    delete phase1Parsed.expand_recall_mode;
  }

  await completeSearch(
    context,
    phase1Parsed,
    phase1Result.finalRows,
    helpers.buildSearchDisplayStats(phase1Result.displayStats),
    {
      nowIso: helpers.nowIso,
      getSearchStartedAt: helpers.getSearchStartedAt,
      elapsedSince: helpers.elapsedSince,
      buildSearchDisplayStats: helpers.buildSearchDisplayStats,
      generateOutreachDraftsForRows: helpers.generateOutreachDraftsForRows,
      getExecutionRuntime: (executionProfile) =>
        getExecutionRuntime(executionProfile as SearchExecutionProfile),
      getSearchExecutionProfile: (name) =>
        getSearchExecutionProfile(name as Parameters<typeof getSearchExecutionProfile>[0]),
      upsertCandidatesForSearch,
      withDisplayStats: helpers.withDisplayStats,
      setSearchStatus,
      updateSearchUsageEventMetadata,
      logSearchEvent: helpers.logSearchEvent,
    },
    {
      replaceMissingCandidates: !isFreshExpandRun,
      runtime: getExecutionRuntime(initialExecutionProfileWithBudget),
    },
  );
}
