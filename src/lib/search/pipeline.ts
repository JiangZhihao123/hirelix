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
import { countEligibleProfiles } from "@/lib/candidate-index/retrieval";
import { buildCandidateIndexSearchIntent, runCandidateIndexWorkflow } from "@/lib/candidate-index/workflow";
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
  buildBrightDataRecallFilterForLane,
  buildBrightDataRecallFilters,
  getHeadhunterRecallStrategyMode,
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
import {
  planAdaptiveExpansion,
  type AdaptiveExpansionPlan,
} from "@/lib/search/adaptive-expansion";
import {
  buildLaneAuditUserPrompt,
  normalizeLaneAuditResult,
  type LaneAuditResult,
} from "@/lib/search/lane-auditor";
import {
  applyLaneContractReviewToParsed,
  buildDeterministicLaneContractReview,
  buildLaneContractCriticUserPrompt,
  evaluateCompiledFilterFidelity,
  normalizeLaneContractReviewResult,
} from "@/lib/search/lane-contract-critic";
import type {
  CandidateRowInput,
  AdditionalRecallSnapshot,
  CandidateDeliveryBucket,
  ConstraintVerdict,
  ExcludedReasonCount,
  HeadhunterLaneKind,
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

function candidateIndexPipelineIsActive(): boolean {
  return true;
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
    filterHash?: string | null;
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
    uniqueProfilesAdded?: number | null;
    duplicateProfilesSeen?: number | null;
    overlapRatio?: number | null;
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

type RecallIteration = NonNullable<RecallMetadata["recall_iterations"]>[number];

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
const ADAPTIVE_RECALL_MAX_NEW_ROUNDS_PER_RUN = 2;

function isSnapshotProfileCacheRerun(parsed: Record<string, unknown>) {
  return parsed.rerun_mode === SNAPSHOT_PROFILE_CACHE_RERUN_MODE;
}

type AdaptiveRecallActionState = {
  id: string;
  type: string;
  status: string;
  lane: string;
  laneKind: HeadhunterLaneKind;
  budget: number;
  revisedLane: SourcingLane | null;
  snapshotId: string | null;
  submittedAt: string | null;
};

const DUPLICATE_MARKET_SLICE_OVERLAP_THRESHOLD = 0.7;

function readAdaptiveRecallState(parsed: Record<string, unknown>) {
  return parsed.adaptive_recall && typeof parsed.adaptive_recall === "object"
    ? (parsed.adaptive_recall as Record<string, unknown>)
    : null;
}

function helpersNormalizeLaneKind(value: unknown): HeadhunterLaneKind {
  return value === "primary_relaxed" ||
    value === "target_company_engineering" ||
    value === "adjacent_authorized" ||
    value === "exploration" ||
    value === "primary_exact"
    ? value
    : "primary_exact";
}

function normalizeAdaptiveRecallAction(
  action: unknown,
  index: number,
): AdaptiveRecallActionState | null {
  if (!action || typeof action !== "object") return null;
  const item = action as Record<string, unknown>;
  const id = typeof item.id === "string" && item.id.trim().length > 0
    ? item.id.trim()
    : `adaptive_${index + 1}`;
  const status = typeof item.status === "string" && item.status.trim().length > 0
    ? item.status.trim()
    : "planned";
  const budget = typeof item.budget === "number" && Number.isFinite(item.budget)
    ? Math.max(0, Math.round(item.budget))
    : 0;
  const lane = typeof item.lane === "string" && item.lane.trim().length > 0
    ? item.lane.trim()
    : id;
  const revisedLane = item.revised_lane && typeof item.revised_lane === "object"
    ? (item.revised_lane as SourcingLane)
    : null;
  return {
    id,
    type: typeof item.type === "string" && item.type.trim().length > 0
      ? item.type.trim()
      : "expand_lane",
    status,
    lane,
    laneKind: helpersNormalizeLaneKind(item.lane_kind),
    budget,
    revisedLane,
    snapshotId: typeof item.snapshot_id === "string" && item.snapshot_id.trim().length > 0
      ? item.snapshot_id.trim()
      : null,
    submittedAt: typeof item.submitted_at === "string" && item.submitted_at.trim().length > 0
      ? item.submitted_at.trim()
      : null,
  };
}

function getAdaptiveRecallActions(parsed: Record<string, unknown>) {
  const state = readAdaptiveRecallState(parsed);
  if (!state || !Array.isArray(state.actions)) {
    return [];
  }
  return state.actions
    .map(normalizeAdaptiveRecallAction)
    .filter((action): action is NonNullable<typeof action> => Boolean(action))
}

function hasPlannedAdaptiveRecallActions(parsed: Record<string, unknown>) {
  const state = readAdaptiveRecallState(parsed);
  if (state?.phase !== "planned" || state.should_continue !== true) {
    return false;
  }
  return getAdaptiveRecallActions(parsed)
    .some((action) =>
      action.budget > 0 &&
      action.status !== "done" &&
      action.status !== "recorded" &&
      action.status !== "stopped" &&
      action.status !== "failed"
    );
}

function getAdaptiveRecallActionsForRounds(parsed: Record<string, unknown>) {
  return getAdaptiveRecallActions(parsed)
    .filter((action) =>
      action.budget > 0 &&
      action.revisedLane &&
      action.status !== "recorded" &&
      action.status !== "stopped" &&
      action.status !== "failed"
    );
}

function updateAdaptiveRecallAction(
  parsed: Record<string, unknown>,
  actionId: string,
  patch: Record<string, unknown>,
) {
  const state = readAdaptiveRecallState(parsed);
  if (!state || !Array.isArray(state.actions)) return;
  state.actions = state.actions.map((action) => {
    if (!action || typeof action !== "object") return action;
    const item = action as Record<string, unknown>;
    return item.id === actionId ? { ...item, ...patch } : item;
  });
  parsed.adaptive_recall = state;
}

function getRecallIterationMergeKeys(iteration: RecallIteration) {
  const keys = [`lane:${iteration.lane}`];
  if (iteration.filter_hash) {
    keys.push(`filter:${iteration.filter_hash}`);
    keys.push(`lane-filter:${iteration.lane}:${iteration.filter_hash}`);
  }
  if (iteration.snapshot_id) {
    keys.push(`snapshot:${iteration.snapshot_id}`);
    keys.push(`lane-snapshot:${iteration.lane}:${iteration.snapshot_id}`);
  }
  return keys;
}

export function mergeRecallIterations(
  previous: RecallIteration[] | null | undefined,
  next: RecallIteration[],
): RecallIteration[] {
  if (!previous?.length) return next;
  const previousByKey = new Map<string, RecallIteration>();
  for (const iteration of previous) {
    for (const key of getRecallIterationMergeKeys(iteration)) {
      previousByKey.set(key, iteration);
    }
  }
  return next.map((iteration) => {
    const previousMatch = getRecallIterationMergeKeys(iteration)
      .map((key) => previousByKey.get(key))
      .find(Boolean);
    if (!previousMatch) return iteration;
    return {
      ...iteration,
      raw_profiles_returned: iteration.raw_profiles_returned ?? previousMatch.raw_profiles_returned ?? null,
      unique_profiles_added: iteration.unique_profiles_added ?? previousMatch.unique_profiles_added ?? null,
      duplicate_profiles_seen: iteration.duplicate_profiles_seen ?? previousMatch.duplicate_profiles_seen ?? null,
      overlap_ratio: iteration.overlap_ratio ?? previousMatch.overlap_ratio ?? null,
      market_slice_status: iteration.market_slice_status ?? previousMatch.market_slice_status ?? null,
      audit: iteration.audit ?? previousMatch.audit ?? null,
      continue_expansion:
        typeof iteration.continue_expansion === "boolean"
          ? iteration.continue_expansion
          : previousMatch.continue_expansion ?? null,
    };
  });
}

export function isRecallFilterHashDuplicateForRound(
  usedFilterHashes: Map<string, string>,
  filterHash: string,
  ownerRound?: string | null,
) {
  const existingOwner = usedFilterHashes.get(filterHash);
  return Boolean(existingOwner && existingOwner !== ownerRound);
}

function rememberRecallFilterHash(
  usedFilterHashes: Map<string, string>,
  filterHash: string | null | undefined,
  ownerRound: string,
) {
  if (!filterHash) return;
  if (!usedFilterHashes.has(filterHash)) {
    usedFilterHashes.set(filterHash, ownerRound);
  }
}

export function shouldCountAdaptiveActionAsNewRound(action: {
  status: string;
  snapshotId?: string | null;
}) {
  return !action.snapshotId && action.status !== "done";
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
  return false;
}

export function shouldFailUnderfilledRecallAfterSubmittedRounds(params: {
  availableProfileCount: number;
  deferredAdditionalRoundCount: number;
  requestedProfileCount?: number | null;
  recallStrategyMode?: "legacy" | "headhunter_v1" | "headhunter_v2";
}) {
  if (params.availableProfileCount <= 0 || params.deferredAdditionalRoundCount > 0) {
    return false;
  }
  if (params.recallStrategyMode === "headhunter_v1" || params.recallStrategyMode === "headhunter_v2") return false;
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
  recallStrategyMode?: "legacy" | "headhunter_v1" | "headhunter_v2";
  pendingRoundNames?: string[];
  pendingRoundSubmittedAts?: Array<string | null | undefined>;
  completedAdaptiveRoundCount?: number;
  elapsedMs?: number;
  timeoutMs?: number;
}) {
  const totalDeferredRoundCount =
    params.metadataDeferredRoundCount + params.downloadDeferredRoundCount;
  if (totalDeferredRoundCount <= 0) return false;
  if (
    shouldContinueWithPartialHeadhunterRecall({
      recallStrategyMode: params.recallStrategyMode,
      availableProfileCount: params.availableProfileCount,
      pendingRoundCount: totalDeferredRoundCount,
      pendingRoundNames: params.pendingRoundNames,
      pendingRoundSubmittedAts: params.pendingRoundSubmittedAts,
      completedAdaptiveRoundCount: params.completedAdaptiveRoundCount,
      elapsedMs: params.elapsedMs,
      timeoutMs: params.timeoutMs,
    })
  ) {
    return false;
  }
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

export function shouldTimeoutAdditionalRecallBeforeScoring(params: {
  metadataDeferredRoundCount: number;
  downloadDeferredRoundCount: number;
  elapsedMs: number;
  timeoutMs: number;
  recallStrategyMode?: "legacy" | "headhunter_v1" | "headhunter_v2";
  availableProfileCount?: number;
  pendingRoundNames?: string[];
  pendingRoundSubmittedAts?: Array<string | null | undefined>;
  completedAdaptiveRoundCount?: number;
}) {
  const totalDeferredRoundCount =
    params.metadataDeferredRoundCount + params.downloadDeferredRoundCount;
  if (
    shouldContinueWithPartialHeadhunterRecall({
      recallStrategyMode: params.recallStrategyMode,
      availableProfileCount: params.availableProfileCount ?? 0,
      pendingRoundCount: totalDeferredRoundCount,
      pendingRoundNames: params.pendingRoundNames,
      pendingRoundSubmittedAts: params.pendingRoundSubmittedAts,
      completedAdaptiveRoundCount: params.completedAdaptiveRoundCount,
      elapsedMs: params.elapsedMs,
      timeoutMs: params.timeoutMs,
    })
  ) {
    return false;
  }
  const effectiveElapsedMs =
    (params.recallStrategyMode === "headhunter_v1" || params.recallStrategyMode === "headhunter_v2")
      ? getPendingAdditionalRecallElapsedMs({
        fallbackElapsedMs: params.elapsedMs,
        pendingRoundSubmittedAts: params.pendingRoundSubmittedAts,
      })
      : params.elapsedMs;
  return (
    totalDeferredRoundCount > 0 &&
    effectiveElapsedMs >= params.timeoutMs
  );
}

function isAdaptiveRecallRoundName(round: string | null | undefined) {
  return typeof round === "string" && round.startsWith("adaptive_");
}

function getPendingAdditionalRecallElapsedMs(params: {
  fallbackElapsedMs: number;
  pendingRoundSubmittedAts?: Array<string | null | undefined>;
  nowMs?: number;
}) {
  const nowMs = params.nowMs ?? Date.now();
  const elapsedBySubmittedAt = (params.pendingRoundSubmittedAts ?? [])
    .map((value) => {
      const parsed = value ? Date.parse(value) : Number.NaN;
      return Number.isFinite(parsed) ? Math.max(0, nowMs - parsed) : null;
    })
    .filter((value): value is number => typeof value === "number");
  if (elapsedBySubmittedAt.length === 0) {
    return params.fallbackElapsedMs;
  }
  return Math.max(...elapsedBySubmittedAt);
}

export function shouldContinueWithPartialHeadhunterRecall(params: {
  recallStrategyMode?: "legacy" | "headhunter_v1" | "headhunter_v2";
  availableProfileCount: number;
  pendingRoundCount: number;
  pendingRoundNames?: string[];
  pendingRoundSubmittedAts?: Array<string | null | undefined>;
  completedAdaptiveRoundCount?: number;
  elapsedMs?: number;
  timeoutMs?: number;
}) {
  if (params.recallStrategyMode !== "headhunter_v1" && params.recallStrategyMode !== "headhunter_v2") return false;
  if (params.availableProfileCount <= 0 || params.pendingRoundCount <= 0) return false;
  const pendingRoundNames = params.pendingRoundNames ?? [];
  const allPendingAreAdaptive =
    pendingRoundNames.length === params.pendingRoundCount &&
    pendingRoundNames.every(isAdaptiveRecallRoundName);
  if (allPendingAreAdaptive && (params.completedAdaptiveRoundCount ?? 0) > 0) {
    return true;
  }
  if (
    typeof params.elapsedMs === "number" &&
    typeof params.timeoutMs === "number" &&
    getPendingAdditionalRecallElapsedMs({
      fallbackElapsedMs: params.elapsedMs,
      pendingRoundSubmittedAts: params.pendingRoundSubmittedAts,
    }) >= params.timeoutMs
  ) {
    return true;
  }
  return false;
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

function getHeadhunterLaneKindForRound(round: string): HeadhunterLaneKind {
  if (round === "standard") return "primary_exact";
  if (round === "primary_relaxed") return "primary_relaxed";
  if (round === "company_target" || round.includes("company")) return "target_company_engineering";
  if (round.includes("exploration")) return "exploration";
  return "adjacent_authorized";
}

function getSourcingLaneForRound(
  recallSpec: RecallSpec,
  round: string,
  laneKind: HeadhunterLaneKind,
): SourcingLane {
  const laneByKind = recallSpec.sourcing_lanes.find((lane) => lane.lane_kind === laneKind);
  if (laneByKind) return laneByKind;
  const fallbackLane = recallSpec.sourcing_lanes[0];
  if (fallbackLane) return fallbackLane;
  return {
    name: round === "standard" ? "Primary exact lane" : `${round} lane`,
    strategy: laneKind === "target_company_engineering" ? "company" : laneKind === "primary_exact" ? "title" : "skill",
    lane_kind: laneKind,
    target_persona: "Profiles matching the parsed role intent",
    non_negotiables: recallSpec.must_have_signals,
    relaxed_evidence: recallSpec.differentiating_skill_terms,
    exclusion_patterns: recallSpec.avoid_profiles,
    initial_budget: laneKind === "primary_exact" ? 35 : 15,
    max_budget: laneKind === "primary_exact" ? 150 : 80,
    title_terms: recallSpec.title_variants,
    skill_terms: recallSpec.core_skill_terms,
    company_terms: recallSpec.target_companies,
    avoid_terms: recallSpec.avoid_profiles,
    budget_weight: 1,
  };
}

function countLaneProfiles(profiles: BrightDataProfile[], round: string) {
  return profiles.filter((profile) => getProfileRecallSource(profile) === round).length;
}

function incrementCount(map: Map<string, number>, value: string | null | undefined) {
  const key = value?.trim();
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topCounts(map: Map<string, number>, limit = 6) {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function buildLaneJudgeSummary(params: {
  round: string;
  assessments: ScoredCandidateAssessment[] | undefined;
  profiles: BrightDataProfile[];
  qualityDistribution?: RecallRoundQualityDistribution | null;
}) {
  const laneAssessments = (params.assessments ?? []).filter((assessment) => {
    const profile = params.profiles[assessment.index];
    return profile ? getProfileRecallSource(profile) === params.round : false;
  });
  const advanceCounts = new Map<string, number>();
  const bucketCounts = new Map<string, number>();
  const blockingCounts = new Map<string, number>();
  const riskCounts = new Map<string, number>();
  const weakReasonCounts = new Map<string, number>();

  for (const assessment of laneAssessments) {
    const suitability = assessment.suitability;
    incrementCount(bucketCounts, suitability.bucket);
    incrementCount(advanceCounts, suitability.advance_recommendation);
    incrementCount(blockingCounts, suitability.blocking_severity);
    incrementCount(riskCounts, suitability.primary_risk);
    for (const flag of suitability.risk_flags ?? []) incrementCount(riskCounts, flag);
    for (const reason of suitability.why_not_higher ?? []) incrementCount(weakReasonCounts, reason);
    for (const constraint of suitability.blocking_constraints ?? []) {
      incrementCount(weakReasonCounts, constraint);
    }
  }

  return JSON.stringify(
    {
      round: params.round,
      returned_count: countLaneProfiles(params.profiles, params.round),
      scored_count: laneAssessments.length,
      quality_distribution: params.qualityDistribution ?? null,
      bucket_counts: Object.fromEntries(bucketCounts.entries()),
      advance_recommendation_counts: Object.fromEntries(advanceCounts.entries()),
      blocking_severity_counts: Object.fromEntries(blockingCounts.entries()),
      top_risks: topCounts(riskCounts),
      top_weak_or_blocking_patterns: topCounts(weakReasonCounts),
    },
    null,
    2,
  );
}

function buildLaneAuditProfileSample(params: {
  round: string;
  profiles: BrightDataProfile[];
  assessments: ScoredCandidateAssessment[] | undefined;
}) {
  const assessmentByIndex = new Map((params.assessments ?? []).map((assessment) => [assessment.index, assessment]));
  const entries = params.profiles
    .map((profile, index) => ({
      profile,
      index,
      assessment: assessmentByIndex.get(index),
    }))
    .filter((entry) => getProfileRecallSource(entry.profile) === params.round);
  if (entries.length === 0) return "No profiles returned for this lane.";

  const sorted = [...entries].sort((left, right) => {
    const rightScore = right.assessment?.suitability.quality_score ?? right.assessment?.suitability.match_score ?? 0;
    const leftScore = left.assessment?.suitability.quality_score ?? left.assessment?.suitability.match_score ?? 0;
    return rightScore - leftScore;
  });
  const selected = new Map<number, (typeof entries)[number]>();
  for (const entry of sorted.slice(0, 8)) selected.set(entry.index, entry);
  for (const entry of sorted.slice(-4)) selected.set(entry.index, entry);

  return [...selected.values()]
    .sort((left, right) => left.index - right.index)
    .map((entry) => {
      const assessment = entry.assessment;
      const judgeLine = assessment
        ? [
            `bucket=${assessment.suitability.bucket}`,
            `advance=${assessment.suitability.advance_recommendation}`,
            `quality=${assessment.suitability.quality_score}`,
            `risk=${assessment.suitability.primary_risk ?? "none"}`,
          ].join("; ")
        : "not scored";
      return [
        `### Profile index ${entry.index}`,
        `Judge result: ${judgeLine}`,
        safeTruncate(brightDataProfileToRichText(entry.profile, entry.index), 1400),
      ].join("\n");
    })
    .join("\n\n");
}

function summarizeSingleLaneAudit(audit: LaneAuditResult) {
  const working = audit.why_this_lane_is_working.trim();
  const wrong = audit.why_this_lane_is_wrong.trim();
  const summary = working || wrong || "Lane audited without additional narrative.";
  return safeTruncate(summary, 220);
}

function shouldContinueExpansionForLane(audit: LaneAuditResult) {
  return audit.decision === "expand" && (audit.quality_grade === "A" || audit.quality_grade === "B");
}

function summarizeLaneAudits(
  audits: Array<{ lane: string; audit: LaneAuditResult | null; sampleCount: number }>,
) {
  const completed = audits.filter((entry) => entry.audit);
  if (!completed.length) return "Lane audit could not be completed; inspect scheduler logs for lane audit failures.";
  return completed
    .map((entry) => {
      const audit = entry.audit as LaneAuditResult;
      return `${entry.lane}: ${audit.quality_grade}/${audit.decision}, ${entry.sampleCount} profiles, ${summarizeSingleLaneAudit(audit)}`;
    })
    .join(" | ")
    .slice(0, 500);
}

async function auditHeadhunterRecallLanes(params: {
  context: PipelineContext;
  parsed: Record<string, unknown>;
  recallSpec: RecallSpec;
  profiles: BrightDataProfile[];
  assessments: ScoredCandidateAssessment[] | undefined;
  recallIterations: NonNullable<RecallMetadata["recall_iterations"]>;
  roundDiagnostics: RecallRoundDiagnostics[];
  helpers: SearchPipelineHelpers;
}) {
  if (params.recallIterations.length === 0) return null;

  const {
    generateLlmJson,
    getLightweightLlmModel,
    resolveDeepSeekThinkingMode,
  } = await import("@/lib/llm-client");
  const { LANE_AUDITOR_JSON_SCHEMA } = await import("@/lib/llm-schemas");
  const { withTimeout } = await import("@/lib/search/concurrency");

  const audits: Array<{ lane: string; audit: LaneAuditResult | null; sampleCount: number }> = [];
  const updatedIterations: NonNullable<RecallMetadata["recall_iterations"]> = [];

  for (const iteration of params.recallIterations) {
    const laneKind = iteration.lane_kind ?? getHeadhunterLaneKindForRound(iteration.lane);
    const lane = getSourcingLaneForRound(params.recallSpec, iteration.lane, laneKind);
    const diagnostic = params.roundDiagnostics.find((round) => round.round === iteration.lane);
    const sampleCount = countLaneProfiles(params.profiles, iteration.lane);
    if (
      sampleCount === 0 &&
      (iteration.raw_profiles_returned ?? diagnostic?.returned_count ?? 0) > 0 &&
      (iteration.unique_profiles_added ?? diagnostic?.unique_added_count ?? 0) === 0
    ) {
      const duplicateAudit: LaneAuditResult = {
        decision: "stop",
        quality_grade: "D",
        why_this_lane_is_working: "",
        why_this_lane_is_wrong:
          "Bright returned profiles for this lane, but they were all already present in the candidate pool. This is a duplicate market slice, not a fresh sourcing direction.",
        wrong_profile_patterns: ["duplicate profiles already recalled"],
        next_lane_revision: {
          name: "New distinct sourcing thesis required",
          lane_kind: laneKind,
          target_persona: lane.target_persona ?? "A materially different candidate market slice",
          non_negotiables: lane.non_negotiables ?? [],
          relaxed_evidence: lane.relaxed_evidence ?? [],
          exclusion_patterns: lane.exclusion_patterns ?? lane.avoid_terms ?? [],
          initial_budget: lane.initial_budget ?? 20,
          max_budget: lane.max_budget ?? 40,
        },
      };
      const summary = summarizeSingleLaneAudit(duplicateAudit);
      audits.push({ lane: iteration.lane, audit: duplicateAudit, sampleCount });
      updatedIterations.push({
        ...iteration,
        lane_kind: laneKind,
        market_slice_status: "duplicate_market_slice",
        audit: {
          decision: duplicateAudit.decision,
          quality_grade: duplicateAudit.quality_grade,
          summary,
          why_this_lane_is_working: duplicateAudit.why_this_lane_is_working,
          why_this_lane_is_wrong: duplicateAudit.why_this_lane_is_wrong,
          wrong_profile_patterns: duplicateAudit.wrong_profile_patterns,
          next_lane_revision: duplicateAudit.next_lane_revision,
          audited_at: params.helpers.nowIso(),
          sample_count: sampleCount,
        },
        continue_expansion: false,
      });
      params.helpers.logSearchEvent("search_lane_audit_completed", {
        search_id: params.context.searchId,
        job_id: params.context.jobId,
        lane: iteration.lane,
        lane_kind: laneKind,
        decision: duplicateAudit.decision,
        quality_grade: duplicateAudit.quality_grade,
        sample_count: sampleCount,
        raw_profiles_returned: iteration.raw_profiles_returned ?? diagnostic?.returned_count ?? null,
        unique_profiles_added: iteration.unique_profiles_added ?? diagnostic?.unique_added_count ?? null,
        overlap_ratio: iteration.overlap_ratio ?? diagnostic?.overlap_ratio ?? null,
        market_slice_status: "duplicate_market_slice",
        continue_expansion: false,
      });
      continue;
    }
    const profileSample = buildLaneAuditProfileSample({
      round: iteration.lane,
      profiles: params.profiles,
      assessments: params.assessments,
    });
    const judgeSummary = buildLaneJudgeSummary({
      round: iteration.lane,
      profiles: params.profiles,
      assessments: params.assessments,
      qualityDistribution: diagnostic?.quality_distribution ?? null,
    });

    try {
      const prompt = buildLaneAuditUserPrompt({
        jdText: params.context.jdText,
        headhunterBrief: params.parsed.headhunter_brief,
        lane,
        profileSample,
        judgeSummary,
      });
      const { data } = await withTimeout(
        (signal) => generateLlmJson<unknown>({
          model: getLightweightLlmModel(),
          prompt,
          maxOutputTokens: 2200,
          abortSignal: signal,
          timeoutMs: 60000,
          temperature: 0,
          jsonSchema: LANE_AUDITOR_JSON_SCHEMA,
          deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_LANE_AUDIT_THINKING", "disabled"),
          usageEvent: {
            searchId: params.context.searchId,
            jobId: params.context.jobId,
            userId: params.context.userId,
            stage: "lane_audit",
            batchSize: sampleCount,
            metadata: {
              lane: iteration.lane,
              laneKind,
            },
          },
        }),
        60000,
        `Lane audit ${iteration.lane}`,
      );
      const audit = normalizeLaneAuditResult(data);
      const summary = summarizeSingleLaneAudit(audit);
      const continueExpansion = shouldContinueExpansionForLane(audit);
      audits.push({ lane: iteration.lane, audit, sampleCount });
      updatedIterations.push({
        ...iteration,
        lane_kind: laneKind,
        audit: {
          decision: audit.decision,
          quality_grade: audit.quality_grade,
          summary,
          why_this_lane_is_working: audit.why_this_lane_is_working,
          why_this_lane_is_wrong: audit.why_this_lane_is_wrong,
          wrong_profile_patterns: audit.wrong_profile_patterns,
          next_lane_revision: audit.next_lane_revision,
          audited_at: params.helpers.nowIso(),
          sample_count: sampleCount,
        },
        continue_expansion: continueExpansion,
      });
      params.helpers.logSearchEvent("search_lane_audit_completed", {
        search_id: params.context.searchId,
        job_id: params.context.jobId,
        lane: iteration.lane,
        lane_kind: laneKind,
        decision: audit.decision,
        quality_grade: audit.quality_grade,
        sample_count: sampleCount,
        continue_expansion: continueExpansion,
      });
    } catch (error) {
      audits.push({ lane: iteration.lane, audit: null, sampleCount });
      updatedIterations.push({
        ...iteration,
        lane_kind: laneKind,
        audit: null,
        continue_expansion: null,
      });
      params.helpers.logSearchEvent("search_lane_audit_failed", {
        search_id: params.context.searchId,
        job_id: params.context.jobId,
        lane: iteration.lane,
        lane_kind: laneKind,
        sample_count: sampleCount,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const stoppedLaneCount = updatedIterations.filter((iteration) =>
    iteration.audit?.decision === "stop" || iteration.audit?.quality_grade === "D"
  ).length;

  return {
    recallIterations: updatedIterations,
    laneAuditSummary: summarizeLaneAudits(audits),
    stoppedLaneCount,
  };
}

function toAdaptiveRecallState(params: {
  plan: AdaptiveExpansionPlan;
  plannedAt: string;
  phase: "planned" | "not_needed";
  batchIndex: number;
  strategyMode: "headhunter_v1" | "headhunter_v2";
  previousState?: Record<string, unknown> | null;
}) {
  const cleanIdPart = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) || "lane";
  const previousActions = Array.isArray(params.previousState?.actions)
    ? params.previousState.actions
    : [];
  return {
    strategy_mode: params.strategyMode,
    phase: params.phase,
    planned_at: params.plannedAt,
    batch_index: params.batchIndex,
    should_continue: params.plan.should_continue,
    stop_reason: params.plan.stop_reason,
    remaining_budget: params.plan.remaining_budget,
    planned_budget: params.plan.planned_budget,
    actions: [
      ...previousActions,
      ...params.plan.actions.map((action, index) => ({
        id: `adaptive_b${params.batchIndex}_${index + 1}_${cleanIdPart(action.type)}_${cleanIdPart(action.lane)}`,
        type: action.type,
        lane: action.lane,
        lane_kind: action.lane_kind,
        budget: action.budget,
        reason: action.reason,
        source_iteration: action.source_iteration ?? null,
        revised_lane: action.revised_lane ?? null,
        thesis_rewrite: action.thesis_rewrite ?? null,
        status: action.budget > 0 ? "planned" : "recorded",
        snapshot_id: null,
        submitted_at: null,
        completed_at: null,
        profiles_returned: null,
        unique_added: null,
      })),
    ],
  };
}

async function reviewLaneContractsBeforeRecall(params: {
  context: PipelineContext;
  parsed: Record<string, unknown>;
  recallSpec: RecallSpec;
  helpers: SearchPipelineHelpers;
}) {
  const reviewedAt = params.helpers.nowIso();
  const existingReview =
    params.parsed.lane_contract_review &&
    typeof params.parsed.lane_contract_review === "object"
      ? normalizeLaneContractReviewResult({
        value: params.parsed.lane_contract_review,
        parsed: params.parsed,
        recallSpec: params.recallSpec,
        reviewedAt: null,
      })
      : null;
  if (existingReview?.approved_sourcing_lanes.length) {
    return applyLaneContractReviewToParsed(params.parsed, existingReview);
  }

  try {
    const {
      generateLlmJson,
      getLightweightLlmModel,
      resolveDeepSeekThinkingMode,
    } = await import("@/lib/llm-client");
    const { LANE_CONTRACT_CRITIC_JSON_SCHEMA } = await import("@/lib/llm-schemas");
    const { withTimeout } = await import("@/lib/search/concurrency");
    const prompt = buildLaneContractCriticUserPrompt({
      jdText: params.context.jdText,
      parsed: params.parsed,
      recallSpec: params.recallSpec,
    });
    const { data } = await withTimeout(
      (signal) => generateLlmJson<Record<string, unknown>>({
        model: getLightweightLlmModel(),
        prompt,
        maxOutputTokens: 3600,
        abortSignal: signal,
        timeoutMs: 60000,
        temperature: 0,
        jsonSchema: LANE_CONTRACT_CRITIC_JSON_SCHEMA,
        deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_LANE_CONTRACT_CRITIC_THINKING", "disabled"),
        usageEvent: {
          searchId: params.context.searchId,
          jobId: params.context.jobId,
          userId: params.context.userId,
          stage: "lane_contract_review",
          metadata: {
            lane_count: params.recallSpec.sourcing_lanes.length,
          },
        },
      }),
      60000,
      "Lane contract critic",
    );
    const review = normalizeLaneContractReviewResult({
      value: data,
      parsed: params.parsed,
      recallSpec: params.recallSpec,
      reviewedAt,
    });
    params.helpers.logSearchEvent("search_lane_contract_review_completed", {
      search_id: params.context.searchId,
      job_id: params.context.jobId,
      status: review.status,
      role_family: review.role_family,
      approved_lane_count: review.approved_sourcing_lanes.length,
      rejected_lane_count: review.reviews.filter((item) => item.decision === "reject").length,
      repaired_lane_count: review.reviews.filter((item) => item.decision === "repair").length,
    });
    return applyLaneContractReviewToParsed(params.parsed, review);
  } catch (error) {
    const review = buildDeterministicLaneContractReview({
      parsed: params.parsed,
      recallSpec: params.recallSpec,
      reviewedAt,
    });
    params.helpers.logSearchEvent("search_lane_contract_review_fallback", {
      search_id: params.context.searchId,
      job_id: params.context.jobId,
      status: review.status,
      role_family: review.role_family,
      approved_lane_count: review.approved_sourcing_lanes.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return applyLaneContractReviewToParsed(params.parsed, review);
  }
}

function buildNeedsCalibrationResult(params: {
  context: PipelineContext;
  parsed: Record<string, unknown>;
  executionProfile: SearchExecutionProfile;
  helpers: SearchPipelineHelpers;
  primaryIssue: SearchQualityDiagnosis["primary_issue"];
  notes: string[];
}) {
  const stats = params.helpers.buildSearchDisplayStats({
    ...(params.helpers.normalizeSearchDisplayStats(params.parsed.display_stats) ?? params.helpers.buildSearchDisplayStats({})),
    retrieval_count: 0,
    deep_review_requested_count: 0,
    deep_review_completed_count: 0,
    qualified_count: 0,
    outreach_pool_count: 0,
    shortlist_count: 0,
    visible_candidate_count: 0,
    delivered_candidate_count: 0,
    recommended_count: 0,
    actionable_candidate_count: 0,
    recall_strategy_mode: getHeadhunterRecallStrategyMode(params.parsed),
    search_quality_diagnosis: {
      status: "needs_calibration",
      primary_issue: params.primaryIssue,
      requested_count: 0,
      returned_count: 0,
      strict_advance_count: 0,
      reach_first_count: 0,
      review_next_count: 0,
      lower_priority_count: 0,
      not_recommended_count: 0,
      must_have_strong_count: 0,
      must_have_unknown_count: 0,
      recommended_count: 0,
      target_requested_count: 0,
      target_returned_count: 0,
      target_strict_advance_count: 0,
      target_reach_first_count: 0,
      target_review_next_count: 0,
      notes: params.notes,
    },
  });
  params.parsed.display_stats = stats;
  params.parsed.pipeline_step = "shortlist_ready";
  params.parsed.warning_message = "Search needs calibration before spending Bright budget.";
  params.parsed.execution_profile = params.executionProfile.name;
  params.helpers.logSearchEvent("search_needs_calibration_before_recall", {
    search_id: params.context.searchId,
    job_id: params.context.jobId,
    primary_issue: params.primaryIssue,
    notes: params.notes,
  });
  return {
    finalRows: [],
    displayStats: stats,
    assessments: [],
  } satisfies SearchPipelineResult;
}

function getNextAdaptiveRecallBatchIndex(parsed: Record<string, unknown>) {
  const current = readAdaptiveRecallState(parsed);
  const value = typeof current?.batch_index === "number" && Number.isFinite(current.batch_index)
    ? Math.max(0, Math.round(current.batch_index))
    : 0;
  return value + 1;
}

export function buildSearchQualityDiagnosis(stats: {
  requestedCount?: number | null;
  returnedCount?: number | null;
  strictAdvanceCount?: number | null;
  reachFirstCount?: number | null;
  reviewNextCount?: number | null;
  lowerPriorityCount?: number | null;
  notRecommendedCount?: number | null;
  mustHaveStrongCount?: number | null;
  mustHaveUnknownCount?: number | null;
}): SearchQualityDiagnosis {
  const requestedCount = Math.max(0, Math.round(stats.requestedCount ?? 0));
  const returnedCount = Math.max(0, Math.round(stats.returnedCount ?? 0));
  const strictAdvanceCount = Math.max(0, Math.round(stats.strictAdvanceCount ?? 0));
  const reachFirstCount = Math.max(0, Math.round(stats.reachFirstCount ?? 0));
  const reviewNextCount = Math.max(0, Math.round(stats.reviewNextCount ?? 0));
  const lowerPriorityCount = Math.max(0, Math.round(stats.lowerPriorityCount ?? 0));
  const notRecommendedCount = Math.max(0, Math.round(stats.notRecommendedCount ?? 0));
  const mustHaveStrongCount = Math.max(0, Math.round(stats.mustHaveStrongCount ?? 0));
  const mustHaveUnknownCount = Math.max(0, Math.round(stats.mustHaveUnknownCount ?? 0));
  const recommendedCount = reachFirstCount + reviewNextCount;
  const targetRequestedCount = 250;
  const targetReturnedCount = 100;
  const targetStrictAdvanceCount = 5;
  const targetReachFirstCount = 1;
  const targetReviewNextCount = 5;
  const notes: string[] = [];
  const returnedDenominator = Math.max(returnedCount, 1);
  const notRecommendedRate = notRecommendedCount / returnedDenominator;
  const mustHaveStrongRate = mustHaveStrongCount / returnedDenominator;
  const mustHaveUnknownRate = mustHaveUnknownCount / returnedDenominator;

  let primaryIssue: SearchQualityDiagnosis["primary_issue"] = "healthy";
  if (requestedCount < targetRequestedCount) {
    primaryIssue = "needs_search_calibration";
    notes.push("Profile scan budget was not fully exercised.");
  }
  if (returnedCount < targetReturnedCount) {
    primaryIssue = primaryIssue === "healthy" ? "recall_underfilled" : primaryIssue;
    notes.push("Bright recall returned too few profiles for a robust recruiter decision.");
  }
  if (
    returnedCount >= targetReturnedCount &&
    (
      notRecommendedRate >= 0.7 ||
      (mustHaveStrongCount > 0 && mustHaveStrongRate < 0.05) ||
      mustHaveUnknownRate >= 0.6
    )
  ) {
    primaryIssue = primaryIssue === "healthy" ? "recall_quality_weak" : primaryIssue;
    notes.push("Most recalled profiles lacked enough JD-specific evidence for recruiter action.");
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
    lower_priority_count: lowerPriorityCount,
    not_recommended_count: notRecommendedCount,
    must_have_strong_count: mustHaveStrongCount,
    must_have_unknown_count: mustHaveUnknownCount,
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
  const recallStrategyMode = getHeadhunterRecallStrategyMode(parsed);
  parsed.recall_strategy_mode = recallStrategyMode;
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
    recall_strategy_mode: recallStrategyMode,
    recall_iteration_count:
      recallStrategyMode !== "legacy"
        ? currentStats.recall_iteration_count ?? 0
        : currentStats.recall_iteration_count,
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
  const mustHaveUnknownCount = finalRows.filter((row) => {
    const metadata = row.metadata && typeof row.metadata === "object"
      ? (row.metadata as Record<string, unknown>)
      : null;
    const verdicts = metadata?.constraint_verdicts && typeof metadata.constraint_verdicts === "object"
      ? (metadata.constraint_verdicts as ConstraintVerdict)
      : null;
    return verdicts?.must_have_coverage === "unknown";
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
      lower_priority_count: deliveryCounts.lowerPriority,
      ruled_out_count: ruledOutAssessments.length,
      clear_location_fit_count: clearLocationFitCount,
      must_have_strong_count: mustHaveStrongCount,
      must_have_unknown_count: mustHaveUnknownCount,
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
        lowerPriorityCount: deliveryCounts.lowerPriority,
        notRecommendedCount: deliveryCounts.notRecommended,
        mustHaveStrongCount,
        mustHaveUnknownCount,
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
    const laneKind = helpers.normalizeEnumValue(
      lane.lane_kind,
      [
        "primary_exact",
        "primary_relaxed",
        "target_company_engineering",
        "adjacent_authorized",
        "exploration",
      ] as const,
      strategy === "company" ? "target_company_engineering" : strategy === "title" ? "primary_exact" : "primary_relaxed",
    );
    const defaultInitialBudget =
      laneKind === "primary_exact" ? 35 :
        laneKind === "primary_relaxed" ? 15 :
          laneKind === "exploration" ? 10 :
            laneKind === "target_company_engineering" ? 25 : 15;
    const defaultMaxBudget =
      laneKind === "primary_exact" ? 150 :
        laneKind === "primary_relaxed" ? 80 :
          laneKind === "exploration" ? 15 :
            laneKind === "target_company_engineering" ? 50 : 40;
    return [{
      name: helpers.normalizeNullableString(lane.name) || `react_${strategy}`,
      strategy,
      lane_kind: laneKind,
      target_persona:
        helpers.normalizeNullableString(lane.target_persona) ||
        `Profiles matching ${[...titleTerms, ...skillTerms, ...companyTerms].slice(0, 3).join(", ") || strategy}`,
      non_negotiables: helpers.normalizeStringArray(lane.non_negotiables, 8),
      relaxed_evidence: helpers.normalizeStringArray(lane.relaxed_evidence, 8),
      exclusion_patterns: helpers.normalizeStringArray(lane.exclusion_patterns, 8),
      initial_budget:
        typeof lane.initial_budget === "number" && Number.isFinite(lane.initial_budget)
          ? Math.max(1, Math.round(lane.initial_budget))
          : defaultInitialBudget,
      max_budget:
        typeof lane.max_budget === "number" && Number.isFinite(lane.max_budget)
          ? Math.max(1, Math.round(lane.max_budget))
          : defaultMaxBudget,
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
  let recallSpec = helpers.normalizeRecallSpec(parsed.recall_spec, context.candidateCount, {
    recordLimitOverride: executionProfile.filterLimit,
  });
  const recallStrategyMode = getHeadhunterRecallStrategyMode(parsed);
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
  let compiledFilterFidelityForRun = existingRecallMetadata?.compiled_filter_fidelity ?? [];
  if (recallStrategyMode === "headhunter_v2" && !existingRecallMetadata?.snapshot_id && !forceSnapshotProfileCache) {
    const reviewedParsed = await reviewLaneContractsBeforeRecall({
      context,
      parsed,
      recallSpec,
      helpers,
    });
    Object.keys(parsed).forEach((key) => {
      delete parsed[key];
    });
    Object.assign(parsed, reviewedParsed);
    recallSpec = helpers.normalizeRecallSpec(parsed.recall_spec, context.candidateCount, {
      recordLimitOverride: executionProfile.filterLimit,
    });
    await updateSearchParsedRequirements(context.searchId, parsed);
    const review = parsed.lane_contract_review && typeof parsed.lane_contract_review === "object"
      ? (parsed.lane_contract_review as Record<string, unknown>)
      : null;
    const hasApprovedPrimary = recallSpec.sourcing_lanes.some((lane) =>
      lane.lane_kind === "primary_exact" || lane.lane_kind === "primary_relaxed"
    );
    if (!hasApprovedPrimary) {
      return buildNeedsCalibrationResult({
        context,
        parsed,
        executionProfile,
        helpers,
        primaryIssue: "role_family_drift",
        notes: [
          "Lane Contract Critic rejected all primary sourcing lanes before Bright spend.",
          typeof review?.rejected_reason === "string" ? review.rejected_reason : "No approved primary lane remained after review.",
        ],
      });
    }
  }
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
  if (recallStrategyMode === "headhunter_v2") {
    const checkedAt = helpers.nowIso();
    const compiledFilterFidelity = evaluateCompiledFilterFidelity({
      parsed,
      recallSpec,
      rounds: recallRounds.map((round) => ({
        round: round.round,
        diagnostics: round.diagnostics,
        filterHash: computeFilterHash(round.request),
      })),
      checkedAt,
    });
    compiledFilterFidelityForRun = compiledFilterFidelity;
    parsed.recall_metadata = {
      ...(parsed.recall_metadata && typeof parsed.recall_metadata === "object"
        ? parsed.recall_metadata as Record<string, unknown>
        : {}),
      provider: "brightdata_dataset",
      snapshot_id:
        parsed.recall_metadata &&
        typeof parsed.recall_metadata === "object" &&
        typeof (parsed.recall_metadata as Record<string, unknown>).snapshot_id === "string"
          ? (parsed.recall_metadata as Record<string, unknown>).snapshot_id
          : null,
      recall_strategy_mode: recallStrategyMode,
      compiled_filter_fidelity: compiledFilterFidelity,
    };
    await updateSearchParsedRequirements(context.searchId, parsed);
    const blockedFidelity = compiledFilterFidelity.filter((item) => item.status === "blocked");
    if (blockedFidelity.length > 0) {
      helpers.logSearchEvent("search_compiled_filter_fidelity_blocked", {
        search_id: context.searchId,
        job_id: context.jobId,
        blocked_rounds: blockedFidelity.map((item) => item.round),
        reasons: blockedFidelity.flatMap((item) => item.reasons).slice(0, 8),
      });
      return buildNeedsCalibrationResult({
        context,
        parsed,
        executionProfile,
        helpers,
        primaryIssue: "role_family_drift",
        notes: [
          "Compiled Filter Fidelity Gate blocked Bright submission before spend.",
          ...blockedFidelity.flatMap((item) => item.reasons).slice(0, 4),
        ],
      });
    }
  }
  const standardRound = recallRounds.find((round) => round.round === "standard");
  if (!standardRound) {
    if (recallStrategyMode === "headhunter_v2") {
      return buildNeedsCalibrationResult({
        context,
        parsed,
        executionProfile,
        helpers,
        primaryIssue: "needs_search_calibration",
        notes: ["No executable primary lane remained after critic and filter compilation."],
      });
    }
    return null;
  }
  const adaptiveActionMap = new Map(
    getAdaptiveRecallActions(parsed).map((action) => [action.id, action]),
  );
  const usedRecallFilterHashes = new Map<string, string>();
  const existingRoundDiagnostics = existingRecallMetadata?.round_diagnostics ?? [];
  for (const diagnostic of existingRoundDiagnostics) {
    rememberRecallFilterHash(usedRecallFilterHashes, diagnostic.filter_hash, diagnostic.round);
  }
  for (const round of recallRounds) {
    rememberRecallFilterHash(usedRecallFilterHashes, computeFilterHash(round.request), round.round);
  }
  const buildAdaptiveRecallLaneRequest = (lane: SourcingLane, budget: number) =>
    buildBrightDataRecallFilterForLane(
      parsed,
      lane,
      budget,
      {
        normalizeRecallSpec: helpers.normalizeRecallSpec,
        sanitizeHiringBrief: helpers.sanitizeHiringBrief,
        buildStandardSkillFilter: helpers.buildStandardSkillFilter,
        buildRecallLocationFilter: helpers.buildRecallLocationFilter,
        isPlaceholderTitle: helpers.isPlaceholderTitle,
      },
    );
  let activeAdaptiveRoundCount = 0;
  const adaptiveRounds = getAdaptiveRecallActionsForRounds(parsed).flatMap((action): RecallRound[] => {
    if (shouldCountAdaptiveActionAsNewRound(action)) {
      activeAdaptiveRoundCount += 1;
      if (activeAdaptiveRoundCount > ADAPTIVE_RECALL_MAX_NEW_ROUNDS_PER_RUN) return [];
    }
    const lane = action.revisedLane;
    if (!lane) return [];
    const request = buildAdaptiveRecallLaneRequest(lane, action.budget);
    if (!request) {
      updateAdaptiveRecallAction(parsed, action.id, {
        status: "failed",
        failed_at: helpers.nowIso(),
        failure_code: "filter_compile_failed",
      });
      helpers.logSearchEvent("search_adaptive_recall_filter_compile_failed", {
        search_id: context.searchId,
        job_id: context.jobId,
        action_id: action.id,
        lane: action.lane,
        lane_kind: action.laneKind,
      });
      return [];
    }
    const requestHash = computeFilterHash(request);
    if (isRecallFilterHashDuplicateForRound(usedRecallFilterHashes, requestHash, action.id)) {
      updateAdaptiveRecallAction(parsed, action.id, {
        status: "recorded",
        completed_at: helpers.nowIso(),
        failure_code: "duplicate_revision_filter_hash",
        profiles_returned: 0,
        unique_added: 0,
      });
      helpers.logSearchEvent("search_adaptive_recall_duplicate_filter_skipped", {
        search_id: context.searchId,
        job_id: context.jobId,
        action_id: action.id,
        lane: action.lane,
        lane_kind: action.laneKind,
        filter_hash: requestHash,
      });
      return [];
    }
    rememberRecallFilterHash(usedRecallFilterHashes, requestHash, action.id);
    return [{
      round: action.id,
      request,
      diagnostics: {
        round: action.id,
        requested_count: request.recordsLimit,
        title_terms: lane.title_terms,
        skill_signal_groups: {
          search_domain: lane.skill_terms,
          platform_engineering: lane.skill_terms,
        },
        location_mode: "country_only",
        persona: {
          id: action.id,
          kind: action.laneKind === "target_company_engineering" ? "target_company" : "skill_depth",
          label: `Adaptive ${action.type} from ${action.lane}`,
          intent: lane.target_persona ?? action.lane,
          round: action.id,
          title_terms: lane.title_terms,
          skill_terms: lane.skill_terms,
          company_terms: lane.company_terms,
        },
      },
    }];
  });
  const additionalRounds = [
    ...recallRounds.filter((round) => round.round !== "standard"),
    ...adaptiveRounds,
  ];
  let recallRequest = standardRound.request;
  const allRecallRounds = [standardRound, ...additionalRounds];
  const totalRequestedLimit = getTotalRecallRequestLimit(allRecallRounds);
  const baseRequestedLimit = getTotalRecallRequestLimit(recallRounds);
  const recallPersonas = getRecallPersonas(recallRounds);
  const totalProfileScanBudget =
    executionProfile.filterLimit + executionProfile.hiddenGemLimit + executionProfile.companyTargetLimit;
  const effectiveProfileScanBudget =
    recallStrategyMode !== "legacy" ? totalRequestedLimit : totalProfileScanBudget;
  const baseEffectiveProfileScanBudget =
    recallStrategyMode !== "legacy" ? baseRequestedLimit : totalProfileScanBudget;
  const persistedAdditionalSnapshots = new Map(
    (existingRecallMetadata?.additional_snapshots ?? []).map((snapshot) => [snapshot.round, snapshot]),
  );
  let additionalSnapshotRefs: RecallSnapshotRef[] = [];
  const skippedAdditionalRoundNames = new Set<string>();
  const markAdditionalRoundPending = (round: RecallRound, error: unknown, submittedAt: string) => {
    const message = error instanceof Error ? error.message : String(error);
    if (round.round.startsWith("adaptive_")) {
      updateAdaptiveRecallAction(parsed, round.round, {
        status: "failed",
        failed_at: submittedAt,
        failure_code: message.slice(0, 180),
      });
    }
    persistedAdditionalSnapshots.set(
      round.round,
      helpers.buildAdditionalSnapshotMetadata({
        round: round.round,
        snapshotId: null,
        recordsLimit: round.request.recordsLimit,
        filterHash: computeFilterHash(round.request),
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
    const existingAdaptiveAction = round.round.startsWith("adaptive_")
      ? adaptiveActionMap.get(round.round)
      : null;
    if (existingAdaptiveAction?.snapshotId) {
      const existingSnapshot = persistedAdditionalSnapshots.get(round.round);
      const existingSubmittedAt = existingAdaptiveAction.submittedAt ?? existingSnapshot?.submitted_at ?? submittedAt;
      updateAdaptiveRecallAction(parsed, round.round, {
        status: existingAdaptiveAction.status === "planned" ? "submitted" : existingAdaptiveAction.status,
        snapshot_id: existingAdaptiveAction.snapshotId,
        submitted_at: existingSubmittedAt,
      });
      const ref = {
        round: round.round,
        snapshotId: existingAdaptiveAction.snapshotId,
        request: round.request,
        recordsLimit: round.request.recordsLimit,
        filterHash: roundHash,
        diagnostics: round.diagnostics,
        submittedAt: existingSubmittedAt,
        cacheEntry: null,
      };
      persistedAdditionalSnapshots.set(
        round.round,
        helpers.buildAdditionalSnapshotMetadata({
          round: round.round,
          snapshotId: existingAdaptiveAction.snapshotId,
          recordsLimit: round.request.recordsLimit,
          filterHash: roundHash,
          existing: existingSnapshot ?? null,
          status: existingSnapshot?.status ?? "submitted",
          submittedAt: existingSubmittedAt,
          clearFailure: true,
        }),
      );
      helpers.logSearchEvent("search_adaptive_recall_existing_snapshot_reused", {
        search_id: context.searchId,
        round: round.round,
        snapshot_id: existingAdaptiveAction.snapshotId,
        records_limit: round.request.recordsLimit,
        job_id: context.jobId,
      });
      return ref;
    }
    if (isRecallFilterHashDuplicateForRound(usedRecallFilterHashes, roundHash, round.round)) {
      if (round.round.startsWith("adaptive_")) {
        updateAdaptiveRecallAction(parsed, round.round, {
          status: "recorded",
          completed_at: submittedAt,
          failure_code: "duplicate_revision_filter_hash",
          profiles_returned: 0,
          unique_added: 0,
        });
        helpers.logSearchEvent("search_adaptive_recall_duplicate_filter_skipped", {
          search_id: context.searchId,
          job_id: context.jobId,
          action_id: round.round,
          lane: existingAdaptiveAction?.lane ?? round.round,
          lane_kind: existingAdaptiveAction?.laneKind ?? getHeadhunterLaneKindForRound(round.round),
          filter_hash: roundHash,
        });
        persistedAdditionalSnapshots.delete(round.round);
        skippedAdditionalRoundNames.add(round.round);
        return null;
      }
      return null;
    }
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
    if (round.round.startsWith("adaptive_")) {
      updateAdaptiveRecallAction(parsed, round.round, {
        status: "submitted",
        snapshot_id: roundSnapshotId,
        submitted_at: submittedAt,
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
        filterHash: roundHash,
        existing: persistedAdditionalSnapshots.get(round.round) ?? null,
        status: "submitted",
        submittedAt,
        clearFailure: true,
      }),
    );
    return ref;
  };
  const buildSubmittedAdditionalSnapshotMetadata = () =>
    additionalRounds.filter((round) => !skippedAdditionalRoundNames.has(round.round)).map((round) => {
      const submitted = additionalSnapshotRefs.find((snapshot) => snapshot.round === round.round);
      if (submitted) {
        return helpers.buildAdditionalSnapshotMetadata({
          round: submitted.round,
          snapshotId: submitted.snapshotId,
          recordsLimit: submitted.recordsLimit,
          filterHash: submitted.filterHash,
          existing: persistedAdditionalSnapshots.get(submitted.round) ?? null,
          status: "submitted",
          submittedAt: submitted.submittedAt,
        });
      }
      return helpers.buildAdditionalSnapshotMetadata({
        round: round.round,
        snapshotId: null,
        recordsLimit: round.request.recordsLimit,
        filterHash: computeFilterHash(round.request),
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
  const getSnapshotProfileRows = async (
    targetSnapshotId: string,
    sourceRound: string,
    options?: { fallbackAnyRound?: boolean },
  ) => {
    const key = `${targetSnapshotId}:${sourceRound}:${options?.fallbackAnyRound ? "fallback" : "exact"}`;
    if (preloadedSnapshotProfileRows.has(key)) {
      return preloadedSnapshotProfileRows.get(key) ?? null;
    }
    const rows = await loadCachedSnapshotProfiles(targetSnapshotId, sourceRound, options);
    const cachedRows = rows?.length ? rows : null;
    preloadedSnapshotProfileRows.set(key, cachedRows);
    return cachedRows;
  };

  const buildRoundDiagnostics = (params: {
    standardReturned?: number | null;
    additionalReturned?: Map<string, number>;
    additionalUniqueAdded?: Map<string, number>;
    additionalDuplicateCount?: Map<string, number>;
    additionalOverlapRatio?: Map<string, number>;
    qualityDistribution?: Map<string, RecallRoundQualityDistribution>;
  } = {}): RecallRoundDiagnostics[] => {
    const roundsForDiagnostics = [
      ...(standardRound ? [standardRound] : []),
      ...additionalRounds.filter((round) => !skippedAdditionalRoundNames.has(round.round)),
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
        unique_added_count: round.round === "standard"
          ? returnedCount ?? null
          : params.additionalUniqueAdded?.get(round.round) ?? null,
        duplicate_count: round.round === "standard"
          ? 0
          : params.additionalDuplicateCount?.get(round.round) ?? null,
        overlap_ratio: round.round === "standard"
          ? 0
          : params.additionalOverlapRatio?.get(round.round) ?? null,
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
      bright_profile_budget: effectiveProfileScanBudget,
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
    baseRequestedLimit,
    baseEffectiveProfileScanBudget,
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
      next_budget: baseEffectiveProfileScanBudget,
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
      next_budget: baseEffectiveProfileScanBudget,
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
      bright_profile_budget: effectiveProfileScanBudget,
      bright_profiles_requested: totalRequestedLimit,
      judge_mode: runtime.judgeMode,
      recall_personas: recallPersonas,
      round_diagnostics: buildRoundDiagnostics(),
      additional_snapshots: buildSubmittedAdditionalSnapshotMetadata(),
    } satisfies RecallMetadata;
    await updateSearchParsedRequirements(context.searchId, parsed);
    const expectedAdditionalRoundCount = additionalRounds.filter(
      (round) => !skippedAdditionalRoundNames.has(round.round),
    ).length;
    if (additionalSnapshotRefs.length < expectedAdditionalRoundCount) {
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
      if (skippedAdditionalRoundNames.has(round.round)) continue;
      if (submittedRoundNames.has(round.round)) continue;
      const submitted = await submitAdditionalRoundSnapshot(round);
      if (submitted) {
        additionalSnapshotRefs.push(submitted);
        submittedRoundNames.add(round.round);
      }
    }
    const expectedAdditionalRoundCount = additionalRounds.filter(
      (round) => !skippedAdditionalRoundNames.has(round.round),
    ).length;
    if (additionalSnapshotRefs.length < expectedAdditionalRoundCount) {
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
        bright_profile_budget: effectiveProfileScanBudget,
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
      const cachedRoundRows = await getSnapshotProfileRows(round.snapshotId, round.round, {
        fallbackAnyRound: Boolean(round.cacheEntry),
      });
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
        filterHash: round.filterHash,
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
      bright_profile_budget: effectiveProfileScanBudget,
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
          filterHash: round.filterHash,
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
        bright_profile_budget: effectiveProfileScanBudget,
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
  const previousRecallIterations =
    helpers.normalizeRecallMetadata(parsed.recall_metadata)?.recall_iterations ??
    existingRecallMetadata?.recall_iterations ??
    [];
  const nextRecallIterations = recallStrategyMode !== "legacy"
    ? [
      {
        iteration: 1,
        lane: "standard",
        lane_kind: getHeadhunterLaneKindForRound("standard"),
        budget: standardRound.request.recordsLimit,
        snapshot_id: activeSnapshotId,
        filter_hash: computeFilterHash(standardRound.request),
        raw_profiles_returned: profiles.length,
        unique_profiles_added: profiles.length,
        duplicate_profiles_seen: 0,
        overlap_ratio: 0,
        market_slice_status: profiles.length > 0 ? "fresh" as const : "empty" as const,
        audit: null,
        continue_expansion: null,
      },
      ...additionalSnapshotStates.map((round, index) => ({
        iteration: index + 2,
        lane: round.round,
        lane_kind: adaptiveActionMap.get(round.round)?.laneKind ?? getHeadhunterLaneKindForRound(round.round),
        budget: adaptiveActionMap.get(round.round)?.budget ?? round.recordsLimit,
        snapshot_id: adaptiveActionMap.get(round.round)?.snapshotId ?? round.snapshotId,
        filter_hash: round.filterHash,
        audit: null,
        continue_expansion: null,
      })),
    ]
    : [];
  const recallIterations = recallStrategyMode !== "legacy"
    ? mergeRecallIterations(previousRecallIterations, nextRecallIterations)
    : [];

  parsed.recall_metadata = {
    provider: "brightdata_dataset",
    snapshot_id: activeSnapshotId,
    recall_strategy_mode: recallStrategyMode,
    ...(compiledFilterFidelityForRun.length > 0
      ? { compiled_filter_fidelity: compiledFilterFidelityForRun }
      : {}),
    ...(recallIterations.length > 0 ? { recall_iterations: recallIterations } : {}),
    dataset_size: metadata.dataset_size ?? profiles.length,
    recall_latency_ms: Date.now() - requestedAt,
    cost: getMetadataCost(metadata),
    bright_profile_budget: effectiveProfileScanBudget,
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
        filterHash: round.filterHash,
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
    ...(compiledFilterFidelityForRun.length > 0
      ? { compiled_filter_fidelity: compiledFilterFidelityForRun }
      : {}),
    round_diagnostics: buildRoundDiagnostics({ standardReturned: profiles.length }),
    status: "ready",
    filter_summary: filterSummary,
  };
  parsed.display_stats = helpers.buildSearchDisplayStats({
    ...(helpers.normalizeSearchDisplayStats(parsed.display_stats) ?? helpers.buildSearchDisplayStats({})),
    bright_profile_budget: effectiveProfileScanBudget,
    bright_profiles_requested: totalRequestedLimit,
    bright_profiles_returned: profiles.length,
    recall_strategy_mode: recallStrategyMode,
    recall_iteration_count: recallIterations.length || recallRounds.length,
    lane_audit_summary:
      recallStrategyMode !== "legacy" &&
      typeof parsed.display_stats === "object" &&
      parsed.display_stats &&
      typeof (parsed.display_stats as Record<string, unknown>).lane_audit_summary === "string"
        ? ((parsed.display_stats as Record<string, unknown>).lane_audit_summary as string)
        : recallStrategyMode !== "legacy"
          ? "Initial headhunter probe recalled primary exact and relaxed lanes; lane audit pending after scoring."
          : undefined,
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
  const additionalUniqueAddedCounts = new Map<string, number>();
  const additionalDuplicateCounts = new Map<string, number>();
  const additionalOverlapRatios = new Map<string, number>();
  const downloadDeferredAdditionalRounds: Array<{
    round: string;
    snapshotId: string;
    status: BrightDataSnapshotMetadata["status"] | "polling";
    submittedAt?: string | null;
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
        if (round.startsWith("adaptive_") && roundMeta.status === "failed") {
          updateAdaptiveRecallAction(parsed, round, {
            status: "failed",
            failed_at: helpers.nowIso(),
            failure_code: String(roundMeta.warning_code ?? roundMeta.error_code ?? "snapshot_failed").slice(0, 180),
          });
        }
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
                filterHash: roundRef.filterHash,
                existing: persistedAdditionalSnapshots.get(round) ?? null,
                status: "failed",
                submittedAt: roundRef.submittedAt ?? persistedAdditionalSnapshots.get(round)?.submitted_at ?? null,
                failedAt: helpers.nowIso(),
                failureCode: "cached_snapshot_download_unavailable",
                profilesReturned: null,
              }),
            );
            if (round.startsWith("adaptive_")) {
              updateAdaptiveRecallAction(parsed, round, {
                status: "failed",
                failed_at: helpers.nowIso(),
                failure_code: "cached_snapshot_download_unavailable",
              });
            }
            additionalReturnedCounts.set(round, 0);
            additionalUniqueAddedCounts.set(round, 0);
            additionalDuplicateCounts.set(round, 0);
            additionalOverlapRatios.set(round, 0);
            continue;
          }
          if (!helpers.isTransientSnapshotDownloadError(error)) {
            const failureCode = error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180);
            persistedAdditionalSnapshots.set(
              round,
              helpers.buildAdditionalSnapshotMetadata({
                round,
                snapshotId: roundSnapId,
                recordsLimit: roundRef.recordsLimit,
                filterHash: roundRef.filterHash,
                existing: persistedAdditionalSnapshots.get(round) ?? null,
                status: "failed",
                submittedAt: roundRef.submittedAt ?? persistedAdditionalSnapshots.get(round)?.submitted_at ?? null,
                failedAt: helpers.nowIso(),
                failureCode,
                profilesReturned: null,
              }),
            );
            if (round.startsWith("adaptive_")) {
              updateAdaptiveRecallAction(parsed, round, {
                status: "failed",
                failed_at: helpers.nowIso(),
                failure_code: failureCode,
              });
            }
            additionalReturnedCounts.set(round, 0);
            additionalUniqueAddedCounts.set(round, 0);
            additionalDuplicateCounts.set(round, 0);
            additionalOverlapRatios.set(round, 0);
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
              filterHash: roundRef.filterHash,
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
          additionalUniqueAddedCounts.set(round, 0);
          additionalDuplicateCounts.set(round, 0);
          additionalOverlapRatios.set(round, 0);
          downloadDeferredAdditionalRounds.push({
            round,
            snapshotId: roundSnapId,
            status: "polling",
            submittedAt: roundRef.submittedAt ?? persistedAdditionalSnapshots.get(round)?.submitted_at ?? null,
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
      additionalReturnedCounts.set(round, roundProfiles.length);
      if (roundProfiles.length === 0) {
        additionalUniqueAddedCounts.set(round, 0);
        additionalDuplicateCounts.set(round, 0);
        additionalOverlapRatios.set(round, 0);
        persistedAdditionalSnapshots.set(
          round,
          helpers.buildAdditionalSnapshotMetadata({
            round,
            snapshotId: roundSnapId,
            recordsLimit: roundRef.recordsLimit,
            filterHash: roundRef.filterHash,
            existing: persistedAdditionalSnapshots.get(round) ?? null,
            status: "ready",
            submittedAt: roundRef.submittedAt ?? persistedAdditionalSnapshots.get(round)?.submitted_at ?? null,
            readyAt: persistedAdditionalSnapshots.get(round)?.ready_at ?? helpers.nowIso(),
            lastPolledAt: persistedAdditionalSnapshots.get(round)?.last_polled_at ?? helpers.nowIso(),
            downloadStartedAt: roundDownloadStartedAt,
            downloadCompletedAt: helpers.nowIso(),
            profilesReturned: roundMeta?.dataset_size ?? roundProfiles.length,
            uniqueProfilesAdded: 0,
            duplicateProfilesSeen: 0,
            overlapRatio: 0,
            incrementDownloadAttempt: true,
          }),
        );
        if (round.startsWith("adaptive_")) {
          updateAdaptiveRecallAction(parsed, round, {
            status: "done",
            completed_at: helpers.nowIso(),
            profiles_returned: 0,
            unique_added: 0,
            duplicate_profiles_seen: 0,
            overlap_ratio: 0,
            market_slice_status: "empty",
          });
        }
        helpers.logSearchEvent("search_multi_round_empty", {
          search_id: context.searchId,
          round,
          snapshot_id: roundSnapId,
          job_id: context.jobId,
        });
        continue;
      }
      let addedCount = 0;
      let duplicateCount = 0;
      for (const profile of roundProfiles) {
        const key = profile.linkedin_id || profile.url || profile.name;
        if (key && seenIds.has(key)) {
          duplicateCount += 1;
          continue;
        }
        if (key) seenIds.add(key);
        (profile as Record<string, unknown>).__recall_source = round;
        allProfiles.push(profile);
        addedCount += 1;
      }
      const overlapRatio = roundProfiles.length > 0 ? duplicateCount / roundProfiles.length : 0;
      additionalUniqueAddedCounts.set(round, addedCount);
      additionalDuplicateCounts.set(round, duplicateCount);
      additionalOverlapRatios.set(round, overlapRatio);
      persistedAdditionalSnapshots.set(
        round,
        helpers.buildAdditionalSnapshotMetadata({
          round,
          snapshotId: roundSnapId,
          recordsLimit: roundRef.recordsLimit,
          filterHash: roundRef.filterHash,
          existing: persistedAdditionalSnapshots.get(round) ?? null,
          status: "ready",
          submittedAt: roundRef.submittedAt ?? persistedAdditionalSnapshots.get(round)?.submitted_at ?? null,
          readyAt: persistedAdditionalSnapshots.get(round)?.ready_at ?? helpers.nowIso(),
          lastPolledAt: persistedAdditionalSnapshots.get(round)?.last_polled_at ?? helpers.nowIso(),
          downloadStartedAt: roundDownloadStartedAt,
          downloadCompletedAt: helpers.nowIso(),
          profilesReturned: roundMeta?.dataset_size ?? roundProfiles.length,
          uniqueProfilesAdded: addedCount,
          duplicateProfilesSeen: duplicateCount,
          overlapRatio,
          incrementDownloadAttempt: true,
        }),
      );
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
        duplicate_profiles_seen: duplicateCount,
        overlap_ratio: overlapRatio,
        market_slice_status: overlapRatio >= DUPLICATE_MARKET_SLICE_OVERLAP_THRESHOLD
          ? "duplicate_market_slice"
          : "fresh",
        job_id: context.jobId,
      });
      if (round.startsWith("adaptive_")) {
        updateAdaptiveRecallAction(parsed, round, {
          status: "done",
          completed_at: helpers.nowIso(),
          profiles_returned: roundProfiles.length,
          unique_added: addedCount,
          duplicate_profiles_seen: duplicateCount,
          overlap_ratio: overlapRatio,
          market_slice_status: overlapRatio >= DUPLICATE_MARKET_SLICE_OVERLAP_THRESHOLD
            ? "duplicate_market_slice"
            : "fresh",
        });
      }
    }
  }

  const getDeferredAdditionalRoundNames = () => [
    ...deferredAdditionalRounds.map((round) => round.round),
    ...downloadDeferredAdditionalRounds.map((round) => round.round),
  ];
  const getDeferredAdditionalSubmittedAts = () => [
    ...deferredAdditionalRounds.map((round) =>
      round.submittedAt ?? persistedAdditionalSnapshots.get(round.round)?.submitted_at ?? null,
    ),
    ...downloadDeferredAdditionalRounds.map((round) =>
      round.submittedAt ?? persistedAdditionalSnapshots.get(round.round)?.submitted_at ?? null,
    ),
  ];
  const getCompletedAdaptiveRoundCount = () =>
    additionalSnapshotStates.filter((round) =>
      isAdaptiveRecallRoundName(round.round) &&
      (additionalReturnedCounts.get(round.round) ?? 0) > 0
    ).length;
  const applyRoundRecallStatsToIterations = (
    iterations: NonNullable<RecallMetadata["recall_iterations"]>,
  ): NonNullable<RecallMetadata["recall_iterations"]> =>
    iterations.map((iteration) => {
      if (iteration.lane === "standard") {
        return {
          ...iteration,
          raw_profiles_returned: standardProfileCount,
          unique_profiles_added: standardProfileCount,
          duplicate_profiles_seen: 0,
          overlap_ratio: 0,
          market_slice_status: standardProfileCount > 0 ? "fresh" : "empty",
        };
      }
      const returned = additionalReturnedCounts.get(iteration.lane);
      const uniqueAdded = additionalUniqueAddedCounts.get(iteration.lane);
      const duplicates = additionalDuplicateCounts.get(iteration.lane);
      const overlapRatio = additionalOverlapRatios.get(iteration.lane);
      if (
        returned == null &&
        uniqueAdded == null &&
        duplicates == null &&
        overlapRatio == null
      ) {
        return iteration;
      }
      return {
        ...iteration,
        raw_profiles_returned: returned ?? iteration.raw_profiles_returned ?? null,
        unique_profiles_added: uniqueAdded ?? iteration.unique_profiles_added ?? null,
        duplicate_profiles_seen: duplicates ?? iteration.duplicate_profiles_seen ?? null,
        overlap_ratio: overlapRatio ?? iteration.overlap_ratio ?? null,
        market_slice_status:
          returned === 0
            ? "empty"
            : (overlapRatio ?? iteration.overlap_ratio ?? 0) >= DUPLICATE_MARKET_SLICE_OVERLAP_THRESHOLD
              ? "duplicate_market_slice"
              : "fresh",
      };
    });

  if (
    shouldWaitForAdditionalRecallBeforeScoring({
      standardProfileCount,
      availableProfileCount: allProfiles.length,
      metadataDeferredRoundCount: deferredAdditionalRounds.length,
      downloadDeferredRoundCount: downloadDeferredAdditionalRounds.length,
      requestedProfileCount: totalRequestedLimit,
      recallStrategyMode,
      pendingRoundNames: getDeferredAdditionalRoundNames(),
      pendingRoundSubmittedAts: getDeferredAdditionalSubmittedAts(),
      completedAdaptiveRoundCount: getCompletedAdaptiveRoundCount(),
      elapsedMs: totalElapsedMs,
      timeoutMs: BRIGHTDATA_FILTER_TIMEOUT_MS,
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
      elapsed_ms: totalElapsedMs,
      timeout_ms: BRIGHTDATA_FILTER_TIMEOUT_MS,
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
      bright_profile_budget: effectiveProfileScanBudget,
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
        additionalUniqueAdded: additionalUniqueAddedCounts,
        additionalDuplicateCount: additionalDuplicateCounts,
        additionalOverlapRatio: additionalOverlapRatios,
      }),
      additional_snapshots: additionalSnapshotRefs.map((round) => ({
        ...helpers.buildAdditionalSnapshotMetadata({
          round: round.round,
          snapshotId: round.snapshotId,
          recordsLimit: round.recordsLimit,
          filterHash: round.filterHash,
          existing: persistedAdditionalSnapshots.get(round.round) ?? null,
          status: persistedAdditionalSnapshots.get(round.round)?.status ?? "polling",
          submittedAt: round.submittedAt ?? persistedAdditionalSnapshots.get(round.round)?.submitted_at ?? null,
          readyAt: persistedAdditionalSnapshots.get(round.round)?.ready_at ?? null,
          failedAt: persistedAdditionalSnapshots.get(round.round)?.failed_at ?? null,
          lastPolledAt: persistedAdditionalSnapshots.get(round.round)?.last_polled_at ?? null,
          downloadStartedAt: persistedAdditionalSnapshots.get(round.round)?.download_started_at ?? null,
          downloadCompletedAt: persistedAdditionalSnapshots.get(round.round)?.download_completed_at ?? null,
          profilesReturned: persistedAdditionalSnapshots.get(round.round)?.profiles_returned ?? null,
          uniqueProfilesAdded: persistedAdditionalSnapshots.get(round.round)?.unique_profiles_added ?? null,
          duplicateProfilesSeen: persistedAdditionalSnapshots.get(round.round)?.duplicate_profiles_seen ?? null,
          overlapRatio: persistedAdditionalSnapshots.get(round.round)?.overlap_ratio ?? null,
        }),
      })),
      status: "polling",
      filter_summary: filterSummary,
    };
    await updateSearchParsedRequirements(context.searchId, parsed);
    if (
      shouldTimeoutAdditionalRecallBeforeScoring({
        metadataDeferredRoundCount: deferredAdditionalRounds.length,
        downloadDeferredRoundCount: downloadDeferredAdditionalRounds.length,
        elapsedMs: totalElapsedMs,
        timeoutMs: BRIGHTDATA_FILTER_TIMEOUT_MS,
        recallStrategyMode,
        availableProfileCount: allProfiles.length,
        pendingRoundNames: getDeferredAdditionalRoundNames(),
        pendingRoundSubmittedAts: getDeferredAdditionalSubmittedAts(),
        completedAdaptiveRoundCount: getCompletedAdaptiveRoundCount(),
      })
    ) {
      helpers.logSearchEvent("search_additional_rounds_timeout_before_score", {
        search_id: context.searchId,
        job_id: context.jobId,
        standard_profiles: standardProfileCount,
        currently_available_profiles: allProfiles.length,
        deferred_rounds: blockedAdditionalRounds,
        elapsed_ms: totalElapsedMs,
        timeout_ms: BRIGHTDATA_FILTER_TIMEOUT_MS,
      });
      throw new Error(
        `Bright Data additional recall timed out after ${BRIGHTDATA_FILTER_TIMEOUT_MS}ms before scoring ${allProfiles.length} profiles`,
      );
    }
    throw new DatasetRecallPendingError(
      `Waiting for ${blockedAdditionalRounds.length} additional recall round(s) before scoring ${allProfiles.length} profiles`,
      { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
    );
  }

  const nonblockingDeferredRoundNames = getDeferredAdditionalRoundNames();
  if (
    shouldContinueWithPartialHeadhunterRecall({
      recallStrategyMode,
      availableProfileCount: allProfiles.length,
      pendingRoundCount: nonblockingDeferredRoundNames.length,
      pendingRoundNames: nonblockingDeferredRoundNames,
      pendingRoundSubmittedAts: getDeferredAdditionalSubmittedAts(),
      completedAdaptiveRoundCount: getCompletedAdaptiveRoundCount(),
      elapsedMs: totalElapsedMs,
      timeoutMs: BRIGHTDATA_FILTER_TIMEOUT_MS,
    })
  ) {
    const stoppedAt = helpers.nowIso();
    for (const round of nonblockingDeferredRoundNames) {
      if (!isAdaptiveRecallRoundName(round)) continue;
      updateAdaptiveRecallAction(parsed, round, {
        status: "stopped",
        completed_at: stoppedAt,
        failure_code: "nonblocking_pending_recall_after_partial_delivery",
        profiles_returned: null,
        unique_added: 0,
      });
    }
    const adaptiveState = readAdaptiveRecallState(parsed);
    if (adaptiveState) {
      parsed.adaptive_recall = {
        ...adaptiveState,
        phase: "not_needed",
        should_continue: false,
        stop_reason: "nonblocking_pending_adaptive_after_partial_delivery",
      };
    }
    helpers.logSearchEvent("search_additional_rounds_nonblocking_after_partial_delivery", {
      search_id: context.searchId,
      job_id: context.jobId,
      standard_profiles: standardProfileCount,
      currently_available_profiles: allProfiles.length,
      completed_adaptive_rounds: getCompletedAdaptiveRoundCount(),
      deferred_rounds: [
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
      ],
    });
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
  const recallIterationsWithRoundStats = recallStrategyMode !== "legacy"
    ? applyRoundRecallStatsToIterations(recallIterations)
    : recallIterations;
  const persistedAdditionalSnapshotList = additionalSnapshotRefs.map((round) =>
    persistedAdditionalSnapshots.get(round.round) ??
    helpers.buildAdditionalSnapshotMetadata({
      round: round.round,
      snapshotId: round.snapshotId,
      recordsLimit: round.recordsLimit,
      filterHash: round.filterHash,
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
    bright_profile_budget: effectiveProfileScanBudget,
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
    ...(compiledFilterFidelityForRun.length > 0
      ? { compiled_filter_fidelity: compiledFilterFidelityForRun }
      : {}),
    ...(recallIterationsWithRoundStats.length > 0
      ? { recall_iterations: recallIterationsWithRoundStats }
      : {}),
    round_diagnostics: buildRoundDiagnostics({
      standardReturned: standardProfileCount,
      additionalReturned: additionalReturnedCounts,
      additionalUniqueAdded: additionalUniqueAddedCounts,
      additionalDuplicateCount: additionalDuplicateCounts,
      additionalOverlapRatio: additionalOverlapRatios,
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
      recallStrategyMode,
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
      additionalUniqueAdded: additionalUniqueAddedCounts,
      additionalDuplicateCount: additionalDuplicateCounts,
      additionalOverlapRatio: additionalOverlapRatios,
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
    bright_profile_budget: effectiveProfileScanBudget,
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
  if (candidateIndexPipelineIsActive()) {
    const candidateIndexResult = await runCandidateIndexWorkflow({
    context,
    parsed,
    profiles: allProfiles,
    snapshotId: activeSnapshotId,
    brightCost: resolvedRecallCost ?? undefined,
    brightRequested: totalRequestedLimit,
  });
    parsed.candidate_index_metrics = {
      ...candidateIndexResult.metrics,
      local_eligible_count: null,
      bright_supplemented: true,
    };
    parsed.display_stats = helpers.buildSearchDisplayStats({
      ...(helpers.normalizeSearchDisplayStats(parsed.display_stats) ?? helpers.buildSearchDisplayStats({})),
      ...candidateIndexResult.displayStats,
    });
    await updateSearchParsedRequirements(context.searchId, parsed);
    helpers.logSearchEvent("candidate_index_pipeline_completed", {
      search_id: context.searchId,
      job_id: context.jobId,
      ...candidateIndexResult.metrics,
    });
    return {
      finalRows: candidateIndexResult.finalRows,
      displayStats: parsed.display_stats as SearchDisplayStats,
    };
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
      totalProfileScanBudget: effectiveProfileScanBudget,
      totalProfilesRequested: totalRequestedLimit,
    },
  );

  const qualityDistributionByRound = buildRoundQualityDistribution(
    combinedResult.assessments,
    allProfiles,
  );
  const roundDiagnosticsWithQuality = buildRoundDiagnostics({
    standardReturned: standardProfileCount,
    additionalReturned: additionalReturnedCounts,
    additionalUniqueAdded: additionalUniqueAddedCounts,
    additionalDuplicateCount: additionalDuplicateCounts,
    additionalOverlapRatio: additionalOverlapRatios,
    qualityDistribution: qualityDistributionByRound,
  });
  const recallMetadataBeforeLaneAudit = helpers.normalizeRecallMetadata(parsed.recall_metadata) ?? {
    provider: "brightdata_dataset" as const,
    snapshot_id: activeSnapshotId,
  };
  const recallIterationsBeforeLaneAudit = recallStrategyMode !== "legacy"
    ? applyRoundRecallStatsToIterations(recallMetadataBeforeLaneAudit.recall_iterations ?? recallIterations)
    : recallMetadataBeforeLaneAudit.recall_iterations ?? recallIterations;
  const laneAuditState = recallStrategyMode !== "legacy"
    ? await auditHeadhunterRecallLanes({
      context,
      parsed,
      recallSpec,
      profiles: allProfiles,
      assessments: combinedResult.assessments,
      recallIterations: recallIterationsBeforeLaneAudit,
      roundDiagnostics: roundDiagnosticsWithQuality,
      helpers,
    })
    : null;
  const effectiveRecallIterations =
    laneAuditState?.recallIterations ??
    recallIterationsBeforeLaneAudit;
  const displayStatsBeforeAdaptive = helpers.buildSearchDisplayStats({
    ...(helpers.normalizeSearchDisplayStats(parsed.display_stats) ?? helpers.buildSearchDisplayStats({})),
    ...combinedResult.displayStats,
  });
  const pendingAdaptiveActionsAfterScoring = hasPlannedAdaptiveRecallActions(parsed);
  const adaptivePlan = recallStrategyMode !== "legacy" && !pendingAdaptiveActionsAfterScoring
    ? planAdaptiveExpansion({
      parsed,
      recallMetadata: {
        ...recallMetadataBeforeLaneAudit,
        recall_iterations: effectiveRecallIterations,
        round_diagnostics: roundDiagnosticsWithQuality,
      },
      displayStats: displayStatsBeforeAdaptive,
      recallSpec,
      totalBudget: context.candidateCount,
      strategyMode: recallStrategyMode === "headhunter_v2" ? "headhunter_v2" : "headhunter_v1",
      isDuplicateRevision: ({ revised_lane: revisedLane, budget }) => {
        const request = buildAdaptiveRecallLaneRequest(revisedLane, budget);
        if (!request) return false;
        const requestHash = computeFilterHash(request);
        if (isRecallFilterHashDuplicateForRound(usedRecallFilterHashes, requestHash)) {
          return true;
        }
        rememberRecallFilterHash(usedRecallFilterHashes, requestHash, `planned:${requestHash}`);
        return false;
      },
    })
    : null;
  const laneAuditSummary =
    laneAuditState?.laneAuditSummary ??
    (recallStrategyMode !== "legacy"
      ? "Lane audit could not be completed; inspect scheduler logs for lane audit failures."
      : undefined);
  const resultDisplayStats = helpers.buildSearchDisplayStats({
    ...(helpers.normalizeSearchDisplayStats(parsed.display_stats) ?? helpers.buildSearchDisplayStats({})),
    ...combinedResult.displayStats,
    bright_snapshot_cost: resolvedRecallCost ?? undefined,
    bright_profile_budget: effectiveProfileScanBudget,
    bright_profiles_requested: totalRequestedLimit,
    bright_profiles_returned: allProfiles.length,
    judge_mode: runtime.judgeMode,
    recall_strategy_mode: recallStrategyMode,
    recall_iteration_count: effectiveRecallIterations.length || recallIterations.length,
    lane_audit_summary: laneAuditSummary,
    actionable_candidate_count: combinedResult.displayStats.recommended_count,
    stopped_lane_count: laneAuditState?.stoppedLaneCount,
    adaptive_recall_planned_budget: adaptivePlan?.planned_budget,
    adaptive_recall_remaining_budget: adaptivePlan?.remaining_budget,
  });
  const previousAdaptiveState = readAdaptiveRecallState(parsed);
  if (adaptivePlan && adaptivePlan.should_continue && adaptivePlan.planned_budget > 0) {
    const plannedAt = helpers.nowIso();
    const batchIndex = getNextAdaptiveRecallBatchIndex(parsed);
    parsed.adaptive_recall = toAdaptiveRecallState({
      plan: adaptivePlan,
      plannedAt,
      phase: "planned",
      batchIndex,
      strategyMode: recallStrategyMode === "headhunter_v2" ? "headhunter_v2" : "headhunter_v1",
      previousState: previousAdaptiveState,
    });
    helpers.logSearchEvent("search_adaptive_recall_planned", {
      search_id: context.searchId,
      job_id: context.jobId,
      should_continue: adaptivePlan.should_continue,
      stop_reason: adaptivePlan.stop_reason,
      batch_index: batchIndex,
      planned_budget: adaptivePlan.planned_budget,
      remaining_budget: adaptivePlan.remaining_budget,
      actions: adaptivePlan.actions.map((action) => ({
        type: action.type,
        lane: action.lane,
        lane_kind: action.lane_kind,
        budget: action.budget,
      })),
    });
  } else if (adaptivePlan) {
    parsed.adaptive_recall = toAdaptiveRecallState({
      plan: adaptivePlan,
      plannedAt: helpers.nowIso(),
      phase: "not_needed",
      batchIndex: typeof previousAdaptiveState?.batch_index === "number" && Number.isFinite(previousAdaptiveState.batch_index)
        ? Math.max(0, Math.round(previousAdaptiveState.batch_index))
        : 0,
      strategyMode: recallStrategyMode === "headhunter_v2" ? "headhunter_v2" : "headhunter_v1",
      previousState: previousAdaptiveState,
    });
  }
  parsed.recall_metadata = {
    ...recallMetadataBeforeLaneAudit,
    provider: "brightdata_dataset",
    snapshot_id: activeSnapshotId,
    recall_iterations: effectiveRecallIterations,
    recall_personas: recallPersonas,
    ...(compiledFilterFidelityForRun.length > 0
      ? { compiled_filter_fidelity: compiledFilterFidelityForRun }
      : {}),
    round_diagnostics: roundDiagnosticsWithQuality,
  };
  if (laneAuditState) {
    parsed.display_stats = helpers.buildSearchDisplayStats({
      ...resultDisplayStats,
      lane_audit_summary: laneAuditState.laneAuditSummary,
      stopped_lane_count: laneAuditState.stoppedLaneCount,
    });
  }
  if (!laneAuditState) {
    parsed.display_stats = resultDisplayStats;
  }

  if (adaptivePlan && adaptivePlan.should_continue && adaptivePlan.planned_budget > 0) {
    await upsertCandidatesForSearch(context.searchId, combinedResult.finalRows, {
      replaceMissing: false,
    });
    await updateSearchParsedRequirements(context.searchId, parsed);
    await setSearchStatus(context.searchId, "deep_scoring", {
      parsed_requirements: parsed,
    });
    helpers.logSearchEvent("search_adaptive_recall_requeued", {
      search_id: context.searchId,
      job_id: context.jobId,
      planned_budget: adaptivePlan.planned_budget,
      remaining_budget: adaptivePlan.remaining_budget,
      current_profiles: allProfiles.length,
      current_actionable_candidates: combinedResult.displayStats.recommended_count,
    });
    throw new DatasetRecallPendingError(
      `Adaptive headhunter recall planned ${adaptivePlan.planned_budget} additional profile(s)`,
      { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
    );
  }

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
    displayStats: resultDisplayStats,
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

  if (phase1Parsed.candidate_index_force_bright !== true) {
    const { intent } = buildCandidateIndexSearchIntent(context.jdText, phase1Parsed);
    const localEligibleCount = await countEligibleProfiles(intent);
    if (localEligibleCount >= 300) {
      await setSearchStatus(context.searchId, "searching", { parsed_requirements: phase1Parsed });
      const localResult = await runCandidateIndexWorkflow({
        context,
        parsed: phase1Parsed,
        profiles: [],
        snapshotId: null,
        brightRequested: 0,
      });
      phase1Parsed.candidate_index_metrics = {
        ...localResult.metrics,
        local_eligible_count: localEligibleCount,
        bright_supplemented: false,
      };
      await completeSearch(
        context,
        phase1Parsed,
        localResult.finalRows,
        helpers.buildSearchDisplayStats(localResult.displayStats),
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
          replaceMissingCandidates: true,
          runtime: getExecutionRuntime(initialExecutionProfileWithBudget),
        },
      );
      return;
    }
  }

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
