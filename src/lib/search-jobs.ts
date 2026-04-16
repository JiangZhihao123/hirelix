import {
  CANDIDATE_SUITABILITY_PROMPT,
  JD_SEARCH_INTENT_PROMPT,
} from "@/lib/prompts";
import {
  brightDataProfileToRichText,
  adaptDatasetRecordToBrightDataProfile,
  BrightDataRequestTimeoutError,
  BrightDataSnapshotNotReadyError,
  triggerDatasetFilter,
  getDatasetSnapshotMetadata,
  downloadDatasetSnapshot,
  computeFilterHash,
  type BrightDataFilterRule,
  type BrightDataDatasetFilterRequest,
  type BrightDataSnapshotMetadata,
  type BrightDataProfile,
} from "@/lib/brightdata";
import {
  buildDeterministicWeakEvidenceOutreachDraft,
  buildFallbackOutreachDraft,
  buildRecruiterOutreachPrompt,
  buildRecruiterOutreachEvidence,
} from "@/lib/recruiter-outreach";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import {
  generateOpenRouterJson,
} from "@/lib/openrouter";
import {
  ARBITER_SCORE_JSON_SCHEMA,
  buildJudgeScoreJsonSchema,
  buildOutreachDraftJsonSchema,
  JD_SEARCH_INTENT_JSON_SCHEMA,
} from "@/lib/openrouter-schemas";
import {
  getInitialSearchExecutionProfile,
  getSearchExecutionProfile,
  normalizeSearchExecutionProfileName,
  normalizeSearchPlanCode,
  type SearchExecutionProfile,
  type SearchPlanCode,
} from "@/lib/search-execution";
import { queueOrSendSearchNotification } from "@/lib/search-notifications";
import {
  ARBITER_SCORING_TIMEOUT_MS,
  BRIGHTDATA_COMPANY_TARGET_LIMIT,
  BRIGHTDATA_FILTER_POLL_INTERVAL_MS,
  BRIGHTDATA_FILTER_TIMEOUT_MS,
  BRIGHTDATA_HIDDEN_GEM_LIMIT,
  BRIGHTDATA_STANDARD_LIMIT,
  DEEP_REVIEW_CONCURRENCY,
  DEEP_REVIEW_DEBUG_LOGS,
  DEEP_SCORING_BATCH_SIZE,
  DEEP_SCORING_CONCURRENCY,
  ESTIMATED_DEEP_REVIEW_CONFLICT_RATE,
  GITHUB_ENRICH_LIMIT,
  getExecutionRuntime,
  HIGHLIGHT_CANDIDATE_COUNT,
  JUDGE_SCORING_TIMEOUT_MS,
  OUTREACH_POOL_TARGET,
  PARSE_MAX_OUTPUT_TOKENS,
  PARSE_MAX_ATTEMPTS,
  roundCurrency,
  resolveStageConcurrency,
  REVIEWABLE_SEARCH_STATUSES,
  SEARCH_JOB_MAX_ATTEMPTS,
  SHORTLIST_CAPABILITY_MIN,
  SHORTLIST_JOIN_LIKELIHOOD_MIN,
  SHORTLIST_MATCH_SCORE_MIN,
  SHORTLIST_RELEVANCE_MIN,
  estimateLlmCallCost,
  estimateSearchIntentCost,
  estimateTokensFromText,
} from "@/lib/search/config";
import {
  runWithConcurrency,
  sleep,
  withTimeout,
} from "@/lib/search/concurrency";
import {
  claimSearchJob,
  enqueueSearchJob,
  hasRunnableSearchJobs,
  kickSearchJobRunner,
  reclaimStaleRunningJobs as reclaimStaleRunningJobsInternal,
  resolveSearchJobRunnerBaseUrl,
  updateRunningJobStatus,
} from "@/lib/search/job-queue";
import {
  logSearchEvent,
  normalizeCandidateRowInput,
  normalizeCountryCode,
  normalizeEnumValue,
  normalizeExperienceYears,
  normalizeNullableString,
  normalizeScore,
  normalizeScrapedDescription,
  normalizeStringArray,
  normalizeSummaryTerms,
  normalizeText,
  nowIso,
  truncateForPrompt,
} from "@/lib/search/normalize";
import {
  cacheSnapshotEntry,
  countCandidatesForSearch,
  lookupCachedSnapshot,
  persistSnapshotProfiles,
  retagSearchCandidatePoolTypes,
  setSearchStatus,
  updateCachedSnapshotMetadata,
  updateSearchParsedRequirements,
  updateSearchUsageEventMetadata,
  upsertCandidatesForSearch,
  upsertSingleCandidate,
} from "@/lib/search/persistence";
import {
  buildBrightDataCandidateRows,
  buildBrightDataRecallFilter,
  buildBrightDataRecallFilters,
  enrichRowsWithGithubSignals,
  type RecallFilterMode,
  trimBrightDataProfileForMetadata,
} from "@/lib/search/recall";
import {
  buildArbiterPrompt,
  buildJudgeScorePrompt,
  hasJudgeConflict,
  mergeJudgeResults,
  parseJudgeScoreResults,
  parseScoredAssessments,
  selectShortlistedAssessments,
  tagPoolRows,
} from "@/lib/search/scoring";
import type {
  AdvanceRecommendation,
  BlockingSeverity,
  CandidateDisplayTier,
  CandidateRowInput,
  CandidateSuitability,
  CompanyProfile,
  ConstraintVerdict,
  ExcludedReason,
  ExcludedReasonCount,
  HiringBrief,
  JudgeScoreResult,
  PipelineContext,
  RecallMetadata,
  RecallProvider,
  RecallSpec,
  ScoredCandidateAssessment,
  SearchCostEstimate,
  SearchDisplayStats,
  SearchExecutionRuntime,
  SearchJobRow,
  SearchPipelineResult,
  SearchRow,
  ShortlistDecision,
  AdditionalRecallSnapshot,
  ScoringBreakdown,
} from "@/lib/search/types";
export {
  enqueueSearchJob,
  kickSearchJobRunner,
  resolveSearchJobRunnerBaseUrl,
};

class DatasetRecallPendingError extends Error {
  retryImmediately: boolean;
  retryDelayMs: number;

  constructor(message: string, options?: { retryImmediately?: boolean; retryDelayMs?: number }) {
    super(message);
    this.name = "DatasetRecallPendingError";
    this.retryImmediately = options?.retryImmediately ?? true;
    this.retryDelayMs = Math.max(1000, options?.retryDelayMs ?? BRIGHTDATA_FILTER_POLL_INTERVAL_MS);
  }
}

import { supabaseAdmin } from "@/lib/supabase-server";

const GEO_ALLOWLISTS = [
  {
    matchers: [/new york|nyc|manhattan|brooklyn|queens|bronx|jersey city|hoboken|newark/i],
    strict: [
      "new york city",
      "new york",
      "nyc",
      "manhattan",
      "brooklyn",
      "queens",
      "bronx",
      "new york city metropolitan area",
      "new york metropolitan area",
    ],
    nearby: ["jersey city", "hoboken", "newark"],
    geoStrategy:
      "Treat NYC boroughs as local and close-in Hudson County / Newark as nearby metro options.",
  },
  {
    matchers: [/san francisco|bay area|oakland|berkeley|san jose|palo alto|mountain view/i],
    strict: [
      "san francisco",
      "bay area",
      "san francisco bay area",
      "oakland",
      "berkeley",
      "san jose",
      "palo alto",
      "mountain view",
    ],
    nearby: ["redwood city", "menlo park", "fremont", "walnut creek"],
    geoStrategy:
      "Treat the Bay Area as one hiring market and rank Peninsula / East Bay candidates as nearby when needed.",
  },
  {
    matchers: [/los angeles|la metro|santa monica|pasadena|culver city|burbank|glendale/i],
    strict: [
      "los angeles",
      "los angeles metropolitan area",
      "santa monica",
      "pasadena",
      "culver city",
      "burbank",
      "glendale",
    ],
    nearby: ["long beach", "irvine", "west hollywood"],
    geoStrategy:
      "Treat LA proper as local and nearby inner-metro cities as acceptable nearby options.",
  },
];

function compactNormalizedTerms(values: Array<string | null | undefined>, maxItems: number) {
  const deduped = new Set<string>();
  for (const value of values) {
    const normalized = normalizeText(value).replace(/\b(remote|hybrid|onsite|on site)\b/g, " ").trim();
    if (!normalized || normalized.length < 3) continue;
    deduped.add(normalized.replace(/\s+/g, " "));
    if (deduped.size >= maxItems) break;
  }
  return Array.from(deduped);
}

function deriveGeoStrategy(locationScope: string | null) {
  const normalized = normalizeText(locationScope).replace(/\b(remote|hybrid|onsite|on site)\b/g, " ").trim();
  if (!normalized) {
    return {
      strictTerms: [] as string[],
      nearbyTerms: [] as string[],
      geoStrategy: null as string | null,
    };
  }

  const commaParts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  const baseTerms = compactNormalizedTerms(
    [normalized, commaParts[0], commaParts.slice(-1)[0]],
    12,
  );
  const allowlist = GEO_ALLOWLISTS.find((entry) =>
    entry.matchers.some((matcher) => matcher.test(normalized)),
  );

  if (!allowlist) {
    return {
      strictTerms: baseTerms,
      nearbyTerms: [],
      geoStrategy:
        baseTerms.length > 0
          ? `Treat ${baseTerms[0]} as the primary local market and avoid obvious out-of-region candidates.`
          : null,
    };
  }

  return {
    strictTerms: compactNormalizedTerms([...allowlist.strict, ...baseTerms], 16),
    nearbyTerms: compactNormalizedTerms(allowlist.nearby, 8),
    geoStrategy: allowlist.geoStrategy,
  };
}

function normalizeRecallSpec(
  value: unknown,
  candidateCount: number,
  options?: { recordLimitOverride?: number | null },
): RecallSpec {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const countries = Array.isArray(item.countries)
    ? item.countries
      .map((country) => normalizeCountryCode(country))
      .filter((country): country is string => Boolean(country))
      .slice(0, 5)
    : [];
  const title_variants = normalizeStringArray(item.title_variants, 8);
  const core_skill_terms = normalizeStringArray(item.core_skill_terms, 12);
  const differentiating_skill_terms = normalizeStringArray(item.differentiating_skill_terms, 5);
  const baseline_skill_terms = normalizeStringArray(item.baseline_skill_terms, 6);
  const domain_terms = normalizeStringArray(item.domain_terms, 3);
  const location_terms = normalizeStringArray(item.location_terms, 10);
  const strict_location_terms = normalizeStringArray(
    item.strict_location_terms ?? item.location_terms,
    16,
  );
  const nearby_location_terms = normalizeStringArray(item.nearby_location_terms, 10);
  const must_have_signals = normalizeStringArray(item.must_have_signals, 12);
  const avoid_profiles = normalizeStringArray(item.avoid_profiles, 10);
  const geo_strategy = normalizeNullableString(item.geo_strategy);
  const recall_confidence = normalizeEnumValue(
    item.recall_confidence,
    ["high", "medium", "low"] as const,
    "medium",
  );
  const role_breadth = normalizeEnumValue(
    item.role_breadth,
    ["narrow", "balanced", "broad"] as const,
    "balanced",
  );
  const lateral_title_variants = normalizeStringArray(item.lateral_title_variants, 6);
  const target_companies = normalizeStringArray(item.target_companies, 15);
  const requested_recall_strategy = normalizeEnumValue(
    item.recall_strategy,
    ["standard", "multi_round"] as const,
    "standard",
  );
  const recall_strategy = deriveStableRecallStrategy({
    requestedStrategy: requested_recall_strategy,
    differentiatingSkillTerms: differentiating_skill_terms,
    lateralTitleVariants: lateral_title_variants,
    targetCompanies: target_companies,
    roleBreadth: role_breadth,
    recallConfidence: recall_confidence,
  });
  const requestedLimit =
    typeof options?.recordLimitOverride === "number" &&
    Number.isFinite(options.recordLimitOverride)
      ? Math.round(options.recordLimitOverride)
      : typeof item.record_limit === "number" && Number.isFinite(item.record_limit)
        ? Math.round(item.record_limit)
        : BRIGHTDATA_STANDARD_LIMIT;

  return {
    countries,
    title_variants,
    core_skill_terms,
    differentiating_skill_terms,
    baseline_skill_terms,
    domain_terms,
    location_terms,
    strict_location_terms,
    nearby_location_terms,
    must_have_signals,
    avoid_profiles,
    geo_strategy,
    recall_confidence,
    role_breadth,
    lateral_title_variants,
    target_companies,
    recall_strategy,
    record_limit:
      typeof options?.recordLimitOverride === "number" &&
      Number.isFinite(options.recordLimitOverride)
        ? Math.max(1, requestedLimit)
        : Math.min(
          Math.max(requestedLimit, 25),
          BRIGHTDATA_STANDARD_LIMIT,
        ),
  };
}

function isPlaceholderTitle(title: string | null | undefined) {
  if (!title) return true;
  return normalizeText(title) === "untitled role";
}

const FALLBACK_CORE_SKILL_TERMS = [
  "python",
  "typescript",
  "javascript",
  "node.js",
  "next.js",
  "react",
  "postgresql",
  "aws",
  "docker",
  "kubernetes",
  "llm",
  "ai agent",
];

const FALLBACK_SAAS_BACKEND_TARGET_COMPANIES = [
  "Stripe",
  "Twilio",
  "Shopify",
  "Atlassian",
  "HubSpot",
  "Zoom",
  "Snowflake",
  "Datadog",
  "MongoDB",
  "Elastic",
  "Auth0",
  "Plaid",
  "Brex",
  "Notion",
  "Airtable",
];

function deriveCoreSkillsFromJdText(jdText: string, maxItems = 12) {
  const lower = jdText.toLowerCase();
  const deduped = new Set<string>();
  for (const term of FALLBACK_CORE_SKILL_TERMS) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(lower)) {
      deduped.add(term);
      if (deduped.size >= maxItems) break;
    }
  }
  return Array.from(deduped);
}

function getCountryLocationAliases(countryCodes: string[]) {
  const aliases = new Set<string>();
  const displayNames =
    typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
      ? new Intl.DisplayNames(["en"], { type: "region" })
      : null;

  for (const countryCode of countryCodes) {
    const normalizedCode = normalizeCountryCode(countryCode);
    if (!normalizedCode) continue;
    aliases.add(normalizeText(normalizedCode));
    const displayName = displayNames?.of(normalizedCode);
    if (displayName) aliases.add(normalizeText(displayName));

    if (normalizedCode === "US") {
      aliases.add("us");
      aliases.add("usa");
      aliases.add("u s");
      aliases.add("united states");
      aliases.add("united states of america");
    }
    if (normalizedCode === "GB") {
      aliases.add("uk");
      aliases.add("u k");
      aliases.add("great britain");
      aliases.add("united kingdom");
    }
  }

  return aliases;
}

function buildRecallLocationFilter(
  hiringBrief: HiringBrief,
  recallSpec: RecallSpec,
  countryCodes: string[],
  mode: RecallFilterMode,
): BrightDataFilterRule | null {
  if (hiringBrief.location_flexibility !== "strict" && hiringBrief.location_flexibility !== "moderate") {
    return null;
  }

  const countryAliases = getCountryLocationAliases(countryCodes);
  const strictLocationTerms = recallSpec.strict_location_terms
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 3);
  const nearbyLocationTerms = recallSpec.nearby_location_terms
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 3);
  const locationTerms = recallSpec.location_terms
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 3);

  const nonCountryLocationTerms = compactNormalizedTerms(
    [...strictLocationTerms, ...nearbyLocationTerms, ...locationTerms],
    16,
  ).filter((term) => !countryAliases.has(term));

  if (nonCountryLocationTerms.length === 0) {
    return null;
  }

  const strictModeTerms = compactNormalizedTerms(
    [...strictLocationTerms, ...nearbyLocationTerms],
    12,
  ).filter((term) => !countryAliases.has(term));

  const effectiveTerms =
    hiringBrief.location_flexibility === "strict"
      ? strictModeTerms
      : mode === "relaxed"
        ? strictModeTerms
        : nonCountryLocationTerms;

  if (effectiveTerms.length === 0) {
    return null;
  }

  return {
    operator: "or",
    filters: effectiveTerms.map((term) => ({
      name: "location",
      operator: "includes",
      value: term,
    })),
  };
}

function buildStandardSkillTerms(recallSpec: RecallSpec, mode: RecallFilterMode) {
  const baselineTerms = recallSpec.baseline_skill_terms
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 2);
  const coreTerms = recallSpec.core_skill_terms
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 2);
  const differentiatingTerms = recallSpec.differentiating_skill_terms
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 2);

  const primaryTerms = baselineTerms.length > 0
    ? baselineTerms
    : coreTerms.slice(0, mode === "relaxed" ? 3 : 5);
  const supplementalDifferentiatingTerms =
    mode === "primary"
      ? differentiatingTerms.filter((term) => !primaryTerms.includes(term)).slice(0, 2)
      : [];

  return compactNormalizedTerms(
    [...primaryTerms, ...supplementalDifferentiatingTerms],
    mode === "relaxed" ? 4 : 6,
  );
}

function buildStandardSkillFilter(recallSpec: RecallSpec, mode: RecallFilterMode): BrightDataFilterRule | null {
  const standardSkillTerms = buildStandardSkillTerms(recallSpec, mode);
  if (standardSkillTerms.length === 0) {
    return null;
  }

  const filters: BrightDataFilterRule[] = [];
  for (const term of standardSkillTerms) {
    filters.push({
      name: "about",
      operator: "includes",
      value: term,
    });
  }
  for (const term of standardSkillTerms) {
    filters.push({
      name: "position",
      operator: "includes",
      value: term,
    });
  }

  return {
    operator: "or",
    filters: filters.slice(0, 12),
  };
}

function deriveStableRecallStrategy(input: {
  requestedStrategy: RecallSpec["recall_strategy"];
  differentiatingSkillTerms: string[];
  lateralTitleVariants: string[];
  targetCompanies: string[];
  roleBreadth: RecallSpec["role_breadth"];
  recallConfidence: RecallSpec["recall_confidence"];
}) {
  const differentiatingTerms = input.differentiatingSkillTerms
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 2);
  const lateralTitles = input.lateralTitleVariants
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 3);
  const targetCompanies = input.targetCompanies
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 2);

  const hasHiddenGemSignals = lateralTitles.length >= 2 && differentiatingTerms.length >= 2;
  const hasCompanyTargetSignals = targetCompanies.length >= 5;
  const hasEnoughExpansionSignals =
    hasCompanyTargetSignals ||
    hasHiddenGemSignals ||
    (
      input.roleBreadth !== "narrow" &&
      input.recallConfidence !== "low" &&
      (
        (lateralTitles.length >= 2 && differentiatingTerms.length >= 1) ||
        (targetCompanies.length >= 3 && differentiatingTerms.length >= 1)
      )
    );

  if (hasEnoughExpansionSignals) {
    return "multi_round" as const;
  }

  return input.requestedStrategy;
}

function inferTargetCompaniesFromParsed(
  parsed: Record<string, unknown>,
  title: string | null,
  coreSkillTerms: string[],
  domainTerms: string[],
) {
  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const normalizedTitle = normalizeText(title);
  const normalizedDomainTerms = domainTerms.map((term) => normalizeText(term));
  const normalizedCoreSkills = coreSkillTerms.map((term) => normalizeText(term));
  const normalizedRequiredSkills = hiringBrief.role_core.required_skills.map((term) => normalizeText(term));
  const allSkillSignals = new Set([...normalizedCoreSkills, ...normalizedRequiredSkills]);

  const backendRole =
    /(backend|software engineer|platform|api|distributed systems|infrastructure)/.test(normalizedTitle) ||
    hiringBrief.role_core.function_focus === "backend";
  const saasSignals =
    normalizedDomainTerms.some((term) => ["b2b", "saas", "fintech", "developer tools"].includes(term)) ||
    ["growth", "enterprise"].includes(hiringBrief.company_stage_expectation) ||
    ["node.js", "typescript", "postgresql", "aws", "distributed systems", "api development", "microservices", "serverless", "lambda", "kubernetes"]
      .some((term) => allSkillSignals.has(term));

  if (backendRole && saasSignals) {
    return FALLBACK_SAAS_BACKEND_TARGET_COMPANIES.slice(0, 15);
  }

  return [];
}

function mapSnapshotStatus(
  metadata: BrightDataSnapshotMetadata | null | undefined,
): AdditionalRecallSnapshot["status"] {
  if (!metadata) return "submitted";
  if (metadata.status === "ready") return "ready";
  if (metadata.status === "failed") return "failed";
  return "polling";
}

function isTransientSnapshotDownloadError(error: unknown) {
  return (
    error instanceof BrightDataSnapshotNotReadyError ||
    error instanceof BrightDataRequestTimeoutError
  );
}

function inferCountriesFromJdText(jdText: string) {
  const lower = jdText.toLowerCase();
  if (
    lower.includes("new york") ||
    lower.includes("nyc") ||
    lower.includes("united states") ||
    /\busa\b/.test(lower) ||
    /\bus\b/.test(lower)
  ) {
    return ["US"];
  }
  return [];
}

function deriveMustHaveSignalsFromParsed(
  parsed: Record<string, unknown>,
  jdText: string,
) {
  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const signals = [
    ...hiringBrief.role_core.required_skills,
    ...hiringBrief.must_have_constraints,
    ...deriveCoreSkillsFromJdText(jdText, 8),
  ];
  return compactNormalizedTerms(signals, 12);
}

function deriveAvoidProfilesFromParsed(
  parsed: Record<string, unknown>,
  jdText: string,
) {
  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const normalizedJd = normalizeText(jdText);
  const avoid = new Set<string>();
  const title = normalizeText(parsed.title as string | null);

  if (title.includes("founding") || normalizedJd.includes("startup")) {
    avoid.add("enterprise only manager");
    avoid.add("pure platform engineer");
  }
  if (title.includes("software engineer") || title.includes("full stack")) {
    avoid.add("machine learning only");
    avoid.add("sales engineer");
  }
  if (hiringBrief.work_model === "onsite" || hiringBrief.work_model === "hybrid") {
    avoid.add("non local candidate");
  }

  return Array.from(avoid).slice(0, 8);
}

function enrichRecallSpecFromJd(
  parsed: Record<string, unknown>,
  jdText: string,
  candidateCount: number,
) {
  const recallSpec = normalizeRecallSpec(parsed.recall_spec, candidateCount);
  const parsedTitle = normalizeNullableString(parsed.title);
  const title = !isPlaceholderTitle(parsedTitle)
    ? parsedTitle
    : null;
  const titleVariants = recallSpec.title_variants.length > 0
    ? recallSpec.title_variants
    : (title ? [title] : []);
  const coreSkillTerms = recallSpec.core_skill_terms.length > 0
    ? recallSpec.core_skill_terms
    : deriveCoreSkillsFromJdText(jdText, 12);
  // New tiered skill terms — fallback to core_skill_terms split if LLM didn't provide them
  const differentiatingSkillTerms = recallSpec.differentiating_skill_terms.length > 0
    ? recallSpec.differentiating_skill_terms
    : [];
  const baselineSkillTerms = recallSpec.baseline_skill_terms.length > 0
    ? recallSpec.baseline_skill_terms
    : [];
  const domainTerms = recallSpec.domain_terms.length > 0
    ? recallSpec.domain_terms
    : [];
  const countries = recallSpec.countries.length > 0
    ? recallSpec.countries
    : inferCountriesFromJdText(jdText);
  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const geo = deriveGeoStrategy(hiringBrief.location_scope);
  const derivedLocationTerms = compactNormalizedTerms(
    [...geo.strictTerms, ...geo.nearbyTerms],
    16,
  );
  const locationTerms = recallSpec.location_terms.length > 0
    ? recallSpec.location_terms
    : derivedLocationTerms;
  const mustHaveSignals = recallSpec.must_have_signals.length > 0
    ? recallSpec.must_have_signals
    : deriveMustHaveSignalsFromParsed(parsed, jdText);
  const avoidProfiles = recallSpec.avoid_profiles.length > 0
    ? recallSpec.avoid_profiles
    : deriveAvoidProfilesFromParsed(parsed, jdText);
  const targetCompanies = recallSpec.target_companies.length > 0
    ? recallSpec.target_companies
    : inferTargetCompaniesFromParsed(parsed, title, coreSkillTerms, domainTerms);
  const recallStrategy = deriveStableRecallStrategy({
    requestedStrategy: recallSpec.recall_strategy,
    differentiatingSkillTerms: differentiatingSkillTerms,
    lateralTitleVariants: recallSpec.lateral_title_variants,
    targetCompanies: targetCompanies,
    roleBreadth: recallSpec.role_breadth,
    recallConfidence: recallSpec.recall_confidence,
  });

  return {
    ...recallSpec,
    title_variants: titleVariants.slice(0, 8),
    core_skill_terms: coreSkillTerms.slice(0, 12),
    differentiating_skill_terms: differentiatingSkillTerms.slice(0, 5),
    baseline_skill_terms: baselineSkillTerms.slice(0, 6),
    domain_terms: domainTerms.slice(0, 3),
    countries: countries.slice(0, 5),
    location_terms: locationTerms.slice(0, 16),
    strict_location_terms:
      (recallSpec.strict_location_terms.length > 0
        ? recallSpec.strict_location_terms
        : geo.strictTerms).slice(0, 16),
    nearby_location_terms:
      (recallSpec.nearby_location_terms.length > 0
        ? recallSpec.nearby_location_terms
        : geo.nearbyTerms).slice(0, 10),
    must_have_signals: mustHaveSignals.slice(0, 12),
    avoid_profiles: avoidProfiles.slice(0, 8),
    geo_strategy: recallSpec.geo_strategy || geo.geoStrategy,
    recall_confidence: recallSpec.recall_confidence,
    role_breadth: recallSpec.role_breadth,
    lateral_title_variants: recallSpec.lateral_title_variants.slice(0, 6),
    target_companies: targetCompanies.slice(0, 15),
    recall_strategy: recallStrategy,
  };
}

function isWeakParsedIntent(
  parsed: Record<string, unknown>,
  candidateCount: number,
) {
  const title = normalizeNullableString(parsed.title);
  const recallSpec = normalizeRecallSpec(parsed.recall_spec, candidateCount);
  return (
    !title ||
    /^untitled role$/i.test(title) ||
    recallSpec.title_variants.length === 0 ||
    recallSpec.core_skill_terms.length === 0
  );
}

function buildSearchDisplayStats(
  overrides: Partial<SearchDisplayStats>,
): SearchDisplayStats {
  const deepReviewRequestedCount = Math.max(
    0,
    Math.round(overrides.deep_review_requested_count ?? overrides.deep_review_count ?? 0),
  );
  const deepReviewCompletedCount = Math.max(
    0,
    Math.round(
      overrides.deep_review_completed_count ??
      overrides.deep_review_count ??
        deepReviewRequestedCount,
    ),
  );
  const excludedReasonCounts = Array.isArray(overrides.excluded_reason_counts)
    ? overrides.excluded_reason_counts
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const reason = normalizeEnumValue(
          record.reason,
          [
            "stack_gap",
            "title_or_seniority_mismatch",
            "location_or_work_model",
            "evidence_too_weak",
            "response_risk",
            "multiple_risks",
          ] as const,
          "multiple_risks",
        );
        const count = Math.max(
          0,
          Math.round(typeof record.count === "number" ? record.count : 0),
        );
        return count > 0 ? { reason, count } : null;
      })
      .filter((item): item is ExcludedReasonCount => Boolean(item))
      .sort((left, right) => right.count - left.count)
    : [];
  return {
    retrieval_count: Math.max(0, Math.round(overrides.retrieval_count ?? 0)),
    deep_review_count: deepReviewCompletedCount,
    deep_review_requested_count: deepReviewRequestedCount,
    deep_review_completed_count: deepReviewCompletedCount,
    qualified_count: Math.max(0, Math.round(overrides.qualified_count ?? 0)),
    outreach_pool_count: Math.max(0, Math.round(overrides.outreach_pool_count ?? 0)),
    shortlist_count: Math.max(0, Math.round(overrides.shortlist_count ?? 0)),
    ...(typeof overrides.brightdata_scrape_count === "number"
      ? { brightdata_scrape_count: Math.max(0, Math.round(overrides.brightdata_scrape_count)) }
      : {}),
    ...(typeof overrides.deep_qualified_rate === "number"
      ? { deep_qualified_rate: Math.max(0, Math.min(1, overrides.deep_qualified_rate)) }
      : {}),
    ...(typeof overrides.hard_blocked_count === "number"
      ? { hard_blocked_count: Math.max(0, Math.round(overrides.hard_blocked_count)) }
      : {}),
    ...(typeof overrides.soft_blocked_count === "number"
      ? { soft_blocked_count: Math.max(0, Math.round(overrides.soft_blocked_count)) }
      : {}),
    ...(typeof overrides.advanceable_count === "number"
      ? { advanceable_count: Math.max(0, Math.round(overrides.advanceable_count)) }
      : {}),
    ...(typeof overrides.top_quality_score === "number"
      ? { top_quality_score: Math.max(0, Math.min(100, Math.round(overrides.top_quality_score))) }
      : {}),
    ...(typeof overrides.top50_quality_cutoff === "number"
      ? {
        top50_quality_cutoff: Math.max(
          0,
          Math.min(100, Math.round(overrides.top50_quality_cutoff)),
        ),
      }
      : {}),
    ...(typeof overrides.bright_profile_budget === "number"
      ? { bright_profile_budget: Math.max(0, Math.round(overrides.bright_profile_budget)) }
      : {}),
    ...(typeof overrides.bright_profiles_requested === "number"
      ? { bright_profiles_requested: Math.max(0, Math.round(overrides.bright_profiles_requested)) }
      : {}),
    ...(typeof overrides.bright_profiles_returned === "number"
      ? { bright_profiles_returned: Math.max(0, Math.round(overrides.bright_profiles_returned)) }
      : {}),
    ...(typeof overrides.bright_snapshot_cost === "number"
      ? { bright_snapshot_cost: Math.max(0, overrides.bright_snapshot_cost) }
      : {}),
    ...(typeof overrides.estimated_llm_cost === "number"
      ? { estimated_llm_cost: Math.max(0, overrides.estimated_llm_cost) }
      : {}),
    ...(typeof overrides.estimated_search_total_cost === "number"
      ? { estimated_search_total_cost: Math.max(0, overrides.estimated_search_total_cost) }
      : {}),
    ...(overrides.judge_mode === "single" || overrides.judge_mode === "dual"
      ? { judge_mode: overrides.judge_mode }
      : {}),
    ...(typeof overrides.activation_run === "boolean"
      ? { activation_run: overrides.activation_run }
      : {}),
    ...(typeof overrides.quality_floor_applied === "boolean"
      ? { quality_floor_applied: overrides.quality_floor_applied }
      : {}),
    ...(typeof overrides.visible_candidate_count === "number"
      ? { visible_candidate_count: Math.max(0, Math.round(overrides.visible_candidate_count)) }
      : {}),
    ...(typeof overrides.pre_gate_blocked_count === "number"
      ? { pre_gate_blocked_count: Math.max(0, Math.round(overrides.pre_gate_blocked_count)) }
      : {}),
    ...(typeof overrides.prescreen_blocked_count === "number"
      ? { prescreen_blocked_count: Math.max(0, Math.round(overrides.prescreen_blocked_count)) }
      : {}),
    ...(typeof overrides.contact_unlock_candidates === "number"
      ? { contact_unlock_candidates: Math.max(0, Math.round(overrides.contact_unlock_candidates)) }
      : {}),
    ...(typeof overrides.recall_profile_count === "number"
      ? { recall_profile_count: Math.max(0, Math.round(overrides.recall_profile_count)) }
      : {}),
    ...(typeof overrides.priority_outreach_count === "number"
      ? { priority_outreach_count: Math.max(0, Math.round(overrides.priority_outreach_count)) }
      : {}),
    ...(typeof overrides.worth_reviewing_count === "number"
      ? { worth_reviewing_count: Math.max(0, Math.round(overrides.worth_reviewing_count)) }
      : {}),
    ...(typeof overrides.ruled_out_count === "number"
      ? { ruled_out_count: Math.max(0, Math.round(overrides.ruled_out_count)) }
      : {}),
    ...(typeof overrides.strong_now_count === "number"
      ? { strong_now_count: Math.max(0, Math.round(overrides.strong_now_count)) }
      : {}),
    ...(typeof overrides.consider_next_count === "number"
      ? { consider_next_count: Math.max(0, Math.round(overrides.consider_next_count)) }
      : {}),
    ...(typeof overrides.do_not_show_count === "number"
      ? { do_not_show_count: Math.max(0, Math.round(overrides.do_not_show_count)) }
      : {}),
    ...(typeof overrides.clear_location_fit_count === "number"
      ? { clear_location_fit_count: Math.max(0, Math.round(overrides.clear_location_fit_count)) }
      : {}),
    ...(typeof overrides.must_have_strong_count === "number"
      ? { must_have_strong_count: Math.max(0, Math.round(overrides.must_have_strong_count)) }
      : {}),
    ...(typeof overrides.first_contact_confidence_count === "number"
      ? { first_contact_confidence_count: Math.max(0, Math.round(overrides.first_contact_confidence_count)) }
      : {}),
    ...(typeof overrides.brief_ready_at === "string" &&
      overrides.brief_ready_at.length > 0
      ? { brief_ready_at: overrides.brief_ready_at }
      : {}),
    ...(typeof overrides.first_shortlist_candidate_at === "string" &&
      overrides.first_shortlist_candidate_at.length > 0
      ? { first_shortlist_candidate_at: overrides.first_shortlist_candidate_at }
      : {}),
    ...(typeof overrides.reviewable_at === "string" &&
      overrides.reviewable_at.length > 0
      ? { reviewable_at: overrides.reviewable_at }
      : {}),
    ...(typeof overrides.time_to_ack_ms === "number" && Number.isFinite(overrides.time_to_ack_ms)
      ? { time_to_ack_ms: Math.max(0, Math.round(overrides.time_to_ack_ms)) }
      : {}),
    ...(typeof overrides.time_to_brief_ready_ms === "number" &&
      Number.isFinite(overrides.time_to_brief_ready_ms)
      ? { time_to_brief_ready_ms: Math.max(0, Math.round(overrides.time_to_brief_ready_ms)) }
      : {}),
    ...(typeof overrides.time_to_standard_recall_ready_ms === "number" &&
      Number.isFinite(overrides.time_to_standard_recall_ready_ms)
      ? { time_to_standard_recall_ready_ms: Math.max(0, Math.round(overrides.time_to_standard_recall_ready_ms)) }
      : {}),
    ...(typeof overrides.time_to_first_shortlist_candidate_ms === "number" &&
      Number.isFinite(overrides.time_to_first_shortlist_candidate_ms)
      ? { time_to_first_shortlist_candidate_ms: Math.max(0, Math.round(overrides.time_to_first_shortlist_candidate_ms)) }
      : {}),
    ...(typeof overrides.time_to_reviewable_ms === "number" &&
      Number.isFinite(overrides.time_to_reviewable_ms)
      ? { time_to_reviewable_ms: Math.max(0, Math.round(overrides.time_to_reviewable_ms)) }
      : {}),
    ...(typeof overrides.time_to_done_ms === "number" && Number.isFinite(overrides.time_to_done_ms)
      ? { time_to_done_ms: Math.max(0, Math.round(overrides.time_to_done_ms)) }
      : {}),
    ...(excludedReasonCounts.length > 0
      ? { excluded_reason_counts: excludedReasonCounts }
      : {}),
  };
}

function estimateBrightPipelineLlmCost(params: {
  context: PipelineContext;
  parsed: Record<string, unknown>;
  renderProfileEntries: string[];
  selectedCount: number;
  finalRows: CandidateRowInput[];
  runtime: SearchExecutionRuntime;
}): SearchCostEstimate {
  const parseCost =
    typeof params.parsed.estimated_parse_llm_cost === "number"
      ? Math.max(0, Number(params.parsed.estimated_parse_llm_cost))
      : estimateSearchIntentCost(params.context.jdText);
  const searchContextTokens = estimateTokensFromText(buildPromptSearchContext(params.parsed), 250);
  const truncatedJdTokens = estimateTokensFromText(
    truncateForPrompt(params.context.jdText, 3000),
    220,
  );
  const sampleSize = Math.min(5, params.renderProfileEntries.length);
  const avgProfileTokens =
    sampleSize > 0
      ? Math.ceil(
          params.renderProfileEntries
            .slice(0, sampleSize)
            .reduce((sum, entry) => sum + estimateTokensFromText(entry, 500), 0) / sampleSize,
        )
      : 500;

  const preScreenInputTokens = searchContextTokens + avgProfileTokens + 180;
  const preScreenOutputTokens = Math.min(params.runtime.lightPrescreenMaxOutputTokens, 60);
  const preScreenCost =
    params.renderProfileEntries.length *
    estimateLlmCallCost(preScreenInputTokens, preScreenOutputTokens);

  const judgeInputTokens = searchContextTokens + truncatedJdTokens + avgProfileTokens + 260;
  const judgeOutputTokens = Math.min(params.runtime.judgeMaxOutputTokens, 260);
  const judgeCallCount =
    params.runtime.judgeMode === "single"
      ? params.selectedCount
      : params.selectedCount * 2;
  const judgeCost =
    judgeCallCount * estimateLlmCallCost(judgeInputTokens, judgeOutputTokens);

  const arbiterCallCount =
    params.runtime.judgeMode === "dual"
      ? Math.round(params.selectedCount * ESTIMATED_DEEP_REVIEW_CONFLICT_RATE)
      : 0;
  const arbiterInputTokens = searchContextTokens + truncatedJdTokens + avgProfileTokens + 320;
  const arbiterOutputTokens = Math.min(params.runtime.arbiterMaxOutputTokens, 220);
  const arbiterCost =
    arbiterCallCount * estimateLlmCallCost(arbiterInputTokens, arbiterOutputTokens);

  const outreachPromptSample =
    params.finalRows.length > 0
      ? buildRecruiterOutreachPrompt({
          roleTitle: normalizeNullableString(params.parsed.title) || "this role",
          jdText: params.context.jdText,
          candidate: {
            name: params.finalRows[0].name,
            headline: params.finalRows[0].headline,
            location: params.finalRows[0].location,
            skills: params.finalRows[0].skills,
            matchReasons: params.finalRows[0].match_reasons,
            githubSignals:
              params.finalRows[0].metadata.github_signals &&
              typeof params.finalRows[0].metadata.github_signals === "object"
                ? params.finalRows[0].metadata.github_signals
                : null,
          },
        })
      : null;
  const outreachInputTokens = estimateTokensFromText(outreachPromptSample, 220);
  const outreachOutputTokens = Math.min(params.runtime.outreachMaxOutputTokens, 180);
  const outreachCost =
    params.finalRows.length * estimateLlmCallCost(outreachInputTokens, outreachOutputTokens);

  const estimatedLlmCost = roundCurrency(
    parseCost + preScreenCost + judgeCost + arbiterCost + outreachCost,
  );

  return {
    estimatedLlmCost,
    estimatedSearchTotalCost: estimatedLlmCost,
  };
}

function normalizeSearchDisplayStats(value: unknown): SearchDisplayStats | null {
  return value && typeof value === "object"
    ? buildSearchDisplayStats(value as Partial<SearchDisplayStats>)
    : null;
}

function withExecutionState(
  parsed: Record<string, unknown>,
  executionProfile: SearchExecutionProfile,
  options: {
    planCode: SearchPlanCode;
    displayCount?: number;
  },
): Record<string, unknown> {
  return {
    ...parsed,
    plan_code: options.planCode,
    execution_profile: executionProfile.name,
    search_phase: "phase_1",
    result_stage: "final",
    judge_mode: executionProfile.singleJudgeMode ? "single" : "dual",
    display_count: options.displayCount ?? executionProfile.finalResultCap,
  };
}

function isActivationRun(parsed: Record<string, unknown> | null | undefined) {
  return parsed?.activation_run === true;
}

function normalizeRecallMetadata(value: unknown): RecallMetadata | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const provider: RecallProvider = "brightdata_dataset";
  const snapshotId = normalizeNullableString(item.snapshot_id);
  if (!snapshotId) return null;

  const status = normalizeNullableString(item.status);
  const dataset_size =
    typeof item.dataset_size === "number" && Number.isFinite(item.dataset_size)
      ? Math.max(0, Math.round(item.dataset_size))
      : null;
  const recall_latency_ms =
    typeof item.recall_latency_ms === "number" && Number.isFinite(item.recall_latency_ms)
      ? Math.max(0, Math.round(item.recall_latency_ms))
      : null;
  const cost =
    typeof item.cost === "number" && Number.isFinite(item.cost)
      ? Math.max(0, item.cost)
      : null;
  const bright_profile_budget =
    typeof item.bright_profile_budget === "number" && Number.isFinite(item.bright_profile_budget)
      ? Math.max(0, Math.round(item.bright_profile_budget))
      : null;
  const bright_profiles_requested =
    typeof item.bright_profiles_requested === "number" &&
      Number.isFinite(item.bright_profiles_requested)
      ? Math.max(0, Math.round(item.bright_profiles_requested))
      : null;
  const bright_profiles_returned =
    typeof item.bright_profiles_returned === "number" &&
      Number.isFinite(item.bright_profiles_returned)
      ? Math.max(0, Math.round(item.bright_profiles_returned))
      : null;
  const requested_at = normalizeNullableString(item.requested_at);
  const completed_at = normalizeNullableString(item.completed_at);
  const standard_recall_requested_at = normalizeNullableString(item.standard_recall_requested_at);
  const standard_recall_ready_at = normalizeNullableString(item.standard_recall_ready_at);
  const standard_recall_completed_at = normalizeNullableString(item.standard_recall_completed_at);
  const standard_download_started_at = normalizeNullableString(item.standard_download_started_at);
  const standard_download_completed_at = normalizeNullableString(item.standard_download_completed_at);
  const all_recall_completed_at = normalizeNullableString(item.all_recall_completed_at);
  const additional_snapshots = Array.isArray(item.additional_snapshots)
    ? item.additional_snapshots
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const snapshot = entry as Record<string, unknown>;
        const round = normalizeNullableString(snapshot.round);
        const snapshotId = normalizeNullableString(snapshot.snapshot_id);
        if (!round || !snapshotId) return null;
        const records_limit =
          typeof snapshot.records_limit === "number" && Number.isFinite(snapshot.records_limit)
            ? Math.max(0, Math.round(snapshot.records_limit))
            : null;
        const submitted_at = normalizeNullableString(snapshot.submitted_at);
        const ready_at = normalizeNullableString(snapshot.ready_at);
        const failed_at = normalizeNullableString(snapshot.failed_at);
        const last_polled_at = normalizeNullableString(snapshot.last_polled_at);
        const download_started_at = normalizeNullableString(snapshot.download_started_at);
        const download_completed_at = normalizeNullableString(snapshot.download_completed_at);
        const completed_at = normalizeNullableString(snapshot.completed_at);
        const profiles_returned =
          typeof snapshot.profiles_returned === "number" && Number.isFinite(snapshot.profiles_returned)
            ? Math.max(0, Math.round(snapshot.profiles_returned))
            : null;
        const poll_attempt_count =
          typeof snapshot.poll_attempt_count === "number" && Number.isFinite(snapshot.poll_attempt_count)
            ? Math.max(0, Math.round(snapshot.poll_attempt_count))
            : null;
        const download_attempt_count =
          typeof snapshot.download_attempt_count === "number" &&
          Number.isFinite(snapshot.download_attempt_count)
            ? Math.max(0, Math.round(snapshot.download_attempt_count))
            : null;
        const status = normalizeNullableString(snapshot.status);
        const normalizedStatus: AdditionalRecallSnapshot["status"] =
          status === "submitted" ||
          status === "polling" ||
          status === "ready" ||
          status === "failed"
            ? status
            : undefined;
        return {
          round,
          snapshot_id: snapshotId,
          records_limit,
          submitted_at,
          ready_at,
          failed_at,
          last_polled_at,
          download_started_at,
          download_completed_at,
          completed_at,
          profiles_returned,
          poll_attempt_count,
          download_attempt_count,
          status: normalizedStatus,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    : [];
  const rawFilterSummary =
    item.filter_summary && typeof item.filter_summary === "object"
      ? (item.filter_summary as Record<string, unknown>)
      : null;
  const filter_summary = rawFilterSummary
    ? {
      title_terms: normalizeStringArray(rawFilterSummary.title_terms, 12),
      country_codes: normalizeStringArray(rawFilterSummary.country_codes, 6),
      location_terms: normalizeStringArray(rawFilterSummary.location_terms, 16),
      strict_location_terms: normalizeStringArray(rawFilterSummary.strict_location_terms, 16),
      nearby_location_terms: normalizeStringArray(rawFilterSummary.nearby_location_terms, 10),
      must_have_signals: normalizeStringArray(rawFilterSummary.must_have_signals, 12),
      avoid_profiles: normalizeStringArray(rawFilterSummary.avoid_profiles, 10),
    }
    : null;
  const judge_mode =
    item.judge_mode === "single" || item.judge_mode === "dual"
      ? item.judge_mode
      : null;

  return {
    provider,
    snapshot_id: snapshotId,
    dataset_size,
    recall_latency_ms,
    cost,
    bright_profile_budget,
    bright_profiles_requested,
    bright_profiles_returned,
    judge_mode,
    requested_at,
    completed_at,
    standard_recall_requested_at,
    standard_recall_ready_at,
    standard_recall_completed_at,
    standard_download_started_at,
    standard_download_completed_at,
    all_recall_completed_at,
    additional_snapshots,
    status:
      status === "submitted" || status === "polling" || status === "ready"
        ? status
        : undefined,
    filter_summary,
  };
}

function buildAdditionalSnapshotMetadata(params: {
  round: string;
  snapshotId: string;
  recordsLimit?: number | null;
  existing?: AdditionalRecallSnapshot | null;
  status?: AdditionalRecallSnapshot["status"];
  submittedAt?: string | null;
  readyAt?: string | null;
  failedAt?: string | null;
  failureCode?: string | null;
  lastPolledAt?: string | null;
  downloadStartedAt?: string | null;
  downloadCompletedAt?: string | null;
  profilesReturned?: number | null;
  incrementPollAttempt?: boolean;
  incrementDownloadAttempt?: boolean;
}) {
  const existing = params.existing ?? null;
  const readyAt = params.readyAt ?? existing?.ready_at ?? null;
  const failedAt = params.failedAt ?? existing?.failed_at ?? null;
  const failureCode = params.failureCode ?? existing?.failure_code ?? null;
  return {
    round: params.round,
    snapshot_id: params.snapshotId,
    records_limit: params.recordsLimit ?? existing?.records_limit ?? null,
    status: params.status ?? existing?.status,
    submitted_at: params.submittedAt ?? existing?.submitted_at ?? null,
    ready_at: readyAt,
    failed_at: failedAt,
    failure_code: failureCode,
    last_polled_at: params.lastPolledAt ?? existing?.last_polled_at ?? null,
    download_started_at: params.downloadStartedAt ?? existing?.download_started_at ?? null,
    download_completed_at: params.downloadCompletedAt ?? existing?.download_completed_at ?? null,
    completed_at:
      readyAt ??
      failedAt ??
      params.downloadCompletedAt ??
      existing?.completed_at ??
      null,
    profiles_returned: params.profilesReturned ?? existing?.profiles_returned ?? null,
    poll_attempt_count:
      (existing?.poll_attempt_count ?? 0) + (params.incrementPollAttempt ? 1 : 0),
    download_attempt_count:
      (existing?.download_attempt_count ?? 0) + (params.incrementDownloadAttempt ? 1 : 0),
  } satisfies AdditionalRecallSnapshot;
}

function hasRecallSnapshotDrift(
  metadata: RecallMetadata | null,
  filterSummary: {
    title_terms: string[];
    country_codes: string[];
    location_terms: string[];
    strict_location_terms?: string[];
    nearby_location_terms?: string[];
    must_have_signals?: string[];
    avoid_profiles?: string[];
  },
  executionProfile: SearchExecutionProfile,
  runtime: SearchExecutionRuntime,
  requestedLimit: number,
) {
  if (!metadata || metadata.provider !== "brightdata_dataset") return false;
  if (!metadata.snapshot_id) return false;

  const sameTitleTerms =
    JSON.stringify(normalizeSummaryTerms(metadata.filter_summary?.title_terms)) ===
    JSON.stringify(normalizeSummaryTerms(filterSummary.title_terms));
  const sameCountryCodes =
    JSON.stringify(normalizeSummaryTerms(metadata.filter_summary?.country_codes)) ===
    JSON.stringify(normalizeSummaryTerms(filterSummary.country_codes));
  const sameLocationTerms =
    JSON.stringify(normalizeSummaryTerms(metadata.filter_summary?.location_terms)) ===
    JSON.stringify(normalizeSummaryTerms(filterSummary.location_terms));
  const sameStrictLocationTerms =
    JSON.stringify(normalizeSummaryTerms(metadata.filter_summary?.strict_location_terms)) ===
    JSON.stringify(normalizeSummaryTerms(filterSummary.strict_location_terms));
  const sameNearbyLocationTerms =
    JSON.stringify(normalizeSummaryTerms(metadata.filter_summary?.nearby_location_terms)) ===
    JSON.stringify(normalizeSummaryTerms(filterSummary.nearby_location_terms));
  const sameMustHaveSignals =
    JSON.stringify(normalizeSummaryTerms(metadata.filter_summary?.must_have_signals)) ===
    JSON.stringify(normalizeSummaryTerms(filterSummary.must_have_signals));
  const sameAvoidProfiles =
    JSON.stringify(normalizeSummaryTerms(metadata.filter_summary?.avoid_profiles)) ===
    JSON.stringify(normalizeSummaryTerms(filterSummary.avoid_profiles));
  const sameBudget =
    metadata.bright_profile_budget == null ||
    metadata.bright_profile_budget === executionProfile.filterLimit;
  const sameRequested =
    metadata.bright_profiles_requested == null ||
    metadata.bright_profiles_requested === requestedLimit;
  const sameJudgeMode =
    metadata.judge_mode == null ||
    metadata.judge_mode === runtime.judgeMode;

  return !(
    sameTitleTerms &&
    sameCountryCodes &&
    sameLocationTerms &&
    sameStrictLocationTerms &&
    sameNearbyLocationTerms &&
    sameMustHaveSignals &&
    sameAvoidProfiles &&
    sameBudget &&
    sameRequested &&
    sameJudgeMode
  );
}

function canReuseParsedRequirements(search: SearchRow) {
  const parsed = search.parsed_requirements;
  if (!parsed || typeof parsed !== "object") return false;
  if (normalizeNullableString(parsed.parse_origin) === "clarify_preview") {
    return false;
  }
  const title = normalizeNullableString(parsed.title);
  const recallSpec = normalizeRecallSpec(parsed.recall_spec, Number(parsed.candidate_count) || 5);
  return Boolean(search.parse_completed_at && title && recallSpec.title_variants.length > 0);
}

function buildSearchIntentInput(
  jdText: string,
  userClarification: string | null,
) {
  if (!userClarification) return jdText;
  return `${jdText.trim()}\n\nRecruiter clarification:\n${userClarification}`;
}

function withDisplayStats(
  parsed: Record<string, unknown>,
  stats: SearchDisplayStats,
): Record<string, unknown> {
  return {
    ...parsed,
    display_stats: stats,
  };
}

function sanitizeHiringBrief(value: unknown, fallbackParsed: Record<string, unknown>): HiringBrief {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const roleCore =
    item.role_core && typeof item.role_core === "object"
      ? (item.role_core as Record<string, unknown>)
      : {};

  const fallbackRequired = normalizeStringArray(fallbackParsed.required_skills, 12);
  const fallbackNiceToHave = normalizeStringArray(fallbackParsed.nice_to_have_skills, 12);

  return {
    role_core: {
      title: normalizeNullableString(roleCore.title) || normalizeNullableString(fallbackParsed.title),
      seniority:
        normalizeNullableString(roleCore.seniority) ||
        normalizeNullableString(fallbackParsed.seniority),
      function_focus: normalizeNullableString(roleCore.function_focus),
      required_skills:
        normalizeStringArray(roleCore.required_skills, 12).length > 0
          ? normalizeStringArray(roleCore.required_skills, 12)
          : fallbackRequired,
      nice_to_have_skills:
        normalizeStringArray(roleCore.nice_to_have_skills, 12).length > 0
          ? normalizeStringArray(roleCore.nice_to_have_skills, 12)
          : fallbackNiceToHave,
    },
    work_model: normalizeEnumValue(
      item.work_model,
      ["onsite", "hybrid", "remote", "unknown"] as const,
      "unknown",
    ),
    location_scope:
      normalizeNullableString(item.location_scope) ||
      normalizeNullableString(fallbackParsed.location),
    location_flexibility: normalizeEnumValue(
      item.location_flexibility,
      ["strict", "moderate", "flexible"] as const,
      "moderate",
    ),
    relocation_allowed: normalizeEnumValue(
      item.relocation_allowed,
      ["yes", "no", "unknown"] as const,
      "unknown",
    ),
    must_have_constraints: normalizeStringArray(item.must_have_constraints, 10),
    soft_constraints: normalizeStringArray(item.soft_constraints, 10),
    company_stage_expectation: normalizeEnumValue(
      item.company_stage_expectation,
      ["startup", "growth", "enterprise", "unknown"] as const,
      "unknown",
    ),
    screening_intent: normalizeNullableString(item.screening_intent),
    candidate_count_strategy: normalizeEnumValue(
      item.candidate_count_strategy,
      ["focused_shortlist", "broader_shortlist"] as const,
      "focused_shortlist",
    ),
    constraint_reasoning: normalizeNullableString(item.constraint_reasoning),
  };
}

function buildPromptSearchContext(parsed: Record<string, unknown>) {
  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const lines = [
    `Title: ${normalizeNullableString(parsed.title) || "N/A"}`,
  ];

  if (hiringBrief.role_core.seniority) {
    lines.push(`Seniority: ${hiringBrief.role_core.seniority}`);
  }
  if (hiringBrief.work_model && hiringBrief.work_model !== "unknown") {
    lines.push(`Work Model: ${hiringBrief.work_model}`);
  }
  if (hiringBrief.location_scope) {
    lines.push(`Target Location: ${hiringBrief.location_scope}`);
  }
  lines.push(
    `Location Flexibility: ${hiringBrief.location_flexibility} | Relocation Allowed: ${hiringBrief.relocation_allowed}`,
  );
  if (hiringBrief.company_stage_expectation !== "unknown") {
    lines.push(`Hiring Company Stage: ${hiringBrief.company_stage_expectation}`);
  }
  if (hiringBrief.role_core.required_skills.length > 0) {
    lines.push(`Must-Have Skills: ${hiringBrief.role_core.required_skills.slice(0, 10).join(", ")}`);
  }
  if (hiringBrief.must_have_constraints.length > 0) {
    lines.push(`Must-Have Constraints: ${hiringBrief.must_have_constraints.slice(0, 6).join(" | ")}`);
  }

  const recallSpec = normalizeRecallSpec(parsed.recall_spec, Number(parsed.candidate_count) || 5);
  if (recallSpec.title_variants.length > 0) {
    lines.push(`Title Variants: ${recallSpec.title_variants.join(" || ")}`);
  }
  if (recallSpec.core_skill_terms.length > 0) {
    lines.push(`Core Skills: ${recallSpec.core_skill_terms.join(", ")}`);
  }
  if (recallSpec.must_have_signals.length > 0) {
    lines.push(`Must-Have Signals: ${recallSpec.must_have_signals.join(" | ")}`);
  }
  if (recallSpec.avoid_profiles.length > 0) {
    lines.push(`Avoid Profiles: ${recallSpec.avoid_profiles.join(" | ")}`);
  }
  if (recallSpec.strict_location_terms.length > 0) {
    lines.push(`Strict Location Terms: ${recallSpec.strict_location_terms.join(", ")}`);
  }
  if (recallSpec.nearby_location_terms.length > 0) {
    lines.push(`Nearby Location Terms: ${recallSpec.nearby_location_terms.join(", ")}`);
  }
  if (recallSpec.geo_strategy) {
    lines.push(`Geo Strategy: ${recallSpec.geo_strategy}`);
  }
  if (recallSpec.countries.length > 0) {
    lines.push(`Countries: ${recallSpec.countries.join(", ")}`);
  }

  return lines.join("\n");
}

function sanitizeConstraintVerdicts(value: unknown): ConstraintVerdict {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    location_fit: normalizeEnumValue(
      item.location_fit,
      ["local", "nearby", "non_local", "unknown"] as const,
      "unknown",
    ),
    work_model_fit: normalizeEnumValue(
      item.work_model_fit,
      ["yes", "no", "unclear"] as const,
      "unclear",
    ),
    must_have_coverage: normalizeEnumValue(
      item.must_have_coverage,
      ["strong", "partial", "weak", "unknown"] as const,
      "unknown",
    ),
  };
}

function sanitizeCompanyProfile(value: unknown): CompanyProfile | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const profile: CompanyProfile = {
    size: normalizeNullableString(item.size),
    mission: normalizeNullableString(item.mission),
    benefits: normalizeNullableString(item.benefits),
    tech_stack: normalizeNullableString(item.tech_stack),
    selling_points: normalizeNullableString(item.selling_points),
  };
  const hasAnyValue = Object.values(profile).some(Boolean);
  return hasAnyValue ? profile : null;
}

function appendCompanyProfileContextLines(
  lines: string[],
  title: string,
  profile: CompanyProfile | null,
) {
  if (!profile) return;
  lines.push(title);
  if (profile.size) lines.push(`- Size: ${profile.size}`);
  if (profile.mission) lines.push(`- Mission: ${profile.mission}`);
  if (profile.tech_stack) lines.push(`- Tech stack: ${profile.tech_stack}`);
  if (profile.benefits) lines.push(`- Benefits: ${profile.benefits}`);
  if (profile.selling_points) lines.push(`- Why join: ${profile.selling_points}`);
}

function buildCompanyProfileContext(parsed: Record<string, unknown>) {
  const globalCompanyProfile = sanitizeCompanyProfile(parsed.company_profile);
  const jdCompanyProfile = sanitizeCompanyProfile(parsed.jd_company_profile);

  if (!globalCompanyProfile && !jdCompanyProfile) {
    return "Company context: Not provided. Infer join likelihood from JD scope, role level, work model, and public candidate signals only.";
  }

  const lines = ["Company Profile Context:"];
  appendCompanyProfileContextLines(
    lines,
    "Workspace Global Profile (supplemental):",
    globalCompanyProfile,
  );
  appendCompanyProfileContextLines(
    lines,
    "JD Company Website Profile (prefer this when conflict exists):",
    jdCompanyProfile,
  );
  return lines.join("\n");
}

function stripSpeculativeRelocation(texts: string[]) {
  return texts.filter((text) => {
    const normalized = text.toLowerCase();
    return !(
      normalized.includes("relocat") ||
      normalized.includes("move to") ||
      normalized.includes("willing to move") ||
      normalized.includes("willingness to move")
    );
  });
}

function normalizeBlockingSeverity(value: unknown): BlockingSeverity {
  return normalizeEnumValue(
    value,
    ["hard", "soft", "none"] as const,
    "none",
  );
}

function normalizeAdvanceRecommendation(value: unknown): AdvanceRecommendation {
  return normalizeEnumValue(
    value,
    ["advance", "hold", "reject"] as const,
    "hold",
  );
}

function normalizeBlockingConstraints(value: unknown) {
  return normalizeStringArray(value, 8);
}

const UNCERTAIN_BLOCKING_TERMS = [
  "unknown",
  "unverifiable",
  "unverified",
  "unclear",
  "not enough",
  "insufficient",
  "sparse",
  "no evidence",
  "cannot confirm",
  "can't confirm",
];

function isUncertainBlockingConstraint(text: string) {
  const normalized = text.toLowerCase();
  return UNCERTAIN_BLOCKING_TERMS.some((term) => normalized.includes(term));
}

function calibrateBlockingSeverity(
  blockingSeverity: BlockingSeverity,
  blockingConstraints: string[],
  constraintVerdicts: ConstraintVerdict,
) {
  if (blockingSeverity !== "hard") return blockingSeverity;

  // Keep hard only when there is explicit incompatibility.
  const explicitHardConflict =
    constraintVerdicts.location_fit === "non_local" ||
    constraintVerdicts.work_model_fit === "no";
  if (explicitHardConflict) return "hard";

  const allConstraintsUncertain =
    blockingConstraints.length === 0 ||
    blockingConstraints.every(isUncertainBlockingConstraint);

  if (
    allConstraintsUncertain ||
    constraintVerdicts.location_fit === "unknown" ||
    constraintVerdicts.work_model_fit === "unclear"
  ) {
    return "soft";
  }

  return blockingSeverity;
}

function computeQualityScore(
  capabilityScore: number,
  relevanceScore: number,
) {
  return Math.round((capabilityScore + relevanceScore) / 2);
}

function computeAdvanceScore(
  capabilityScore: number,
  relevanceScore: number,
  joinLikelihoodScore: number,
  blockingSeverity: BlockingSeverity,
) {
  const baseScore = Math.round(
    capabilityScore * 0.3 + relevanceScore * 0.4 + joinLikelihoodScore * 0.3,
  );
  const penalty = blockingSeverity === "hard" ? 35 : blockingSeverity === "soft" ? 12 : 0;
  return Math.max(0, Math.min(100, baseScore - penalty));
}

function deriveAdvanceRecommendation(
  advanceScore: number,
  blockingSeverity: BlockingSeverity,
) {
  if (blockingSeverity === "hard") return "reject";
  if (advanceScore >= 72 && blockingSeverity === "none") return "advance";
  if (advanceScore >= 45) return "hold";
  return "reject";
}

function deriveFitDecisionFromScore(score: number): CandidateSuitability["fit_decision"] {
  if (score >= 85) return "strong_fit";
  if (score >= 65) return "viable_fit";
  if (score >= 40) return "risky_fit";
  return "reject";
}

function deriveActionabilityFromScores(
  qualityScore: number,
  advanceRecommendation: AdvanceRecommendation,
): CandidateSuitability["actionability"] {
  if (advanceRecommendation === "advance") return "ready_to_act";
  if (qualityScore >= 60 && advanceRecommendation === "hold") return "needs_review";
  return "not_actionable";
}

function deriveFirstContactConfidence(
  qualityScore: number,
  advanceRecommendation: AdvanceRecommendation,
  evidenceQuality: CandidateSuitability["evidence_quality"],
  constraintVerdicts: ConstraintVerdict,
) {
  if (
    qualityScore >= 76 &&
    advanceRecommendation !== "reject" &&
    evidenceQuality !== "low" &&
    constraintVerdicts.location_fit !== "non_local" &&
    constraintVerdicts.must_have_coverage !== "weak"
  ) {
    return "high" as const;
  }
  if (
    qualityScore >= 60 &&
    advanceRecommendation !== "reject" &&
    constraintVerdicts.must_have_coverage !== "weak"
  ) {
    return "medium" as const;
  }
  return "low" as const;
}

function computeSubscriptionTriggerScore(
  qualityScore: number,
  advanceScore: number,
  joinLikelihoodScore: number,
  evidenceQuality: CandidateSuitability["evidence_quality"],
  constraintVerdicts: ConstraintVerdict,
) {
  const locationBonus =
    constraintVerdicts.location_fit === "local"
      ? 10
      : constraintVerdicts.location_fit === "nearby"
        ? 6
        : constraintVerdicts.location_fit === "unknown"
          ? -4
          : -12;
  const mustHaveBonus =
    constraintVerdicts.must_have_coverage === "strong"
      ? 10
      : constraintVerdicts.must_have_coverage === "partial"
        ? 4
        : constraintVerdicts.must_have_coverage === "weak"
          ? -10
          : -3;
  const evidenceBonus =
    evidenceQuality === "high" ? 5 : evidenceQuality === "medium" ? 0 : -6;
  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        qualityScore * 0.35 +
          advanceScore * 0.25 +
          joinLikelihoodScore * 0.25 +
          locationBonus +
          mustHaveBonus +
          evidenceBonus,
      ),
    ),
  );
}

function deriveSuitabilityBucket(
  params: {
    qualityScore: number;
    overallScore: number;
    advanceRecommendation: AdvanceRecommendation;
    blockingSeverity: BlockingSeverity;
    constraintVerdicts: ConstraintVerdict;
    strictLocalRole: boolean;
    minVisibleQualityScore: number;
  },
): CandidateSuitability["bucket"] {
  if (params.blockingSeverity === "hard") return "do_not_show";
  if (params.advanceRecommendation === "reject") return "do_not_show";
  if (params.overallScore < params.minVisibleQualityScore) return "do_not_show";
  if (params.constraintVerdicts.must_have_coverage === "weak") return "do_not_show";
  if (
    params.strictLocalRole &&
    !["local", "nearby"].includes(params.constraintVerdicts.location_fit)
  ) {
    return "do_not_show";
  }
  if (
    params.overallScore >= Math.max(params.minVisibleQualityScore, 72) &&
    params.qualityScore >= Math.max(params.minVisibleQualityScore, 65) &&
    ["strong", "partial"].includes(params.constraintVerdicts.must_have_coverage) &&
    (!params.strictLocalRole ||
      ["local", "nearby"].includes(params.constraintVerdicts.location_fit))
  ) {
    return "strong_now";
  }
  return "consider_next";
}

function deriveShortlistDecision(
  advanceRecommendation: AdvanceRecommendation,
  blockingSeverity: BlockingSeverity,
): ShortlistDecision {
  if (blockingSeverity === "hard") return "no";
  return advanceRecommendation === "reject" ? "no" : "yes";
}

function sanitizeCandidateSuitability(value: unknown): CandidateSuitability | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const capabilityScore = normalizeScore(item.capability_score);
  const relevanceScore =
    item.relevance_score != null ? normalizeScore(item.relevance_score) : normalizeScore(item.match_score);
  const joinLikelihoodScore = normalizeScore(item.join_likelihood_score);
  const hasTriScores =
    item.capability_score != null ||
    item.relevance_score != null ||
    item.join_likelihood_score != null;
  const qualityScore = hasTriScores
    ? (
      item.quality_score != null
        ? normalizeScore(item.quality_score)
        : computeQualityScore(capabilityScore, relevanceScore)
    )
    : normalizeScore(item.match_score);
  const rawBlockingSeverity = normalizeBlockingSeverity(item.blocking_severity);
  const constraintVerdicts = sanitizeConstraintVerdicts(item.constraint_verdicts);
  const blockingConstraints = normalizeBlockingConstraints(
    item.blocking_constraints ?? item.constraint_risks ?? item.risk_flags,
  );
  const blockingSeverity = calibrateBlockingSeverity(
    rawBlockingSeverity,
    blockingConstraints,
    constraintVerdicts,
  );
  const useProvidedAdvanceScore =
    item.advance_score != null && blockingSeverity === rawBlockingSeverity;
  const advanceScore = useProvidedAdvanceScore
    ? normalizeScore(item.advance_score)
    : computeAdvanceScore(
        capabilityScore,
        relevanceScore,
        joinLikelihoodScore,
        blockingSeverity,
      );
  const useProvidedAdvanceRecommendation =
    item.advance_recommendation != null && blockingSeverity === rawBlockingSeverity;
  const advanceRecommendation = normalizeAdvanceRecommendation(
    useProvidedAdvanceRecommendation
      ? item.advance_recommendation
      : deriveAdvanceRecommendation(advanceScore, blockingSeverity),
  );
  const fitDecision = deriveFitDecisionFromScore(qualityScore);
  let actionability = deriveActionabilityFromScores(qualityScore, advanceRecommendation);
  if (!hasTriScores && item.actionability != null) {
    actionability = normalizeEnumValue(
      item.actionability,
      ["ready_to_act", "needs_review", "not_actionable"] as const,
      actionability,
    );
  }
  const evidenceQuality = normalizeEnumValue(
    item.evidence_quality,
    ["high", "medium", "low"] as const,
    "medium",
  );
  const firstContactConfidence = normalizeEnumValue(
    item.first_contact_confidence,
    ["high", "medium", "low"] as const,
    deriveFirstContactConfidence(
      qualityScore,
      advanceRecommendation,
      evidenceQuality,
      constraintVerdicts,
    ),
  );
  const subscriptionTriggerScore =
    item.subscription_trigger_score != null
      ? normalizeScore(item.subscription_trigger_score)
      : computeSubscriptionTriggerScore(
          qualityScore,
          advanceScore,
          joinLikelihoodScore,
          evidenceQuality,
          constraintVerdicts,
        );
  const bucket = normalizeEnumValue(
    item.bucket,
    ["strong_now", "consider_next", "do_not_show"] as const,
    deriveSuitabilityBucket({
      qualityScore,
      overallScore: advanceScore,
      advanceRecommendation,
      blockingSeverity,
      constraintVerdicts,
      strictLocalRole: false,
      minVisibleQualityScore: 60,
    }),
  );
  const shortlistDecision = normalizeEnumValue(
    item.shortlist_decision,
    ["yes", "no"] as const,
    deriveShortlistDecision(advanceRecommendation, blockingSeverity),
  );
  const shortlistReason =
    normalizeNullableString(item.shortlist_reason) ||
    normalizeNullableString(item.primary_risk) ||
    normalizeStringArray(item.short_reasons ?? item.why_this_candidate, 1)[0] ||
    null;

  return {
    fit_decision: fitDecision,
    actionability,
    bucket,
    match_score: advanceScore,
    quality_score: qualityScore,
    overall_score: advanceScore,
    advance_score: advanceScore,
    advance_recommendation: advanceRecommendation,
    primary_risk:
      normalizeNullableString(item.primary_risk) ||
      normalizeStringArray(item.risk_flags ?? item.constraint_risks, 1)[0] ||
      normalizeBlockingConstraints(item.blocking_constraints)[0] ||
      null,
    first_contact_confidence: firstContactConfidence,
    subscription_trigger_score: subscriptionTriggerScore,
    shortlist_decision: shortlistDecision,
    shortlist_reason: shortlistReason,
    blocking_constraints: blockingConstraints,
    blocking_severity: blockingSeverity,
    scoring_breakdown: {
      capability_score: capabilityScore,
      relevance_score: relevanceScore,
      join_likelihood_score: joinLikelihoodScore,
      join_likelihood_reasons: stripSpeculativeRelocation(
        normalizeStringArray(item.join_likelihood_reasons, 6),
      ),
      quality_score: qualityScore,
      overall_score: advanceScore,
      advance_score: advanceScore,
    },
    constraint_verdicts: constraintVerdicts,
    constraint_risks: stripSpeculativeRelocation(
      normalizeStringArray(item.constraint_risks ?? item.risk_flags, 6),
    ),
    risk_flags: stripSpeculativeRelocation(normalizeStringArray(item.risk_flags, 6)),
    why_this_candidate: stripSpeculativeRelocation(
      normalizeStringArray(item.why_this_candidate, 6),
    ),
    why_not_higher: stripSpeculativeRelocation(normalizeStringArray(item.why_not_higher, 6)),
    evidence_quality: evidenceQuality,
  };
}

function sortCandidateAssessments(left: ScoredCandidateAssessment, right: ScoredCandidateAssessment) {
  const evidenceRank: Record<CandidateSuitability["evidence_quality"], number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return (
    right.suitability.subscription_trigger_score - left.suitability.subscription_trigger_score ||
    right.suitability.quality_score - left.suitability.quality_score ||
    right.suitability.advance_score - left.suitability.advance_score ||
    right.suitability.scoring_breakdown.relevance_score - left.suitability.scoring_breakdown.relevance_score ||
    right.suitability.scoring_breakdown.capability_score - left.suitability.scoring_breakdown.capability_score ||
    evidenceRank[left.suitability.evidence_quality] - evidenceRank[right.suitability.evidence_quality]
  );
}

function shouldDisplayCandidate(assessment: ScoredCandidateAssessment) {
  const suitability = assessment.suitability;
  const breakdown = suitability.scoring_breakdown;

  return (
    suitability.shortlist_decision === "yes" &&
    suitability.blocking_severity !== "hard" &&
    suitability.constraint_verdicts.location_fit !== "non_local" &&
    suitability.match_score >= SHORTLIST_MATCH_SCORE_MIN &&
    breakdown.relevance_score >= SHORTLIST_RELEVANCE_MIN &&
    breakdown.capability_score >= SHORTLIST_CAPABILITY_MIN &&
    breakdown.join_likelihood_score >= SHORTLIST_JOIN_LIKELIHOOD_MIN
  );
}

function getDisplayTierForAssessment(
  assessment: ScoredCandidateAssessment,
): CandidateDisplayTier | null {
  switch (assessment.suitability.bucket) {
    case "strong_now":
      return "priority_outreach";
    case "consider_next":
      return "worth_reviewing";
    default:
      return null;
  }
}

function deriveExcludedReason(assessment: ScoredCandidateAssessment): ExcludedReason {
  const { suitability } = assessment;
  const verdicts = suitability.constraint_verdicts;
  const normalizedRiskText = [
    suitability.primary_risk,
    ...suitability.blocking_constraints,
    ...suitability.constraint_risks,
    ...suitability.risk_flags,
    ...suitability.why_not_higher,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean);

  if (
    verdicts.location_fit === "non_local" ||
    verdicts.work_model_fit === "no"
  ) {
    return "location_or_work_model";
  }

  if (
    verdicts.must_have_coverage === "weak" ||
    normalizedRiskText.some((value) =>
      [
        "must-have",
        "must have",
        "tech stack",
        "stack gap",
        "backend-heavy",
        "backend focus",
        ".net",
        "c#",
        "mongodb",
        "kubernetes",
        "asp.net",
      ].some((term) => value.includes(term))
    )
  ) {
    return "stack_gap";
  }

  if (
    normalizedRiskText.some((value) =>
      [
        "title",
        "seniority",
        "full-stack",
        "frontend",
        "manager",
        "leadership",
        "function",
        "scope mismatch",
      ].some((term) => value.includes(term))
    )
  ) {
    return "title_or_seniority_mismatch";
  }

  if (
    suitability.evidence_quality === "low" &&
    suitability.why_this_candidate.length === 0
  ) {
    return "evidence_too_weak";
  }

  if (suitability.scoring_breakdown.join_likelihood_score < 55) {
    return "response_risk";
  }

  if (suitability.evidence_quality === "low") {
    return "evidence_too_weak";
  }

  return "multiple_risks";
}

function buildExcludedReasonCounts(
  assessments: ScoredCandidateAssessment[],
): ExcludedReasonCount[] {
  const counts = new Map<ExcludedReason, number>();

  for (const assessment of assessments) {
    const reason = deriveExcludedReason(assessment);
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);
}

function getAIModel() {
  return (
    process.env.AI_MODEL ||
    process.env.SEARCH_JUDGE_MODEL ||
    process.env.DEEPSEEK_MODEL ||
    "deepseek/deepseek-chat-v3.1"
  );
}

function getJudgeModel() {
  return (
    process.env.SEARCH_JUDGE_MODEL ||
    process.env.OPENROUTER_JUDGE_MODEL ||
    process.env.AI_MODEL ||
    process.env.DEEPSEEK_JUDGE_MODEL ||
    process.env.DEEPSEEK_MODEL ||
    "deepseek/deepseek-chat-v3.1"
  );
}

function getArbiterModel() {
  return (
    process.env.SEARCH_ARBITER_MODEL ||
    process.env.OPENROUTER_ARBITER_MODEL ||
    process.env.DEEPSEEK_ARBITER_MODEL ||
    getJudgeModel()
  );
}

function getLightModel() {
  return (
    process.env.SEARCH_LIGHT_MODEL ||
    process.env.OPENROUTER_LIGHT_MODEL ||
    process.env.DEEPSEEK_LIGHT_MODEL ||
    process.env.AI_MODEL ||
    process.env.DEEPSEEK_MODEL ||
    "deepseek/deepseek-chat-v3-0324"
  );
}


async function generateOutreachDraftsForRows(
  context: PipelineContext,
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  rows: CandidateRowInput[],
) {
  if (rows.length === 0) return rows;

  const draftedRows = await Promise.all(
    rows.map(async (row) => {
      const normalizedRow = normalizeCandidateRowInput(row);
      if (normalizedRow.outreach_draft) return normalizedRow;
      const githubSignals =
        normalizedRow.metadata.github_signals && typeof normalizedRow.metadata.github_signals === "object"
          ? normalizedRow.metadata.github_signals
          : null;
      const evidence = buildRecruiterOutreachEvidence({
        name: normalizedRow.name,
        headline: normalizedRow.headline,
        location: normalizedRow.location,
        skills: normalizedRow.skills,
        matchReasons: normalizedRow.match_reasons,
        githubSignals,
      });
      const firstName = normalizedRow.name.split(/\s+/).filter(Boolean)[0] || "there";

      if (evidence.evidenceSource === "linkedin" && evidence.proofConfidence === "weak") {
        return {
          ...normalizedRow,
          outreach_draft: JSON.stringify(
            buildDeterministicWeakEvidenceOutreachDraft({
              firstName,
              roleTitle: normalizeNullableString(parsed.title) || "open role",
              evidence,
              hasEmail: true,
            }),
          ),
        };
      }

      try {
        const { data: parsedDraft } = await withTimeout(
          (signal) => generateOpenRouterJson<{
            subject?: string;
            linkedin?: string;
            email?: string;
          }>({
            model: getLightModel(),
            prompt: buildRecruiterOutreachPrompt({
              roleTitle: normalizeNullableString(parsed.title) || "this role",
              jdText: context.jdText,
              candidate: {
                name: normalizedRow.name,
                headline: normalizedRow.headline,
                location: normalizedRow.location,
                skills: normalizedRow.skills,
                matchReasons: normalizedRow.match_reasons,
                githubSignals,
              },
            }),
            maxOutputTokens: runtime.outreachMaxOutputTokens,
            abortSignal: signal,
            timeoutMs: 60000,
            temperature: 0,
            jsonSchema: buildOutreachDraftJsonSchema(),
          }),
          60000,
          `Outreach draft for ${normalizedRow.name}`,
        );
        return {
          ...normalizedRow,
          outreach_draft: JSON.stringify({
            subject: normalizeNullableString(parsedDraft.subject) || `${normalizeNullableString(parsed.title) || "Opportunity"} opportunity`,
            linkedin:
              normalizeNullableString(parsedDraft.linkedin) ||
              `Hi ${normalizedRow.name.split(/\s+/)[0] || "there"}, I came across your background and thought it looked highly relevant to our ${normalizeNullableString(parsed.title) || "open role"}. Would you be open to a quick chat?`,
            email:
              normalizeNullableString(parsedDraft.email) ||
              `Hi ${normalizedRow.name.split(/\s+/)[0] || "there"}, I came across your background and thought it looked highly relevant to our ${normalizeNullableString(parsed.title) || "open role"}. Would you be open to a quick chat?\n\nBest regards`,
          }),
        };
      } catch (error) {
        logSearchEvent("search_outreach_draft_fallback", {
          search_id: context.searchId,
          candidate: normalizedRow.name,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          ...normalizedRow,
          outreach_draft: JSON.stringify(
            buildFallbackOutreachDraft({
              firstName,
              roleTitle: normalizeNullableString(parsed.title) || "open role",
              evidence,
              hasEmail: true,
            }),
          ),
        };
      }
    }),
  );

  return draftedRows;
}

export async function reclaimStaleRunningJobs() {
  return reclaimStaleRunningJobsInternal({ failSearch });
}


async function updateSearchDisplayStat(
  searchId: string,
  parsed: Record<string, unknown>,
  key: string,
  value: number,
) {
  const reqs = parsed as Record<string, unknown>;
  const stats = (reqs.display_stats && typeof reqs.display_stats === "object"
    ? reqs.display_stats
    : {}) as Record<string, unknown>;
  stats[key] = value;
  reqs.display_stats = stats;
  await updateSearchParsedRequirements(searchId, reqs);
}

async function updateSearchDisplayStats(
  searchId: string,
  parsed: Record<string, unknown>,
  patch: Partial<SearchDisplayStats>,
) {
  const reqs = parsed as Record<string, unknown>;
  const currentStats = normalizeSearchDisplayStats(reqs.display_stats) ?? buildSearchDisplayStats({});
  reqs.display_stats = buildSearchDisplayStats({
    ...currentStats,
    ...patch,
  });
  await updateSearchParsedRequirements(searchId, reqs);
}

function getSearchStartedAt(parsed: Record<string, unknown>, context: PipelineContext) {
  return normalizeNullableString(parsed.search_started_at) || context.createdAt;
}

function elapsedSince(startedAt: string | null | undefined, endAt: string) {
  const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const endAtMs = Date.parse(endAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endAtMs)) return undefined;
  return Math.max(0, Math.round(endAtMs - startedAtMs));
}

async function markSearchReviewable(
  context: PipelineContext,
  parsed: Record<string, unknown>,
  patch: Partial<SearchDisplayStats>,
) {
  const firstVisibleAt = nowIso();
  const startedAt = getSearchStartedAt(parsed, context);
  const reqs = parsed as Record<string, unknown>;
  const currentStats = normalizeSearchDisplayStats(reqs.display_stats) ?? buildSearchDisplayStats({});
  if (!reqs.partial_ready_at) {
    reqs.partial_ready_at = firstVisibleAt;
  }
  reqs.display_stats = buildSearchDisplayStats({
    ...currentStats,
    ...patch,
    first_shortlist_candidate_at:
      currentStats.first_shortlist_candidate_at ?? firstVisibleAt,
    reviewable_at: currentStats.reviewable_at ?? firstVisibleAt,
    time_to_first_shortlist_candidate_ms:
      currentStats.time_to_first_shortlist_candidate_ms ??
      elapsedSince(startedAt, firstVisibleAt),
    time_to_reviewable_ms:
      currentStats.time_to_reviewable_ms ?? elapsedSince(startedAt, firstVisibleAt),
  });
  await setSearchStatus(context.searchId, "deep_scoring", {
    partial_ready_at: reqs.partial_ready_at,
    parsed_requirements: reqs,
    error_message: null,
    warning_message: null,
  });
  void queueOrSendSearchNotification(context.searchId, "first_shortlist_ready").catch((error) => {
    console.error("[search_notifications] Failed to queue first shortlist notification:", error);
  });
}


async function parseJobDescription(
  context: PipelineContext,
  existingParsed?: Record<string, unknown> | null,
) {
  await setSearchStatus(context.searchId, "parsing");
  logSearchEvent("search_step_started", {
    search_id: context.searchId,
    step: "parsing",
    job_id: context.jobId,
  });

  let parsed: Record<string, unknown> | null = null;
  let lastParseError: string | null = null;
  let estimatedParseCost = 0;
  const userClarification = normalizeNullableString(existingParsed?.user_clarification);
  const parseInput = buildSearchIntentInput(context.jdText, userClarification);

  for (let attempt = 1; attempt <= PARSE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const { text, data: candidate } = await withTimeout(
        (signal) => generateOpenRouterJson<Record<string, unknown>>({
          model: getAIModel(),
          system: JD_SEARCH_INTENT_PROMPT,
          prompt: parseInput,
          maxOutputTokens: PARSE_MAX_OUTPUT_TOKENS,
          abortSignal: signal,
          timeoutMs: 60000,
          temperature: 0,
          jsonSchema: JD_SEARCH_INTENT_JSON_SCHEMA,
        }),
        60000,
        "Search intent generation",
      );
      estimatedParseCost += estimateSearchIntentCost(parseInput, text);
      if (isWeakParsedIntent(candidate, context.candidateCount)) {
        lastParseError = "weak_parsed_intent";
        logSearchEvent("search_parse_retry", {
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
      logSearchEvent("search_parse_retry", {
        search_id: context.searchId,
        attempt,
        reason: lastParseError,
        job_id: context.jobId,
      });
      if (attempt >= PARSE_MAX_ATTEMPTS) break;
    }
  }

  if (!parsed) {
      parsed = {
        title: "Untitled Role",
        hiring_brief: {
        work_model: "unknown",
        location_scope: null,
        location_flexibility: "moderate",
        relocation_allowed: "unknown",
      },
      recall_spec: {
        countries: inferCountriesFromJdText(parseInput),
        title_variants: [],
        core_skill_terms: deriveCoreSkillsFromJdText(parseInput, 12),
        must_have_signals: deriveCoreSkillsFromJdText(parseInput, 8),
        avoid_profiles: [],
        strict_location_terms: [],
        nearby_location_terms: [],
        geo_strategy: null,
        recall_confidence: "low",
        role_breadth: "balanced",
        record_limit: BRIGHTDATA_STANDARD_LIMIT,
      },
    };
  }

  parsed.title =
    normalizeNullableString(parsed.title) ||
    "Untitled Role";
  if (userClarification) {
    parsed.user_clarification = userClarification;
  }
  parsed.parse_origin = "pipeline_llm";
  parsed.hiring_brief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  parsed.candidate_count = context.candidateCount;
  parsed.display_count =
    Number(existingParsed?.display_count) || context.candidateCount;
  parsed.highlight_count =
    Number(existingParsed?.highlight_count) || context.highlightCount;
  parsed.outreach_pool_target =
    Number(existingParsed?.outreach_pool_target) || context.outreachPoolTarget;
  parsed.plan_code = normalizeSearchPlanCode(existingParsed?.plan_code);
  parsed.activation_run = isActivationRun(existingParsed);

  try {
    const { data: settings } = await supabaseAdmin
      .from("hirelix_user_settings")
      .select("company_profile")
      .eq("user_id", context.userId)
      .single();
    const companyProfile = sanitizeCompanyProfile(settings?.company_profile);
    if (companyProfile) {
      parsed.company_profile = companyProfile;
    } else if (existingParsed?.company_profile) {
      parsed.company_profile = sanitizeCompanyProfile(existingParsed.company_profile);
    }
  } catch {
    if (existingParsed?.company_profile) {
      parsed.company_profile = sanitizeCompanyProfile(existingParsed.company_profile);
    }
  }

  const existingJdCompanyProfile = sanitizeCompanyProfile(existingParsed?.jd_company_profile);
  const existingJdCompanyWebsite = normalizeNullableString(existingParsed?.jd_company_website);
  if (existingJdCompanyProfile) {
    parsed.jd_company_profile = existingJdCompanyProfile;
  }
  if (existingJdCompanyWebsite) {
    parsed.jd_company_website = existingJdCompanyWebsite;
  }

  parsed.recall_provider = "brightdata_dataset";
  parsed.recall_spec = enrichRecallSpecFromJd(parsed, context.jdText, context.candidateCount);
  parsed.estimated_parse_llm_cost = roundCurrency(
    estimatedParseCost || estimateSearchIntentCost(parseInput),
  );
  const existingRecallMetadata = normalizeRecallMetadata(existingParsed?.recall_metadata);
  if (existingRecallMetadata?.provider === "brightdata_dataset") {
    parsed.recall_metadata = existingRecallMetadata;
  }
  const parseCompletedAt = nowIso();
  const startedAt = getSearchStartedAt(parsed, context);
  const currentStats = normalizeSearchDisplayStats(parsed.display_stats) ?? buildSearchDisplayStats({});
  parsed.display_stats = buildSearchDisplayStats({
    ...currentStats,
    brief_ready_at: parseCompletedAt,
    time_to_ack_ms: currentStats.time_to_ack_ms ?? 0,
    time_to_brief_ready_ms:
      currentStats.time_to_brief_ready_ms ?? elapsedSince(startedAt, parseCompletedAt),
  });
  await supabaseAdmin
    .from("hirelix_searches")
    .update({
      title: parsed.title || "Untitled Role",
      parsed_requirements: parsed,
      parse_completed_at: parseCompletedAt,
      updated_at: nowIso(),
    })
    .eq("id", context.searchId);

  logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "parsing",
    brief_ready_at: parseCompletedAt,
    time_to_brief_ready_ms:
      (parsed.display_stats as SearchDisplayStats | undefined)?.time_to_brief_ready_ms ?? null,
    job_id: context.jobId,
  });
  logSearchEvent("search_brief_ready", {
    search_id: context.searchId,
    brief_ready_at: parseCompletedAt,
    job_id: context.jobId,
  });

  return parsed;
}

async function buildBrightDataDatasetCandidates(
  context: PipelineContext,
  parsed: Record<string, unknown>,
  executionProfile: SearchExecutionProfile,
): Promise<SearchPipelineResult | null> {
  const brightDataToken = process.env.BRIGHTDATA_API_TOKEN;
  const runtime = getExecutionRuntime(executionProfile);
  const recallSpec = normalizeRecallSpec(parsed.recall_spec, context.candidateCount, {
    recordLimitOverride: executionProfile.filterLimit,
  });
  const primaryRecallRequest = buildBrightDataRecallFilter(
    parsed,
    context.candidateCount,
    executionProfile,
    {
      normalizeRecallSpec,
      sanitizeHiringBrief,
      buildStandardSkillFilter,
      buildRecallLocationFilter,
      isPlaceholderTitle,
    },
  );
  if (!brightDataToken || !primaryRecallRequest) {
    return null;
  }
  const relaxedRecallRequest = buildBrightDataRecallFilter(
    parsed,
    context.candidateCount,
    executionProfile,
    {
      normalizeRecallSpec,
      sanitizeHiringBrief,
      buildStandardSkillFilter,
      buildRecallLocationFilter,
      isPlaceholderTitle,
      mode: "relaxed",
    },
  );
  let recallRequest = primaryRecallRequest;
  const pipelineStartMs = Date.now();

  await setSearchStatus(
    context.searchId,
    "searching",
  );
  const existingRecallMetadata = normalizeRecallMetadata(parsed.recall_metadata);
  let snapshotId = existingRecallMetadata?.snapshot_id ?? null;
  let requestedAt = existingRecallMetadata?.requested_at
    ? Date.parse(existingRecallMetadata.requested_at)
    : Number.NaN;
  const recallRounds = buildBrightDataRecallFilters(
    parsed,
    context.candidateCount,
    executionProfile,
    {
      normalizeRecallSpec,
      sanitizeHiringBrief,
      buildStandardSkillFilter,
      buildRecallLocationFilter,
      isPlaceholderTitle,
      hiddenGemLimit: BRIGHTDATA_HIDDEN_GEM_LIMIT,
      companyTargetLimit: BRIGHTDATA_COMPANY_TARGET_LIMIT,
    },
  );
  const additionalRounds = recallRounds.filter((round) => round.round !== "standard");
  const persistedAdditionalSnapshots = new Map(
    (existingRecallMetadata?.additional_snapshots ?? []).map((snapshot) => [snapshot.round, snapshot]),
  );
  let additionalSnapshotRefs: Array<{
    round: string;
    snapshotId: string;
    request: BrightDataDatasetFilterRequest;
    recordsLimit: number;
    submittedAt?: string;
  }> = [];

  const filterSummary = {
    title_terms: recallSpec.title_variants.length > 0
      ? recallSpec.title_variants
      : [normalizeNullableString(parsed.title)].filter((value): value is string => Boolean(value)),
    country_codes: recallSpec.countries
      .map((country) => normalizeCountryCode(country))
      .filter((country): country is string => Boolean(country))
      .slice(0, 4),
    location_terms: recallSpec.location_terms
      .map((term) => normalizeText(term))
      .filter((term) => term.length >= 3)
      .slice(0, 16),
    strict_location_terms: recallSpec.strict_location_terms
      .map((term) => normalizeText(term))
      .filter((term) => term.length >= 3)
      .slice(0, 16),
    nearby_location_terms: recallSpec.nearby_location_terms
      .map((term) => normalizeText(term))
      .filter((term) => term.length >= 3)
      .slice(0, 10),
    must_have_signals: recallSpec.must_have_signals
      .map((term) => normalizeText(term))
      .filter((term) => term.length >= 3)
      .slice(0, 12),
    avoid_profiles: recallSpec.avoid_profiles
      .map((term) => normalizeText(term))
      .filter((term) => term.length >= 3)
      .slice(0, 10),
  };

  const submitStandardSnapshot = async (
    request: BrightDataDatasetFilterRequest,
    options?: { relaxed?: boolean },
  ) => {
    const submittedAt = nowIso();
    const standardHash = computeFilterHash(request);
    const cachedStandardId = await lookupCachedSnapshot(standardHash);
    if (cachedStandardId) {
      snapshotId = cachedStandardId;
      logSearchEvent("search_snapshot_cache_hit", {
        search_id: context.searchId,
        round: options?.relaxed ? "standard_relaxed" : "standard",
        snapshot_id: snapshotId,
        job_id: context.jobId,
      });
    } else {
      snapshotId = await triggerDatasetFilter(brightDataToken, request);
      void cacheSnapshotEntry({
        snapshotId,
        round: options?.relaxed ? "standard_relaxed" : "standard",
        filterHash: standardHash,
        filterSummary: filterSummary,
        recordsLimit: request.recordsLimit,
      });
      logSearchEvent(options?.relaxed ? "search_standard_round_relaxed" : "search_snapshot_cache_miss", {
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
      bright_profile_budget: executionProfile.filterLimit,
      bright_profiles_requested: request.recordsLimit,
      judge_mode: runtime.judgeMode,
      standard_recall_requested_at: submittedAt,
      additional_snapshots: additionalSnapshotRefs.map((round) => ({
        ...buildAdditionalSnapshotMetadata({
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

  if (
    hasRecallSnapshotDrift(
      existingRecallMetadata,
      filterSummary,
      executionProfile,
      runtime,
      recallRequest.recordsLimit,
    )
  ) {
    logSearchEvent("search_recall_snapshot_invalidated", {
      search_id: context.searchId,
      old_snapshot_id: existingRecallMetadata?.snapshot_id,
      execution_profile: executionProfile.name,
      previous_filter_summary: existingRecallMetadata?.filter_summary ?? null,
      next_filter_summary: filterSummary,
      previous_budget: existingRecallMetadata?.bright_profile_budget ?? null,
      next_budget: executionProfile.filterLimit,
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

    // Fire additional rounds (hidden_gem, company_target) — check cache per round
    additionalSnapshotRefs = await Promise.all(additionalRounds.map(async (round) => {
      const submittedAt = nowIso();
      const roundHash = computeFilterHash(round.request);
      const cachedRoundId = await lookupCachedSnapshot(roundHash);
      let roundSnapshotId: string;
      if (cachedRoundId) {
        roundSnapshotId = cachedRoundId;
        logSearchEvent("search_snapshot_cache_hit", {
          search_id: context.searchId,
          round: round.round,
          snapshot_id: roundSnapshotId,
          job_id: context.jobId,
        });
      } else {
        roundSnapshotId = await triggerDatasetFilter(brightDataToken, round.request);
        void cacheSnapshotEntry({
          snapshotId: roundSnapshotId,
          round: round.round,
          filterHash: roundHash,
          filterSummary: null,
          recordsLimit: round.request.recordsLimit,
        });
        logSearchEvent("search_multi_round_triggered", {
          search_id: context.searchId,
          round: round.round,
          snapshot_id: roundSnapshotId,
          records_limit: round.request.recordsLimit,
          job_id: context.jobId,
        });
      }
      return {
        round: round.round,
        snapshotId: roundSnapshotId,
        request: round.request,
        recordsLimit: round.request.recordsLimit,
        submittedAt,
      };
    }));

    parsed.recall_provider = "brightdata_dataset";
    parsed.recall_metadata = {
      ...(normalizeRecallMetadata(parsed.recall_metadata) ?? {
        provider: "brightdata_dataset" as const,
        snapshot_id: snapshotId!,
      }),
      provider: "brightdata_dataset",
      snapshot_id: snapshotId!,
      requested_at: new Date(requestedAt).toISOString(),
      status: "submitted",
      filter_summary: filterSummary,
      bright_profile_budget: executionProfile.filterLimit,
      bright_profiles_requested: recallRequest.recordsLimit,
      judge_mode: runtime.judgeMode,
      additional_snapshots: additionalSnapshotRefs.map((round) => ({
        ...buildAdditionalSnapshotMetadata({
          round: round.round,
          snapshotId: round.snapshotId,
          recordsLimit: round.recordsLimit,
          existing: persistedAdditionalSnapshots.get(round.round) ?? null,
          status: "submitted",
          submittedAt: round.submittedAt,
        }),
      })),
    } satisfies RecallMetadata;
    await updateSearchParsedRequirements(context.searchId, parsed);
    logSearchEvent("search_step_started", {
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
    additionalSnapshotRefs = additionalRounds.flatMap((round) => {
      const persisted = persistedAdditionalSnapshots.get(round.round);
      if (!persisted?.snapshot_id) return [];
      return [{
        round: round.round,
        snapshotId: persisted.snapshot_id,
        request: round.request,
        recordsLimit: round.request.recordsLimit,
        submittedAt: persisted.submitted_at ?? undefined,
      }];
    });
    if (!Number.isFinite(requestedAt)) {
      requestedAt = Date.now();
    }
    logSearchEvent("search_step_started", {
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
  const remainingTimeoutMs = Math.max(0, BRIGHTDATA_FILTER_TIMEOUT_MS - totalElapsedMs);
  if (remainingTimeoutMs <= 0) {
    throw new Error(`Bright Data dataset recall timed out after ${BRIGHTDATA_FILTER_TIMEOUT_MS}ms`);
  }

  let metadata: BrightDataSnapshotMetadata | null = null;
  let profiles: BrightDataProfile[] = [];
  let standardRoundFailedEmpty = false;

  try {
    metadata = await getDatasetSnapshotMetadata(brightDataToken, activeSnapshotId);
  } catch (error) {
    throw error;
  }

  const additionalSnapshotStates = await Promise.all(
    additionalSnapshotRefs.map(async (round) => {
      const roundMetadata = await getDatasetSnapshotMetadata(brightDataToken, round.snapshotId);
      return { ...round, metadata: roundMetadata };
    }),
  );
  const pollRecordedAt = nowIso();
  for (const round of additionalSnapshotStates) {
    persistedAdditionalSnapshots.set(
      round.round,
      buildAdditionalSnapshotMetadata({
        round: round.round,
        snapshotId: round.snapshotId,
        recordsLimit: round.recordsLimit,
        existing: persistedAdditionalSnapshots.get(round.round) ?? null,
        status: mapSnapshotStatus(round.metadata),
        submittedAt: round.submittedAt ?? persistedAdditionalSnapshots.get(round.round)?.submitted_at ?? null,
        readyAt: round.metadata.status === "ready" ? pollRecordedAt : undefined,
        failedAt: round.metadata.status === "failed" ? pollRecordedAt : undefined,
        failureCode: round.metadata.status === "failed"
          ? (String(round.metadata.warning_code ?? round.metadata.error_code ?? "unknown"))
          : undefined,
        lastPolledAt: pollRecordedAt,
        profilesReturned: round.metadata.dataset_size ?? null,
        incrementPollAttempt: true,
      }),
    );
  }

  const canRelaxStandardRecall =
    metadata?.status === "failed" &&
    metadata.warning_code === "no_records_found" &&
    relaxedRecallRequest != null &&
    computeFilterHash(relaxedRecallRequest) !== computeFilterHash(recallRequest);

  if (canRelaxStandardRecall) {
    logSearchEvent("search_standard_round_retrying_relaxed", {
      search_id: context.searchId,
      snapshot_id: activeSnapshotId,
      job_id: context.jobId,
    });
    await submitStandardSnapshot(relaxedRecallRequest, { relaxed: true });
    if (snapshotId === activeSnapshotId) {
      // Relaxed filter resolved to the same empty snapshot — no point retrying.
      standardRoundFailedEmpty = true;
    } else {
      throw new DatasetRecallPendingError(
        `Bright Data relaxed recall submitted for snapshot ${snapshotId}`,
        { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
      );
    }
  }

  if (metadata?.status === "failed" && metadata.warning_code === "no_records_found") {
    standardRoundFailedEmpty = true;
  } else if (metadata?.status === "failed") {
    throw new Error(
      `Bright Data snapshot ${activeSnapshotId} failed${metadata.error_code ? ` (error_code=${String(metadata.error_code)})` : ""}`,
    );
  }

  const waitingOnStandard = metadata?.status !== "ready" && !standardRoundFailedEmpty;
  const waitingOnAdditional = additionalSnapshotStates.some(
    (round) => round.metadata.status === "scheduled" || round.metadata.status === "building",
  );

  if (waitingOnStandard || waitingOnAdditional) {
    parsed.recall_provider = "brightdata_dataset";
    parsed.recall_metadata = {
      provider: "brightdata_dataset",
      snapshot_id: activeSnapshotId,
      requested_at: new Date(requestedAt).toISOString(),
      status: "polling",
      filter_summary: filterSummary,
      bright_profile_budget: executionProfile.filterLimit,
      bright_profiles_requested: recallRequest.recordsLimit,
      judge_mode: runtime.judgeMode,
      standard_recall_requested_at:
        normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_requested_at ??
        new Date(requestedAt).toISOString(),
      standard_recall_ready_at:
        metadata?.status === "ready"
          ? normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_ready_at ?? pollRecordedAt
          : normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_ready_at ?? null,
      additional_snapshots: additionalSnapshotStates.map((round) => ({
        ...buildAdditionalSnapshotMetadata({
          round: round.round,
          snapshotId: round.snapshotId,
          recordsLimit: round.recordsLimit,
          existing: persistedAdditionalSnapshots.get(round.round) ?? null,
          status: mapSnapshotStatus(round.metadata),
          submittedAt: round.submittedAt ?? persistedAdditionalSnapshots.get(round.round)?.submitted_at ?? null,
          readyAt: round.metadata.status === "ready" ? pollRecordedAt : undefined,
          failedAt: round.metadata.status === "failed" ? pollRecordedAt : undefined,
          failureCode: round.metadata.status === "failed"
            ? (String(round.metadata.warning_code ?? round.metadata.error_code ?? "unknown"))
            : undefined,
          lastPolledAt: pollRecordedAt,
          profilesReturned: round.metadata.dataset_size ?? null,
        }),
      })),
    } satisfies RecallMetadata;
    await updateSearchParsedRequirements(context.searchId, parsed);
    throw new DatasetRecallPendingError(
      `Bright Data dataset recall still processing for snapshot ${activeSnapshotId}`,
      { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
    );
  }

  if (metadata?.status === "ready") {
    const standardDownloadStartedAt = nowIso();
    try {
      const rows = await downloadDatasetSnapshot(brightDataToken, activeSnapshotId);
      profiles = rows.map(adaptDatasetRecordToBrightDataProfile);
      void persistSnapshotProfiles(rows, {
        snapshotId: activeSnapshotId,
        searchId: context.searchId,
        jobId: context.jobId,
        sourceRound: "standard",
      });
      parsed.recall_metadata = {
        ...(normalizeRecallMetadata(parsed.recall_metadata) ?? {
          provider: "brightdata_dataset" as const,
          snapshot_id: activeSnapshotId,
        }),
        provider: "brightdata_dataset",
        snapshot_id: activeSnapshotId,
        requested_at: new Date(requestedAt).toISOString(),
        standard_recall_requested_at:
          normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_requested_at ??
          new Date(requestedAt).toISOString(),
        standard_recall_ready_at:
          normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_ready_at ?? pollRecordedAt,
        standard_download_started_at: standardDownloadStartedAt,
        standard_download_completed_at: nowIso(),
      } satisfies RecallMetadata;
    } catch (error) {
      if (!isTransientSnapshotDownloadError(error)) {
        throw error;
      }
      parsed.recall_provider = "brightdata_dataset";
      parsed.recall_metadata = {
        provider: "brightdata_dataset",
        snapshot_id: activeSnapshotId,
        requested_at: new Date(requestedAt).toISOString(),
        status: "polling",
        filter_summary: filterSummary,
        bright_profile_budget: executionProfile.filterLimit,
        bright_profiles_requested: recallRequest.recordsLimit,
        judge_mode: runtime.judgeMode,
        standard_recall_requested_at:
          normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_requested_at ??
          new Date(requestedAt).toISOString(),
        standard_recall_ready_at:
          normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_ready_at ?? pollRecordedAt,
        standard_download_started_at: standardDownloadStartedAt,
        additional_snapshots: additionalSnapshotStates.map((round) => ({
          ...buildAdditionalSnapshotMetadata({
            round: round.round,
            snapshotId: round.snapshotId,
            recordsLimit: round.recordsLimit,
            existing: persistedAdditionalSnapshots.get(round.round) ?? null,
            status: mapSnapshotStatus(round.metadata),
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

  if (!profiles.length && additionalSnapshotRefs.length === 0) {
    logSearchEvent("search_provider_failed", {
      search_id: context.searchId,
      provider: "brightdata_dataset",
      reason: "no_results",
      snapshot_id: activeSnapshotId,
      job_id: context.jobId,
    });
    return null;
  }

  logSearchEvent("search_timing", {
    search_id: context.searchId,
    phase: "standard_recall_complete",
    elapsed_ms: Date.now() - pipelineStartMs,
    profiles_count: profiles.length,
    empty_standard_round: standardRoundFailedEmpty,
    job_id: context.jobId,
  });

  const standardRecallCompletedAt = nowIso();
  const searchStartedAt = getSearchStartedAt(parsed, context);
  const timeToStandardRecallReadyMs =
    elapsedSince(searchStartedAt, standardRecallCompletedAt) ?? (Date.now() - requestedAt);
  parsed.recall_provider = "brightdata_dataset";
  parsed.recall_metadata = {
    provider: "brightdata_dataset",
    snapshot_id: activeSnapshotId,
    dataset_size: metadata.dataset_size ?? profiles.length,
    recall_latency_ms: Date.now() - requestedAt,
    cost: metadata.cost ?? null,
    bright_profile_budget: executionProfile.filterLimit,
    bright_profiles_requested: recallRequest.recordsLimit,
    bright_profiles_returned: profiles.length,
    judge_mode: runtime.judgeMode,
    requested_at: new Date(requestedAt).toISOString(),
    completed_at: standardRecallCompletedAt,
    standard_recall_requested_at: new Date(requestedAt).toISOString(),
    standard_recall_ready_at: standardRecallCompletedAt,
    standard_recall_completed_at: standardRecallCompletedAt,
    standard_download_started_at:
      normalizeRecallMetadata(parsed.recall_metadata)?.standard_download_started_at ??
      standardRecallCompletedAt,
    standard_download_completed_at:
      normalizeRecallMetadata(parsed.recall_metadata)?.standard_download_completed_at ??
      standardRecallCompletedAt,
    additional_snapshots: additionalSnapshotStates.map((round) => ({
      ...buildAdditionalSnapshotMetadata({
        round: round.round,
        snapshotId: round.snapshotId,
        recordsLimit: round.recordsLimit,
        existing: persistedAdditionalSnapshots.get(round.round) ?? null,
        status: mapSnapshotStatus(round.metadata),
        submittedAt: round.submittedAt ?? persistedAdditionalSnapshots.get(round.round)?.submitted_at ?? null,
        readyAt: round.metadata.status === "ready" ? standardRecallCompletedAt : undefined,
        failedAt: round.metadata.status === "failed" ? standardRecallCompletedAt : undefined,
        failureCode: round.metadata.status === "failed"
          ? (String(round.metadata.warning_code ?? round.metadata.error_code ?? "unknown"))
          : undefined,
        lastPolledAt: pollRecordedAt,
        profilesReturned: round.metadata.dataset_size ?? null,
      }),
    })),
    status: "ready",
    filter_summary: filterSummary,
  };
  parsed.display_stats = buildSearchDisplayStats({
    ...(normalizeSearchDisplayStats(parsed.display_stats) ?? buildSearchDisplayStats({})),
    bright_profile_budget: executionProfile.filterLimit,
    bright_profiles_requested: recallRequest.recordsLimit,
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
    cost: metadata.cost ?? null,
  });

  // --- Multi-round recall: collect results from pre-triggered additional snapshots ---
  const standardProfileCount = profiles.length;
  const allProfiles = [...profiles];
  let totalRecallCost = metadata.cost ?? 0;

  if (additionalSnapshotRefs.length > 0) {
    const seenIds = new Set<string>();
    for (const profile of allProfiles) {
      const key = profile.linkedin_id || profile.url || profile.name;
      if (key) seenIds.add(key);
    }

    for (const roundRef of additionalSnapshotStates) {
      const { round, snapshotId: roundSnapId, metadata: roundMeta } = roundRef;
      if (roundMeta.status !== "ready") {
        logSearchEvent("search_multi_round_empty", {
          search_id: context.searchId,
          round,
          snapshot_id: roundSnapId,
          job_id: context.jobId,
        });
        continue;
      }
      let roundProfiles: BrightDataProfile[];
      const roundDownloadStartedAt = nowIso();
      try {
        const roundRows = await downloadDatasetSnapshot(brightDataToken, roundSnapId);
        roundProfiles = roundRows.map(adaptDatasetRecordToBrightDataProfile);
        void persistSnapshotProfiles(roundRows, {
          snapshotId: roundSnapId,
          searchId: context.searchId,
          jobId: context.jobId,
          sourceRound: round,
        });
      } catch (error) {
        if (!isTransientSnapshotDownloadError(error)) {
          throw error;
        }
        throw new DatasetRecallPendingError(
          `Bright Data additional snapshot ${roundSnapId} is ready but the download is still finalizing`,
          { retryDelayMs: BRIGHTDATA_FILTER_POLL_INTERVAL_MS },
        );
      }
      persistedAdditionalSnapshots.set(
        round,
        buildAdditionalSnapshotMetadata({
          round,
          snapshotId: roundSnapId,
          recordsLimit: roundRef.recordsLimit,
          existing: persistedAdditionalSnapshots.get(round) ?? null,
          status: "ready",
          submittedAt: roundRef.submittedAt ?? persistedAdditionalSnapshots.get(round)?.submitted_at ?? null,
          readyAt: persistedAdditionalSnapshots.get(round)?.ready_at ?? nowIso(),
          lastPolledAt: persistedAdditionalSnapshots.get(round)?.last_polled_at ?? nowIso(),
          downloadStartedAt: roundDownloadStartedAt,
          downloadCompletedAt: nowIso(),
          profilesReturned: roundMeta?.dataset_size ?? roundProfiles.length,
          incrementDownloadAttempt: true,
        }),
      );
      if (roundProfiles.length === 0) {
        logSearchEvent("search_multi_round_empty", {
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
        addedCount++;
      }
      if (roundMeta?.cost) totalRecallCost += roundMeta.cost;
      void updateCachedSnapshotMetadata(roundSnapId, {
        datasetSize: roundMeta?.dataset_size ?? roundProfiles.length,
        cost: roundMeta?.cost ?? null,
      });
      logSearchEvent("search_multi_round_completed", {
        search_id: context.searchId,
        round,
        snapshot_id: roundSnapId,
        profiles_returned: roundProfiles.length,
        unique_added: addedCount,
        job_id: context.jobId,
      });
    }
  }

  const allRecallCompletedAt = nowIso();
  parsed.recall_metadata = {
    ...(normalizeRecallMetadata(parsed.recall_metadata) ?? {
      provider: "brightdata_dataset" as const,
      snapshot_id: snapshotId,
    }),
    provider: "brightdata_dataset",
    snapshot_id: snapshotId,
    dataset_size: metadata.dataset_size ?? profiles.length,
    recall_latency_ms: Date.now() - requestedAt,
    cost: totalRecallCost > 0 ? totalRecallCost : (metadata.cost ?? null),
    bright_profile_budget: executionProfile.filterLimit,
    bright_profiles_requested: recallRequest.recordsLimit,
    bright_profiles_returned: allProfiles.length,
    judge_mode: runtime.judgeMode,
    requested_at: new Date(requestedAt).toISOString(),
    completed_at: standardRecallCompletedAt,
    standard_recall_requested_at: new Date(requestedAt).toISOString(),
    standard_recall_ready_at:
      normalizeRecallMetadata(parsed.recall_metadata)?.standard_recall_ready_at ??
      standardRecallCompletedAt,
    standard_recall_completed_at: standardRecallCompletedAt,
    standard_download_started_at:
      normalizeRecallMetadata(parsed.recall_metadata)?.standard_download_started_at ??
      standardRecallCompletedAt,
    standard_download_completed_at:
      normalizeRecallMetadata(parsed.recall_metadata)?.standard_download_completed_at ??
      standardRecallCompletedAt,
    all_recall_completed_at: allRecallCompletedAt,
    additional_snapshots: additionalSnapshotRefs.map((round) => ({
      ...buildAdditionalSnapshotMetadata({
        round: round.round,
        snapshotId: round.snapshotId,
        recordsLimit: round.recordsLimit,
        existing: persistedAdditionalSnapshots.get(round.round) ?? null,
        status: persistedAdditionalSnapshots.get(round.round)?.status ?? "ready",
        submittedAt: round.submittedAt ?? persistedAdditionalSnapshots.get(round.round)?.submitted_at ?? null,
        readyAt: persistedAdditionalSnapshots.get(round.round)?.ready_at ?? null,
        failedAt: persistedAdditionalSnapshots.get(round.round)?.failed_at ?? null,
        lastPolledAt: persistedAdditionalSnapshots.get(round.round)?.last_polled_at ?? null,
        downloadStartedAt: persistedAdditionalSnapshots.get(round.round)?.download_started_at ?? null,
        downloadCompletedAt: persistedAdditionalSnapshots.get(round.round)?.download_completed_at ?? null,
        profilesReturned: persistedAdditionalSnapshots.get(round.round)?.profiles_returned ?? null,
      }),
    })),
    status: "ready",
    filter_summary: filterSummary,
  };
  await updateSearchParsedRequirements(context.searchId, parsed);

  logSearchEvent("search_timing", {
    search_id: context.searchId,
    phase: "all_recall_complete",
    elapsed_ms: Date.now() - pipelineStartMs,
    total_profiles: allProfiles.length,
    standard_profiles: standardProfileCount,
    additional_profiles: allProfiles.length - standardProfileCount,
    job_id: context.jobId,
  });

  await setSearchStatus(context.searchId, "screening", {
    search_completed_at: standardRecallCompletedAt,
    parsed_requirements: parsed,
  });
  logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "searching",
    provider: "brightdata_dataset",
    execution_profile: executionProfile.name,
    snapshot_id: activeSnapshotId,
    result_count: allProfiles.length,
    dataset_size: metadata.dataset_size ?? profiles.length,
    recall_latency_ms: Date.now() - requestedAt,
    additional_rounds_in_progress: 0,
    job_id: context.jobId,
  });
  logSearchEvent("search_step_started", {
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
    low_cost_mode: executionProfile.lowCostMode,
    single_judge_mode: executionProfile.singleJudgeMode,
    job_id: context.jobId,
  });

  await updateSearchDisplayStats(context.searchId, parsed, {
    bright_profiles_returned: allProfiles.length,
    recall_profile_count: allProfiles.length,
    retrieval_count: allProfiles.length,
    deep_review_requested_count: allProfiles.length,
    deep_review_completed_count: 0,
    bright_snapshot_cost: totalRecallCost > 0 ? totalRecallCost : (metadata.cost ?? undefined),
    bright_profile_budget: executionProfile.filterLimit,
    bright_profiles_requested: recallRequest.recordsLimit,
    judge_mode: runtime.judgeMode,
    time_to_ack_ms: 0,
    time_to_standard_recall_ready_ms: timeToStandardRecallReadyMs,
  });

  const handleFirstVisibleCandidate = async (statsPatch: Partial<SearchDisplayStats>) => {
    await markSearchReviewable(context, parsed, statsPatch);
  };

  const combinedResult =
    allProfiles.length > 0
      ? await scoreBrightDataProfiles(
        context,
        parsed,
        allProfiles,
        allProfiles.length,
        executionProfile,
        {
          progressOffset: 0,
          onFirstVisibleCandidate: handleFirstVisibleCandidate,
        },
      )
      : {
        finalRows: [],
        assessments: [],
        warningMessage: null,
        displayStats: buildSearchDisplayStats({
          bright_profile_budget: executionProfile.filterLimit,
          bright_profiles_requested: recallRequest.recordsLimit,
          bright_profiles_returned: allProfiles.length,
          recall_profile_count: allProfiles.length,
          retrieval_count: allProfiles.length,
          deep_review_requested_count: allProfiles.length,
          deep_review_completed_count: 0,
          judge_mode: runtime.judgeMode,
          time_to_ack_ms: 0,
          time_to_standard_recall_ready_ms: timeToStandardRecallReadyMs,
        }),
      };

  logSearchEvent("search_step_completed", {
    search_id: context.searchId,
    step: "deep_scoring",
    provider: "brightdata_dataset",
    execution_profile: executionProfile.name,
    result_count: combinedResult.finalRows.length,
    retrieved_count: allProfiles.length,
    shortlist_count: combinedResult.displayStats.shortlist_count,
    job_id: context.jobId,
  });

  logSearchEvent("search_timing", {
    search_id: context.searchId,
    phase: "pipeline_complete",
    total_elapsed_ms: Date.now() - pipelineStartMs,
    job_id: context.jobId,
  });

  return {
    ...combinedResult,
    displayStats: buildSearchDisplayStats({
      ...(normalizeSearchDisplayStats(parsed.display_stats) ?? buildSearchDisplayStats({})),
      ...combinedResult.displayStats,
      bright_snapshot_cost: totalRecallCost > 0 ? totalRecallCost : (metadata.cost ?? undefined),
      bright_profile_budget: executionProfile.filterLimit,
      bright_profiles_requested: recallRequest.recordsLimit,
      bright_profiles_returned: allProfiles.length,
      judge_mode: runtime.judgeMode,
    }),
  };
}

async function judgeScoreBatch(
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  batchIndexes: number[],
  totalPoolSize: number,
  judgeLabel: "Judge A" | "Judge B",
  context?: { searchId?: string; jobId?: string },
): Promise<JudgeScoreResult[]> {
  const profilesText = batchIndexes
    .map((idx) => truncateForPrompt(profileTexts[idx], 2800))
    .join("\n\n");
  const prompt = buildJudgeScorePrompt(
    parsed,
    jdText,
    profilesText,
    batchIndexes.length,
    judgeLabel,
    {
      truncateForPrompt,
      buildPromptSearchContext,
    },
  );
  const judgeModel = getJudgeModel();
  const maxAttempts = runtime.judgeMaxAttempts;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data: judgeResult } = await withTimeout(
        (signal) => generateOpenRouterJson<unknown>({
          model: judgeModel,
          prompt,
          maxOutputTokens: runtime.judgeMaxOutputTokens,
          abortSignal: signal,
          timeoutMs: JUDGE_SCORING_TIMEOUT_MS,
          temperature: 0,
          jsonSchema: buildJudgeScoreJsonSchema(batchIndexes.length),
          requireParameters: true,
        }),
        JUDGE_SCORING_TIMEOUT_MS,
        `${judgeLabel} scoring (attempt ${attempt})`,
      );

      const parsed = parseJudgeScoreResults(
        judgeResult,
        totalPoolSize,
        batchIndexes,
        {
          sanitizeCandidateSuitability,
          normalizeScore,
          stripSpeculativeRelocation,
          normalizeStringArray,
          normalizeBlockingConstraints,
          normalizeBlockingSeverity,
          normalizeAdvanceRecommendation,
          normalizeEnumValue,
          deriveShortlistDecision,
          normalizeNullableString,
          sanitizeConstraintVerdicts,
          normalizeExperienceYears,
        },
      ).filter((assessment) => batchIndexes.includes(assessment.index));

      if (parsed.length > 0) return parsed;
      throw new Error(`${judgeLabel} returned no valid scores`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const rawText = (error as Error & { rawText?: string }).rawText;
      const isTransientError =
        message.includes("invalid JSON") ||
        message.includes("timed out") ||
        message.includes("429") ||
        message.includes("OpenRouter API error 5") ||
        message.includes("no choices") ||
        message.includes("empty response") ||
        message.includes("502") ||
        message.includes("503") ||
        message.includes("504");
      const shouldRetry = attempt < maxAttempts && isTransientError;
      lastError = error instanceof Error ? error : new Error(message);

      logSearchEvent("judge_scoring_attempt_failed", {
        judge: judgeLabel,
        attempt,
        retrying: shouldRetry,
        error: message,
        ...(rawText != null && { raw_response: rawText.slice(0, 500) }),
        ...(context?.searchId && { search_id: context.searchId }),
        ...(context?.jobId && { job_id: context.jobId }),
      });

      if (!shouldRetry) break;
      await sleep(300 * attempt);
    }
  }

  throw lastError || new Error(`${judgeLabel} scoring failed`);
}

async function arbitrateCandidateScore(
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileText: string,
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
  totalPoolSize: number,
): Promise<ScoredCandidateAssessment | null> {
  const prompt = buildArbiterPrompt(
    parsed,
    jdText,
    truncateForPrompt(profileText, 3000),
    judgeA,
    judgeB,
    {
      truncateForPrompt,
      buildPromptSearchContext,
      buildCompanyProfileContext,
    },
  );
  const maxAttempts = runtime.arbiterMaxAttempts;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data } = await withTimeout(
        (signal) => generateOpenRouterJson<unknown>({
          model: getArbiterModel(),
          prompt,
          maxOutputTokens: runtime.arbiterMaxOutputTokens,
          abortSignal: signal,
          timeoutMs: ARBITER_SCORING_TIMEOUT_MS,
          temperature: 0,
          jsonSchema: ARBITER_SCORE_JSON_SCHEMA,
        }),
        ARBITER_SCORING_TIMEOUT_MS,
        `Arbiter scoring (attempt ${attempt})`,
      );

      const assessment = parseScoredAssessments(data, totalPoolSize, {
        sanitizeCandidateSuitability,
        normalizeStringArray,
        normalizeExperienceYears,
        normalizeNullableString,
        sortCandidateAssessments,
      })[0];
      if (!assessment) {
        throw new Error("Arbiter returned no valid assessment");
      }
      return {
        ...assessment,
        scoring_method: "dual_review_arbitrated",
        judge_delta: Math.max(
          Math.abs(judgeA.capability_score - judgeB.capability_score),
          Math.abs(judgeA.relevance_score - judgeB.relevance_score),
          Math.abs(judgeA.join_likelihood_score - judgeB.join_likelihood_score),
        ),
        judge_conflict: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetry = attempt < maxAttempts && (
        message.includes("timed out") ||
        message.includes("invalid JSON") ||
        message.includes("Expected")
      );
      lastError = error instanceof Error ? error : new Error(message);
      logSearchEvent("arbiter_attempt_failed", {
        attempt,
        retrying: shouldRetry,
        error: message,
      });
      if (!shouldRetry) break;
      await sleep(400 * attempt);
    }
  }

  throw lastError || new Error("Arbiter scoring failed");
}

async function deepScoreSelectedProfiles(
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  selectedIndexes: number[],
  totalPoolSize: number,
  options?: {
    onCandidateScored?: (assessment: ScoredCandidateAssessment, completedCount: number) => void | Promise<void>;
    searchId?: string;
    jobId?: string;
  },
): Promise<ScoredCandidateAssessment[]> {
  if (!selectedIndexes.length) return [];

  let completedCount = 0;
  // Each candidate spawns two judge calls and occasionally an arbiter call.
  // Hard cap concurrency to avoid judge/arbiter API saturation.
  const workerCount = Math.min(DEEP_REVIEW_CONCURRENCY, selectedIndexes.length);
  const assessments = await runWithConcurrency(
    selectedIndexes,
    workerCount,
    async (selectedIndex) => {
      const result = await scoreSingleCandidate(runtime, parsed, jdText, profileTexts, selectedIndex, totalPoolSize, { searchId: options?.searchId, jobId: options?.jobId });
      if (result) {
        completedCount++;
        try { await options?.onCandidateScored?.(result, completedCount); } catch { /* non-blocking */ }
      }
      return result;
    },
  );

  return assessments
    .filter((assessment): assessment is ScoredCandidateAssessment => Boolean(assessment))
    .sort(sortCandidateAssessments);
}

async function scoreSingleCandidate(
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  selectedIndex: number,
  totalPoolSize: number,
  context?: { searchId?: string; jobId?: string },
): Promise<ScoredCandidateAssessment | null> {
      if (runtime.judgeMode === "single") {
        try {
          const judgeResults = await judgeScoreBatch(
            runtime,
            parsed,
            jdText,
            profileTexts,
            [selectedIndex],
            totalPoolSize,
            "Judge A",
          );
          const judge = judgeResults[0];
          if (!judge) return null;
          return {
            ...mergeJudgeResults(judge, judge, {
              computeQualityScore,
              computeAdvanceScore,
              deriveAdvanceRecommendation,
              sanitizeCandidateSuitability,
              normalizeNullableString,
            }),
            scoring_method: "single_judge_debug",
            judge_delta: 0,
            judge_conflict: false,
          };
        } catch (error) {
          logSearchEvent("single_judge_scoring_failed", {
            index: selectedIndex,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }

      const judgeBatch = [selectedIndex];
      const [judgeAResults, judgeBResults] = await Promise.allSettled([
        judgeScoreBatch(runtime, parsed, jdText, profileTexts, judgeBatch, totalPoolSize, "Judge A", context),
        judgeScoreBatch(runtime, parsed, jdText, profileTexts, judgeBatch, totalPoolSize, "Judge B", context),
      ]);

      const judgeA = judgeAResults.status === "fulfilled" ? judgeAResults.value[0] : null;
      const judgeB = judgeBResults.status === "fulfilled" ? judgeBResults.value[0] : null;

      if (judgeAResults.status === "rejected" || judgeBResults.status === "rejected") {
        logSearchEvent("dual_review_judge_failure", {
          index: selectedIndex,
          judge_a_error:
            judgeAResults.status === "rejected"
              ? judgeAResults.reason instanceof Error
                ? judgeAResults.reason.message
                : String(judgeAResults.reason)
              : null,
          judge_b_error:
            judgeBResults.status === "rejected"
              ? judgeBResults.reason instanceof Error
                ? judgeBResults.reason.message
                : String(judgeBResults.reason)
              : null,
        });
      }

      if (!judgeA && !judgeB) return null;
      if (judgeA && !judgeB) {
        return {
          ...mergeJudgeResults(judgeA, judgeA, {
            computeQualityScore,
            computeAdvanceScore,
            deriveAdvanceRecommendation,
            sanitizeCandidateSuitability,
            normalizeNullableString,
          }),
          judge_delta: 0,
        };
      }
      if (judgeB && !judgeA) {
        return {
          ...mergeJudgeResults(judgeB, judgeB, {
            computeQualityScore,
            computeAdvanceScore,
            deriveAdvanceRecommendation,
            sanitizeCandidateSuitability,
            normalizeNullableString,
          }),
          judge_delta: 0,
        };
      }

      if (!judgeA || !judgeB) return null;
      if (!hasJudgeConflict(judgeA, judgeB, {
        computeQualityScore,
        deriveFitDecisionFromScore,
      })) {
        return {
          ...mergeJudgeResults(judgeA, judgeB, {
            computeQualityScore,
            computeAdvanceScore,
            deriveAdvanceRecommendation,
            sanitizeCandidateSuitability,
            normalizeNullableString,
          }),
          judge_conflict: false,
        };
      }

      try {
        const arbitrated = await arbitrateCandidateScore(
          runtime,
          parsed,
          jdText,
          profileTexts[selectedIndex],
          judgeA,
          judgeB,
          totalPoolSize,
        );
        return arbitrated;
      } catch (error) {
        logSearchEvent("dual_review_arbiter_failure", {
          index: selectedIndex,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          ...mergeJudgeResults(judgeA, judgeB, {
            computeQualityScore,
            computeAdvanceScore,
            deriveAdvanceRecommendation,
            sanitizeCandidateSuitability,
            normalizeNullableString,
          }),
          scoring_method: "dual_review_auto",
          judge_delta: Math.max(
            Math.abs(judgeA.capability_score - judgeB.capability_score),
            Math.abs(judgeA.relevance_score - judgeB.relevance_score),
            Math.abs(judgeA.join_likelihood_score - judgeB.join_likelihood_score),
          ),
          judge_conflict: true,
        };
      }
}

async function scoreBrightDataProfiles(
  context: PipelineContext,
  parsed: Record<string, unknown>,
  brightProfiles: BrightDataProfile[],
  retrievalCount: number,
  executionProfile: SearchExecutionProfile,
  options?: {
    progressOffset?: number;
    onFirstVisibleCandidate?: (statsPatch: Partial<SearchDisplayStats>) => Promise<void>;
  },
): Promise<SearchPipelineResult> {
  const scoringStartMs = Date.now();
  const runtime = getExecutionRuntime(executionProfile);
  const renderProfileEntries = brightProfiles.map((profile, index) =>
    brightDataProfileToRichText(profile, index),
  );
  const selectedIndexes = brightProfiles.map((_, index) => index);
  const progressOffset = Math.max(0, options?.progressOffset ?? 0);
  let firstVisibleSignalled = false;

  const deepAssessments = await deepScoreSelectedProfiles(
    runtime,
    parsed,
    context.jdText,
    renderProfileEntries,
    selectedIndexes,
    brightProfiles.length,
    {
      onCandidateScored: async (assessment, completedCount) => {
        const completedTotal = progressOffset + completedCount;
        const displayTier = getDisplayTierForAssessment(assessment);
        if (!displayTier) {
          if (completedTotal % 5 === 0) {
            await updateSearchDisplayStat(context.searchId, parsed, "deep_review_completed_count", completedTotal);
          }
          return;
        }
        const rows = buildBrightDataCandidateRows(
          brightProfiles,
          [assessment],
          1,
          "outreach_pool",
          { getDisplayTierForAssessment },
        );
        if (rows.length > 0) {
          await upsertSingleCandidate(context.searchId, rows[0]);
          await retagSearchCandidatePoolTypes(context.searchId);
          if (!firstVisibleSignalled) {
            firstVisibleSignalled = true;
            await options?.onFirstVisibleCandidate?.({
              visible_candidate_count: 1,
              shortlist_count: 1,
              priority_outreach_count: displayTier === "priority_outreach" ? 1 : 0,
              worth_reviewing_count: displayTier === "worth_reviewing" ? 1 : 0,
              shortlist_yes_count: shouldDisplayCandidate(assessment) ? 1 : 0,
              shortlist_no_count: shouldDisplayCandidate(assessment) ? 0 : 1,
            });
          }
        }
        // Update progress every 5 candidates
        if (completedTotal % 5 === 0) {
          await updateSearchDisplayStat(context.searchId, parsed, "deep_review_completed_count", completedTotal);
        }
      },
      searchId: context.searchId,
      jobId: context.jobId,
    },
  );

  logSearchEvent("search_timing", {
    search_id: context.searchId,
    phase: "scoring_complete",
    scoring_elapsed_ms: Date.now() - scoringStartMs,
    recall_profile_count: brightProfiles.length,
    deep_review_input: selectedIndexes.length,
    deep_review_output: deepAssessments.length,
    job_id: context.jobId,
  });

  if (DEEP_REVIEW_DEBUG_LOGS) {
    logSearchEvent("deep_review_distribution", {
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
    shouldDisplayCandidate,
    sortCandidateAssessments,
  });
  // Use deepSelection.selected (filtered by shouldDisplayCandidate) as the source for visible
  // candidates so that score thresholds and location gates are actually enforced.
  const priorityAssessments = deepSelection.selected
    .filter((assessment) => assessment.suitability.bucket === "strong_now");
  const worthReviewingAssessments = deepSelection.selected
    .filter((assessment) => assessment.suitability.bucket === "consider_next");
  const ruledOutAssessments = deepAssessments
    .filter((assessment) => assessment.suitability.bucket === "do_not_show");
  const visibleAssessments = [...priorityAssessments, ...worthReviewingAssessments];
  const excludedReasonCounts = buildExcludedReasonCounts(ruledOutAssessments);
  logSearchEvent("search_shortlist_decisions", {
    search_id: context.searchId,
    shortlist_yes_count: deepSelection.shortlistYesCount,
    shortlist_no_count: deepSelection.shortlistNoCount,
    hard_blocked_count: hardBlockedCount,
    job_id: context.jobId,
  });
  const deepRows = buildBrightDataCandidateRows(
    brightProfiles,
    visibleAssessments,
    visibleAssessments.length,
    "main",
    { getDisplayTierForAssessment },
  );

  const taggedRows = tagPoolRows(
    deepRows,
    [],
    deepRows.length,
  );
  const finalRows = enrichRowsWithGithubSignals(taggedRows, {
    requiredSkills: sanitizeHiringBrief(parsed.hiring_brief, parsed).role_core.required_skills,
    displayCount: Number(parsed.display_count) || taggedRows.length,
    githubEnrichLimit: GITHUB_ENRICH_LIMIT,
  });
  const topQualityScore = deepAssessments.reduce(
    (best, assessment) => Math.max(best, assessment.suitability.quality_score),
    0,
  );
  const top50QualityCutoff =
    finalRows.length > 0
      ? finalRows[finalRows.length - 1]?.match_score ?? 0
      : 0;

  let warningMessage: string | null = null;
  if (finalRows.length === 0) {
    warningMessage = "No candidates were ranked into the visible result set.";
  } else if (fullDetailIncomplete) {
    warningMessage = "Some deep reviews timed out, and only completed deep scores were ranked.";
  }
  const estimatedCosts = estimateBrightPipelineLlmCost({
    context,
    parsed,
    renderProfileEntries,
    selectedCount: selectedIndexes.length,
    finalRows,
    runtime,
  });
  const contactUnlockCandidates = finalRows.filter((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null;
    const suitability = sanitizeCandidateSuitability(metadata?.suitability);
    return (
      suitability?.blocking_severity !== "hard" &&
      suitability?.advance_recommendation !== "reject"
    );
  }).length;
  const shortlistYesCount = deepSelection.shortlistYesCount;
  const shortlistNoCount = deepSelection.shortlistNoCount;
  const clearLocationFitCount = finalRows.filter((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null;
    const verdicts =
      metadata?.constraint_verdicts &&
      typeof metadata.constraint_verdicts === "object"
        ? (metadata.constraint_verdicts as ConstraintVerdict)
        : null;
    return verdicts?.location_fit === "local" || verdicts?.location_fit === "nearby";
  }).length;
  const mustHaveStrongCount = finalRows.filter((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null;
    const verdicts =
      metadata?.constraint_verdicts &&
      typeof metadata.constraint_verdicts === "object"
        ? (metadata.constraint_verdicts as ConstraintVerdict)
        : null;
    return verdicts?.must_have_coverage === "strong";
  }).length;
  const firstContactConfidenceCount = finalRows.filter((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : null;
    return metadata?.first_contact_confidence === "high";
  }).length;

  return {
    finalRows,
    warningMessage,
    assessments: deepAssessments,
    displayStats: buildSearchDisplayStats({
      retrieval_count: retrievalCount,
      recall_profile_count: brightProfiles.length,
      deep_review_requested_count: selectedIndexes.length,
      deep_review_completed_count: deepAssessments.length,
      qualified_count: finalRows.length,
      outreach_pool_count: finalRows.length,
      shortlist_count: finalRows.length,
      brightdata_scrape_count: brightProfiles.length,
      bright_profile_budget: executionProfile.filterLimit,
      bright_profiles_requested: executionProfile.filterLimit,
      bright_profiles_returned: brightProfiles.length,
      estimated_llm_cost: estimatedCosts.estimatedLlmCost,
      estimated_search_total_cost: estimatedCosts.estimatedSearchTotalCost,
      judge_mode: runtime.judgeMode,
      activation_run: isActivationRun(parsed),
      quality_floor_applied: false,
      visible_candidate_count: finalRows.length,
      pre_gate_blocked_count: 0,
      prescreen_blocked_count: 0,
      contact_unlock_candidates: contactUnlockCandidates,
      shortlist_yes_count: shortlistYesCount,
      shortlist_no_count: shortlistNoCount,
      priority_outreach_count: priorityAssessments.length,
      worth_reviewing_count: worthReviewingAssessments.length,
      ruled_out_count: ruledOutAssessments.length,
      clear_location_fit_count: clearLocationFitCount,
      must_have_strong_count: mustHaveStrongCount,
      first_contact_confidence_count: firstContactConfidenceCount,
      deep_qualified_rate:
        deepAssessments.length > 0
          ? visibleAssessments.length / deepAssessments.length
          : 0,
      hard_blocked_count: hardBlockedCount,
      soft_blocked_count: softBlockedCount,
      advanceable_count: advanceableCount,
      top_quality_score: topQualityScore,
      top50_quality_cutoff: top50QualityCutoff,
      strong_now_count: priorityAssessments.length,
      consider_next_count: worthReviewingAssessments.length,
      do_not_show_count: ruledOutAssessments.length,
      excluded_reason_counts: excludedReasonCounts,
    }),
  };
}

async function completeSearch(
  context: PipelineContext,
  parsed: Record<string, unknown>,
  finalRows: CandidateRowInput[],
  displayStats: SearchDisplayStats,
  warningMessage?: string | null,
  options?: { generateOutreachDrafts?: boolean; runtime?: SearchExecutionRuntime },
) {
  const doneAt = nowIso();
  const startedAt = getSearchStartedAt(parsed, context);
  const finalDisplayStats = buildSearchDisplayStats({
    ...displayStats,
    time_to_done_ms:
      displayStats.time_to_done_ms ?? elapsedSince(startedAt, doneAt),
  });
  const draftedRows =
    finalRows.length > 0 && options?.generateOutreachDrafts !== false
      ? await generateOutreachDraftsForRows(
        context,
        options?.runtime ?? getExecutionRuntime(getSearchExecutionProfile("bright_full_pro")),
        parsed,
        finalRows,
      )
      : finalRows;

  if (draftedRows.length > 0) {
    await upsertCandidatesForSearch(context.searchId, draftedRows, {
      replaceMissing: true,
    });
    // TODO: GitHub 富化改为搜索任务阶段内处理，使用令牌桶限速
    // 暂时移除独立调度器依赖
  }

  const finalParsed = withDisplayStats(parsed, finalDisplayStats);
  const createdAtMs = context.createdAt ? Date.parse(context.createdAt) : Number.NaN;
  const finalReadyLatencyMs = Number.isFinite(createdAtMs)
    ? Math.max(0, Date.now() - createdAtMs)
    : null;
  await setSearchStatus(context.searchId, warningMessage ? "degraded" : "done", {
    done_at: doneAt,
    error_message: null,
    warning_message: warningMessage ?? null,
    parsed_requirements: finalParsed,
  });

  await updateSearchUsageEventMetadata(context.searchId, {
    execution_profile: finalParsed.execution_profile ?? null,
    search_phase: finalParsed.search_phase ?? null,
    result_stage: finalParsed.result_stage ?? null,
    activation_run: finalDisplayStats.activation_run ?? finalParsed.activation_run ?? null,
    quality_floor_applied: finalDisplayStats.quality_floor_applied ?? null,
    visible_candidate_count: finalDisplayStats.visible_candidate_count ?? draftedRows.length,
    pre_gate_blocked_count: finalDisplayStats.pre_gate_blocked_count ?? null,
    prescreen_blocked_count: finalDisplayStats.prescreen_blocked_count ?? null,
    contact_unlock_candidates: finalDisplayStats.contact_unlock_candidates ?? draftedRows.length,
    recall_profile_count: finalDisplayStats.recall_profile_count ?? null,
    priority_outreach_count: finalDisplayStats.priority_outreach_count ?? null,
    worth_reviewing_count: finalDisplayStats.worth_reviewing_count ?? null,
    ruled_out_count: finalDisplayStats.ruled_out_count ?? null,
    strong_now_count: finalDisplayStats.strong_now_count ?? null,
    consider_next_count: finalDisplayStats.consider_next_count ?? null,
    do_not_show_count: finalDisplayStats.do_not_show_count ?? null,
    shortlist_yes_count: finalDisplayStats.shortlist_yes_count ?? null,
    shortlist_no_count: finalDisplayStats.shortlist_no_count ?? null,
    clear_location_fit_count: finalDisplayStats.clear_location_fit_count ?? null,
    must_have_strong_count: finalDisplayStats.must_have_strong_count ?? null,
    first_contact_confidence_count: finalDisplayStats.first_contact_confidence_count ?? null,
    bright_profile_budget: finalDisplayStats.bright_profile_budget ?? null,
    bright_profiles_requested: finalDisplayStats.bright_profiles_requested ?? null,
    bright_profiles_returned: finalDisplayStats.bright_profiles_returned ?? null,
    bright_snapshot_cost: finalDisplayStats.bright_snapshot_cost ?? null,
    estimated_llm_cost: finalDisplayStats.estimated_llm_cost ?? null,
    estimated_search_total_cost: finalDisplayStats.estimated_search_total_cost ?? null,
    final_ready_latency_ms: finalReadyLatencyMs,
    judge_mode: finalDisplayStats.judge_mode ?? finalParsed.judge_mode ?? null,
  });

  logSearchEvent(warningMessage ? "search_degraded" : "search_done", {
    search_id: context.searchId,
    candidate_count: draftedRows.length,
    warning_message: warningMessage ?? null,
    final_ready_latency_ms: finalReadyLatencyMs,
    bright_snapshot_cost: finalDisplayStats.bright_snapshot_cost ?? null,
    estimated_llm_cost: finalDisplayStats.estimated_llm_cost ?? null,
    estimated_search_total_cost: finalDisplayStats.estimated_search_total_cost ?? null,
    job_id: context.jobId,
  });
}

async function markSearchDegraded(searchId: string, warningMessage: string) {
  await setSearchStatus(searchId, "degraded", {
    done_at: nowIso(),
    warning_message: warningMessage,
    error_message: null,
  });
}

async function failSearch(searchId: string, message: string) {
  await setSearchStatus(searchId, "error", {
    error_message: message,
    warning_message: null,
  });
  const count = await countCandidatesForSearch(searchId);

  if (count === 0) {
    void queueOrSendSearchNotification(searchId, "search_failed").catch((error) => {
      console.error("[search_notifications] Failed to queue failure notification:", error);
    });
  }
}

async function runSearchPipeline(job: SearchJobRow) {
  const { data: search } = await supabaseAdmin
    .from("hirelix_searches")
    .select("id, user_id, jd_text, parsed_requirements, status, parse_completed_at, created_at")
    .eq("id", job.search_id)
    .single();

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
    const billing = await getBillingSummaryForUser(supabaseAdmin, job.user_id);
    planCode = normalizeSearchPlanCode(billing.plan.code);
  }
  const storedInitialProfileName = normalizeSearchExecutionProfileName(
    existingParsed?.execution_profile,
  );
  const initialExecutionProfile = storedInitialProfileName
    ? getSearchExecutionProfile(storedInitialProfileName)
    : getInitialSearchExecutionProfile(planCode);

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
    candidateCount: job.candidate_count || Number((search as SearchRow).parsed_requirements?.candidate_count) || 5,
    highlightCount:
      Number((search as SearchRow).parsed_requirements?.highlight_count) ||
      HIGHLIGHT_CANDIDATE_COUNT,
    outreachPoolTarget:
      Number((search as SearchRow).parsed_requirements?.outreach_pool_target) ||
      OUTREACH_POOL_TARGET,
  };

  const parsed = canReuseParsedRequirements(search as SearchRow)
    ? {
      ...((search as SearchRow).parsed_requirements || {}),
      candidate_count: context.candidateCount,
      display_count:
        Number((search as SearchRow).parsed_requirements?.display_count) ||
        initialExecutionProfile.finalResultCap,
      highlight_count:
        Number((search as SearchRow).parsed_requirements?.highlight_count) ||
        context.highlightCount,
      outreach_pool_target:
        Number((search as SearchRow).parsed_requirements?.outreach_pool_target) ||
        context.outreachPoolTarget,
      plan_code: planCode,
      activation_run: false,
      recall_provider: "brightdata_dataset",
      recall_spec: normalizeRecallSpec(
        (search as SearchRow).parsed_requirements?.recall_spec,
        context.candidateCount,
      ),
    }
    : await parseJobDescription(context, (search as SearchRow).parsed_requirements);

  parsed.recall_provider = "brightdata_dataset";
  parsed.recall_spec = normalizeRecallSpec(parsed.recall_spec, context.candidateCount, {
    recordLimitOverride: initialExecutionProfile.filterLimit,
  });
  const phase1Parsed = withExecutionState(parsed, initialExecutionProfile, {
    planCode,
    displayCount: initialExecutionProfile.finalResultCap,
  });

  const phase1Result = await buildBrightDataDatasetCandidates(
    context,
    phase1Parsed,
    initialExecutionProfile,
  );
  if (!phase1Result) {
    throw new Error("Bright Data recall did not return a pipeline result.");
  }

  await completeSearch(
    context,
    phase1Parsed,
    phase1Result.finalRows,
    buildSearchDisplayStats(phase1Result.displayStats),
    phase1Result.warningMessage,
    { runtime: getExecutionRuntime(initialExecutionProfile) },
  );
}

export async function processNextSearchJob(preferredSearchId?: string | null) {
  const job = await claimSearchJob({
    preferredSearchId,
    reclaimStaleRunningJobs,
  });
  if (!job) {
    return { processed: false, hasMore: false };
  }

  try {
    await runSearchPipeline(job);
    await updateRunningJobStatus(job.id, "done", {
      finished_at: nowIso(),
      locked_at: null,
      last_error: null,
    });
  } catch (error) {
    if (error instanceof DatasetRecallPendingError) {
      await updateRunningJobStatus(job.id, "queued", {
        available_at: new Date(Date.now() + error.retryDelayMs).toISOString(),
        locked_at: null,
        last_error: null,
      });
      return {
        processed: true,
        hasMore: await hasRunnableSearchJobs(),
      };
    }

    const message = error instanceof DatasetRecallPendingError
      ? "Bright Data snapshot is still processing. Retry from the shortlist page to download the existing snapshot."
      : error instanceof Error
        ? error.message
        : "Search job failed";
    const updated = await updateRunningJobStatus(
      job.id,
      "fatal_error",
      {
        available_at: null,
        last_error: message,
        locked_at: null,
        finished_at: nowIso(),
      },
    );

    if (!updated) {
      return {
        processed: true,
        hasMore: await hasRunnableSearchJobs(),
      };
    }

    const { count } = await supabaseAdmin
      .from("hirelix_candidates")
      .select("id", { count: "exact", head: true })
      .eq("search_id", job.search_id);

    if ((count || 0) > 0) {
      await markSearchDegraded(
        job.search_id,
        "The shortlist is still usable, but the remaining provider work did not finish. Retry from the page to continue with the existing snapshot.",
      );
    } else {
      await failSearch(job.search_id, message);
    }

    logSearchEvent("search_provider_failed", {
      search_id: job.search_id,
      reason: message,
      retryable: false,
      attempt_count: job.attempt_count,
      job_id: job.id,
    });
  }

  return {
    processed: true,
    hasMore: await hasRunnableSearchJobs(),
  };
}
