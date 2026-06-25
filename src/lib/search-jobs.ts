import {
  BrightDataRequestTimeoutError,
  BrightDataSnapshotNotReadyError,
  type BrightDataFilterRule,
  type BrightDataSnapshotMetadata,
} from "@/lib/brightdata";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { hirelix_searches } from "@/db/schema";
import {
  buildDeterministicWeakEvidenceOutreachDraft,
  buildRecruiterOutreachPrompt,
  buildRecruiterOutreachEvidence,
} from "@/lib/recruiter-outreach";
import {
  generateLlmJson,
  getDefaultLlmModel,
  getLightweightLlmModel,
  resolveDeepSeekThinkingMode,
} from "@/lib/llm-client";
import {
  buildOutreachDraftJsonSchema,
} from "@/lib/llm-schemas";
import {
  normalizeSearchPlanCode,
  type SearchExecutionProfile,
  type SearchPlanCode,
} from "@/lib/search-execution";
import { queueOrSendSearchNotification } from "@/lib/search-notifications";
import {
  BRIGHTDATA_STANDARD_LIMIT,
  DEEP_SCORING_BATCH_SIZE,
  ESTIMATED_DEEP_REVIEW_CONFLICT_RATE,
  ESTIMATED_SECOND_REVIEW_RATE,
  roundCurrency,
  SHORTLIST_CAPABILITY_MIN,
  SHORTLIST_JOIN_LIKELIHOOD_MIN,
  SHORTLIST_MATCH_SCORE_MIN,
  SHORTLIST_RELEVANCE_MIN,
  estimateDeepSeekProLlmCallCost,
  estimateLlmCallCost,
  estimateSearchIntentCost,
  estimateTokensFromText,
} from "@/lib/search/config";
import {
  withTimeout,
} from "@/lib/search/concurrency";
import {
  claimSearchJob,
  enqueueSearchJob,
  hasRunnableSearchJobs,
  kickSearchJobRunner,
  hasSearchJobStartedPipeline,
  reclaimStaleRunningJobs as reclaimStaleRunningJobsInternal,
  resolveSearchJobRunnerBaseUrl,
  startSearchJobHeartbeat,
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
  normalizeStringArray,
  normalizeSummaryTerms,
  normalizeText,
  nowIso,
  truncateForPrompt,
} from "@/lib/search/normalize";
import {
  countCandidatesForSearch,
  setSearchStatus,
  updateSearchParsedRequirements,
  updateSearchUsageEventMetadata,
} from "@/lib/search/persistence";
import {
  sanitizeRecallSignalTerms,
  type RecallFilterMode,
} from "@/lib/search/recall";
import {
  DatasetRecallPendingError,
  ZeroRecallError,
  runSearchPipeline,
} from "@/lib/search/pipeline";
import { getLogger, errorLogFields } from "@/lib/logger";
import { PUBLIC_SEARCH_FAILURE_MESSAGE } from "@/lib/public-errors";
import type {
  AdvanceRecommendation,
  AdvancementRubric,
  BlockingSeverity,
  CandidateDisplayTier,
  CandidateRowInput,
  CandidateSuitability,
  CompanyProfile,
  ConstraintVerdict,
  ExcludedReason,
  ExcludedReasonCount,
  HiringBrief,
  PipelineContext,
  RecallMetadata,
  RecallPersona,
  RecallProvider,
  RecallSpec,
  ScoredCandidateAssessment,
  SearchCostEstimate,
  SearchDisplayStats,
  SearchQualityDiagnosis,
  SearchExecutionRuntime,
  SearchRow,
  ShortlistDecision,
  AdditionalRecallSnapshot,
  SourcingLane,
} from "@/lib/search/types";
export {
  enqueueSearchJob,
  hasSearchJobStartedPipeline,
  kickSearchJobRunner,
  resolveSearchJobRunnerBaseUrl,
};

const searchJobLogger = getLogger({ component: "search_jobs" });

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
    matchers: [/seattle|bellevue|redmond|kirkland/i],
    strict: [
      "seattle",
      "seattle metropolitan area",
      "bellevue",
      "redmond",
      "kirkland",
    ],
    nearby: ["tacoma", "everett"],
    geoStrategy:
      "Treat Seattle, Bellevue, Redmond, and Kirkland as one Puget Sound hiring market.",
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

const KNOWN_CITY_LOCATION_TERMS = [
  "san francisco",
  "new york city",
  "new york",
  "nyc",
  "seattle",
  "bay area",
  "bellevue",
  "redmond",
  "kirkland",
  "oakland",
  "san jose",
  "palo alto",
  "mountain view",
  "brooklyn",
  "manhattan",
  "queens",
  "bronx",
];

function expandCompositeLocationTerms(values: string[], maxItems: number) {
  const expanded: string[] = [];
  for (const value of values) {
    const normalized = normalizeText(value);
    const explicitParts = normalized
      .split(/\s*(?:,|;|\/|\bor\b|\band\b)\s*/i)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3);
    const parts = explicitParts.length > 1 ? explicitParts : [normalized];

    for (const part of parts) {
      const matchedKnownTerms = KNOWN_CITY_LOCATION_TERMS.filter((term) => part.includes(term));
      if (matchedKnownTerms.length >= 2) {
        expanded.push(...matchedKnownTerms);
      } else {
        expanded.push(part);
      }
    }
  }
  return compactNormalizedTerms(expanded, maxItems);
}

export function deriveGeoStrategy(locationScope: string | null) {
  const normalized = normalizeText(locationScope).replace(/\b(remote|hybrid|onsite|on site)\b/g, " ").trim();
  if (!normalized) {
    return {
      strictTerms: [] as string[],
      nearbyTerms: [] as string[],
      geoStrategy: null as string | null,
    };
  }

  const locationParts = normalized
    .split(/\s*(?:,|;|\/|\bor\b|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const baseTerms = compactNormalizedTerms(
    locationParts.length > 1 ? locationParts : [normalized],
    12,
  );
  const allowlists = GEO_ALLOWLISTS.filter((entry) =>
    entry.matchers.some((matcher) => matcher.test(normalized)),
  );

  if (allowlists.length === 0) {
    return {
      strictTerms: baseTerms,
      nearbyTerms: [],
      geoStrategy:
        baseTerms.length > 0
          ? `Treat ${baseTerms[0]} as the primary local market and avoid obvious out-of-region candidates.`
          : null,
    };
  }

  const strictTerms = compactNormalizedTerms(
    [
      ...baseTerms,
      ...allowlists.flatMap((entry) => entry.strict),
    ],
    24,
  );
  const nearbyTerms = compactNormalizedTerms(
    allowlists.flatMap((entry) => entry.nearby),
    16,
  );

  return {
    strictTerms,
    nearbyTerms,
    geoStrategy: allowlists.map((entry) => entry.geoStrategy).join(" "),
  };
}

export function normalizeRecallSpec(
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
  const location_terms = expandCompositeLocationTerms(
    normalizeStringArray(item.location_terms, 24),
    24,
  );
  const strict_location_terms = expandCompositeLocationTerms(
    normalizeStringArray(item.strict_location_terms ?? item.location_terms, 24),
    24,
  );
  const nearby_location_terms = expandCompositeLocationTerms(
    normalizeStringArray(item.nearby_location_terms, 16),
    16,
  );
  const must_have_signals = sanitizeRecallSignalTerms(normalizeStringArray(item.must_have_signals, 12), 12);
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
  const sourcing_lanes = normalizeSourcingLanes(item.sourcing_lanes);
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
    sourcingLanes: sourcing_lanes,
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
    sourcing_lanes,
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

export function isPlaceholderTitle(title: string | null | undefined) {
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

export function buildRecallLocationFilter(
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
    20,
  ).filter((term) => !countryAliases.has(term));

  if (nonCountryLocationTerms.length === 0) {
    return null;
  }

  const strictModeTerms = compactNormalizedTerms(
    [...strictLocationTerms, ...nearbyLocationTerms],
    20,
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

function buildStandardAnchorTerms(recallSpec: RecallSpec) {
  return compactNormalizedTerms(
    [
      ...recallSpec.domain_terms,
      ...recallSpec.differentiating_skill_terms,
      ...recallSpec.must_have_signals,
    ]
      .map((term) => normalizeText(term))
      .filter((term) => {
        if (term.length < 3) return false;
        if (/\b(?:years?|yrs?)\b/.test(term)) return false;
        if (/\b(?:us|remote|hybrid|relocat|sf|nyc|seattle|bay area)\b/.test(term)) return false;
        return /\b(?:search|retrieval|ranking|backend|api|distributed|platform|infrastructure|database|postgres|postgresql)\b/.test(term);
      }),
    3,
  );
}

function buildProfileSignalFilter(terms: string[]): BrightDataFilterRule | null {
  const normalizedTerms = compactNormalizedTerms(
    terms
      .map((term) => normalizeText(term))
      .filter((term) => term.length >= 2),
    8,
  );
  if (normalizedTerms.length === 0) return null;

  return {
    operator: "or",
    filters: [
      ...normalizedTerms.map((term) => ({
        name: "about",
        operator: "includes" as const,
        value: term,
      })),
      ...normalizedTerms.map((term) => ({
        name: "position",
        operator: "includes" as const,
        value: term,
      })),
    ].slice(0, 16),
  };
}

export function buildStandardSkillFilter(recallSpec: RecallSpec, mode: RecallFilterMode): BrightDataFilterRule | null {
  const standardSkillFilter = buildProfileSignalFilter([
    ...buildStandardSkillTerms(recallSpec, mode),
    ...(mode === "primary" ? buildStandardAnchorTerms(recallSpec) : []),
  ]);
  if (!standardSkillFilter) return null;
  return standardSkillFilter;
}

function deriveStableRecallStrategy(input: {
  requestedStrategy: RecallSpec["recall_strategy"];
  differentiatingSkillTerms: string[];
  lateralTitleVariants: string[];
  targetCompanies: string[];
  sourcingLanes?: SourcingLane[];
  roleBreadth: RecallSpec["role_breadth"];
  recallConfidence: RecallSpec["recall_confidence"];
}) {
  if ((input.sourcingLanes ?? []).length >= 2) {
    return "multi_round" as const;
  }

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

function normalizeSourcingLanes(value: unknown): SourcingLane[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((rawLane) => {
      const lane = rawLane && typeof rawLane === "object"
        ? (rawLane as Record<string, unknown>)
        : {};
      const strategy = normalizeEnumValue(
        lane.strategy,
        ["title", "skill", "seniority", "company"] as const,
        "title",
      );
      const titleTerms = normalizeStringArray(lane.title_terms, 18);
      const skillTerms = sanitizeRecallSignalTerms(normalizeStringArray(lane.skill_terms, 18), 18);
      const companyTerms = normalizeStringArray(lane.company_terms, 15);
      const avoidTerms = normalizeStringArray(lane.avoid_terms, 8);
      const hasSearchSurface =
        titleTerms.length > 0 ||
        skillTerms.length > 0 ||
        companyTerms.length > 0;
      if (!hasSearchSurface) return null;

      const rawWeight = typeof lane.budget_weight === "number" && Number.isFinite(lane.budget_weight)
        ? lane.budget_weight
        : 1;

      return {
        name: normalizeNullableString(lane.name) || strategy,
        strategy,
        title_terms: titleTerms,
        skill_terms: skillTerms,
        company_terms: companyTerms,
        avoid_terms: avoidTerms,
        budget_weight: Math.max(0.25, Math.min(4, rawWeight)),
      } satisfies SourcingLane;
    })
    .filter((lane): lane is SourcingLane => Boolean(lane))
    .slice(0, 4);
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

export function isTransientSnapshotDownloadError(error: unknown) {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth += 1) {
    messages.push(current instanceof Error ? current.message.toLowerCase() : String(current).toLowerCase());
    current = current instanceof Error ? current.cause : null;
  }
  const message = messages.join(" ");
  return (
    error instanceof BrightDataSnapshotNotReadyError ||
    error instanceof BrightDataRequestTimeoutError ||
    /\b(?:408|429|500|502|503|504|524)\b/.test(message) ||
    message.includes("connection_closed") ||
    message.includes("connect_timeout") ||
    message.includes("bad gateway") ||
    message.includes("service unavailable") ||
    message.includes("gateway timeout") ||
    message.includes("too many requests") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("epipe") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("socket")
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
    24,
  );
  const locationTerms = compactNormalizedTerms(
    [
      ...recallSpec.location_terms,
      ...derivedLocationTerms,
    ],
    24,
  );
  const mustHaveSignals = sanitizeRecallSignalTerms([
    ...recallSpec.must_have_signals,
    ...deriveMustHaveSignalsFromParsed(parsed, jdText),
  ], 12);
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
    location_terms: expandCompositeLocationTerms(locationTerms, 24),
    strict_location_terms: expandCompositeLocationTerms(
      [
        ...recallSpec.strict_location_terms,
        ...geo.strictTerms,
      ],
      24,
    ),
    nearby_location_terms: expandCompositeLocationTerms(
      [
        ...recallSpec.nearby_location_terms,
        ...geo.nearbyTerms,
      ],
      16,
    ),
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
    ...(typeof overrides.bright_snapshot_cost === "number" &&
    Number.isFinite(overrides.bright_snapshot_cost) &&
    overrides.bright_snapshot_cost > 0
      ? { bright_snapshot_cost: overrides.bright_snapshot_cost }
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
    ...(typeof overrides.fast_judge_count === "number"
      ? { fast_judge_count: Math.max(0, Math.round(overrides.fast_judge_count)) }
      : {}),
    ...(typeof overrides.deep_judge_count === "number"
      ? { deep_judge_count: Math.max(0, Math.round(overrides.deep_judge_count)) }
      : {}),
    ...(typeof overrides.arbiter_count === "number"
      ? { arbiter_count: Math.max(0, Math.round(overrides.arbiter_count)) }
      : {}),
    ...(typeof overrides.fast_judge_wall_time_ms === "number" && Number.isFinite(overrides.fast_judge_wall_time_ms)
      ? { fast_judge_wall_time_ms: Math.max(0, Math.round(overrides.fast_judge_wall_time_ms)) }
      : {}),
    ...(typeof overrides.deep_judge_wall_time_ms === "number" && Number.isFinite(overrides.deep_judge_wall_time_ms)
      ? { deep_judge_wall_time_ms: Math.max(0, Math.round(overrides.deep_judge_wall_time_ms)) }
      : {}),
    ...(typeof overrides.llm_wall_time_ms === "number" && Number.isFinite(overrides.llm_wall_time_ms)
      ? { llm_wall_time_ms: Math.max(0, Math.round(overrides.llm_wall_time_ms)) }
      : {}),
    ...(typeof overrides.llm_input_tokens === "number"
      ? { llm_input_tokens: Math.max(0, Math.round(overrides.llm_input_tokens)) }
      : {}),
    ...(typeof overrides.llm_output_tokens === "number"
      ? { llm_output_tokens: Math.max(0, Math.round(overrides.llm_output_tokens)) }
      : {}),
    ...(typeof overrides.llm_cached_input_tokens === "number"
      ? { llm_cached_input_tokens: Math.max(0, Math.round(overrides.llm_cached_input_tokens)) }
      : {}),
    ...(typeof overrides.llm_cache_miss_input_tokens === "number"
      ? { llm_cache_miss_input_tokens: Math.max(0, Math.round(overrides.llm_cache_miss_input_tokens)) }
      : {}),
    ...(typeof overrides.llm_actual_estimated_cost === "number"
      ? { llm_actual_estimated_cost: Math.max(0, overrides.llm_actual_estimated_cost) }
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
    ...(typeof overrides.promised_candidate_count === "number"
      ? { promised_candidate_count: Math.max(0, Math.round(overrides.promised_candidate_count)) }
      : {}),
    ...(typeof overrides.delivered_candidate_count === "number"
      ? { delivered_candidate_count: Math.max(0, Math.round(overrides.delivered_candidate_count)) }
      : {}),
    ...(typeof overrides.shortlist_underfilled === "boolean"
      ? { shortlist_underfilled: overrides.shortlist_underfilled }
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
    ...(typeof overrides.lower_priority_count === "number"
      ? { lower_priority_count: Math.max(0, Math.round(overrides.lower_priority_count)) }
      : {}),
    ...(typeof overrides.recommended_count === "number"
      ? { recommended_count: Math.max(0, Math.round(overrides.recommended_count)) }
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
    ...(overrides.search_quality_diagnosis
      ? { search_quality_diagnosis: normalizeSearchQualityDiagnosis(overrides.search_quality_diagnosis) ?? overrides.search_quality_diagnosis }
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

  const judgeBatchSize = Math.max(1, Math.min(DEEP_SCORING_BATCH_SIZE, params.selectedCount || 1));
  const primaryJudgeBatchCount = Math.ceil(params.selectedCount / judgeBatchSize);
  const avgPrimaryJudgeBatchSize =
    primaryJudgeBatchCount > 0 ? params.selectedCount / primaryJudgeBatchCount : 1;
  const primaryJudgeInputTokens =
    searchContextTokens + truncatedJdTokens + Math.ceil(avgProfileTokens * avgPrimaryJudgeBatchSize) + 260;
  const primaryJudgeOutputTokens = Math.min(Math.ceil(260 * avgPrimaryJudgeBatchSize), 20000);
  const primaryJudgeCost =
    primaryJudgeBatchCount * estimateLlmCallCost(primaryJudgeInputTokens, primaryJudgeOutputTokens);
  const secondReviewCount =
    params.runtime.judgeMode === "dual"
      ? Math.round(params.selectedCount * ESTIMATED_SECOND_REVIEW_RATE)
      : 0;
  const secondReviewBatchCount = Math.ceil(secondReviewCount / judgeBatchSize);
  const avgSecondReviewBatchSize =
    secondReviewBatchCount > 0 ? secondReviewCount / secondReviewBatchCount : 0;
  const secondReviewJudgeCost =
    secondReviewBatchCount > 0
      ? secondReviewBatchCount * estimateLlmCallCost(
          searchContextTokens + truncatedJdTokens + Math.ceil(avgProfileTokens * avgSecondReviewBatchSize) + 260,
          Math.min(Math.ceil(260 * avgSecondReviewBatchSize), 20000),
        )
      : 0;
  const judgeCost = primaryJudgeCost + secondReviewJudgeCost;

  const arbiterCallCount =
    params.runtime.judgeMode === "dual"
      ? Math.round(secondReviewCount * ESTIMATED_DEEP_REVIEW_CONFLICT_RATE)
      : 0;
  const arbiterInputTokens = searchContextTokens + truncatedJdTokens + avgProfileTokens + 320;
  const arbiterOutputTokens = Math.min(params.runtime.arbiterMaxOutputTokens, 220);
  const arbiterCost =
    arbiterCallCount * estimateDeepSeekProLlmCallCost(arbiterInputTokens, arbiterOutputTokens);

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

function normalizeRecallPersona(value: unknown): RecallPersona | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = normalizeNullableString(item.id);
  const round = normalizeNullableString(item.round);
  const label = normalizeNullableString(item.label);
  const intent = normalizeNullableString(item.intent);
  if (!id || !round || !label || !intent) return null;
  const kind = normalizeEnumValue(
    item.kind,
    [
      "standard_ic",
      "adjacent_strong",
      "target_company",
      "skill_depth",
      "seniority_depth",
    ] as const,
    "standard_ic",
  );
  return {
    id,
    round,
    kind,
    label,
    intent,
    title_terms: normalizeStringArray(item.title_terms, 18),
    skill_terms: normalizeStringArray(item.skill_terms, 18),
    company_terms: normalizeStringArray(item.company_terms, 15),
  };
}

function normalizeSearchQualityDiagnosis(value: unknown): SearchQualityDiagnosis | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const normalizeCount = (entry: unknown) =>
    typeof entry === "number" && Number.isFinite(entry)
      ? Math.max(0, Math.round(entry))
      : 0;
  const primaryIssue = normalizeEnumValue(
    item.primary_issue,
    [
      "healthy",
      "recall_underfilled",
      "weak_actionable_yield",
      "missing_reach_first",
      "review_pool_underfilled",
      "needs_search_calibration",
    ] as const,
    "needs_search_calibration",
  );
  return {
    status: item.status === "meets_bar" ? "meets_bar" : "needs_calibration",
    primary_issue: primaryIssue,
    requested_count: normalizeCount(item.requested_count),
    returned_count: normalizeCount(item.returned_count),
    strict_advance_count: normalizeCount(item.strict_advance_count),
    reach_first_count: normalizeCount(item.reach_first_count),
    review_next_count: normalizeCount(item.review_next_count),
    recommended_count: normalizeCount(item.recommended_count),
    target_requested_count: normalizeCount(item.target_requested_count),
    target_returned_count: normalizeCount(item.target_returned_count),
    target_strict_advance_count: normalizeCount(item.target_strict_advance_count),
    target_reach_first_count: normalizeCount(item.target_reach_first_count),
    target_review_next_count: normalizeCount(item.target_review_next_count),
    notes: normalizeStringArray(item.notes, 8),
  };
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
    display_count: options.displayCount ?? executionProfile.deliveryReferenceCount,
  };
}

function isActivationRun(parsed: Record<string, unknown> | null | undefined) {
  return parsed?.activation_run === true;
}

export function normalizeRecallMetadata(value: unknown): RecallMetadata | null {
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
    typeof item.cost === "number" && Number.isFinite(item.cost) && item.cost > 0
      ? item.cost
      : null;
  const cost_source =
    cost != null && (item.cost_source === "metadata" || item.cost_source === "balance_delta")
      ? item.cost_source
      : null;
  const bright_balance_before =
    typeof item.bright_balance_before === "number" && Number.isFinite(item.bright_balance_before)
      ? item.bright_balance_before
      : null;
  const bright_balance_after =
    typeof item.bright_balance_after === "number" && Number.isFinite(item.bright_balance_after)
      ? item.bright_balance_after
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
  const recall_personas = Array.isArray(item.recall_personas)
    ? item.recall_personas
      .map(normalizeRecallPersona)
      .filter((entry): entry is RecallPersona => Boolean(entry))
    : [];
  const additional_snapshots = Array.isArray(item.additional_snapshots)
    ? item.additional_snapshots
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const snapshot = entry as Record<string, unknown>;
        const round = normalizeNullableString(snapshot.round);
        const snapshotId = normalizeNullableString(snapshot.snapshot_id);
        if (!round) return null;
        const records_limit =
          typeof snapshot.records_limit === "number" && Number.isFinite(snapshot.records_limit)
            ? Math.max(0, Math.round(snapshot.records_limit))
            : null;
        const requested_count =
          typeof snapshot.requested_count === "number" && Number.isFinite(snapshot.requested_count)
            ? Math.max(0, Math.round(snapshot.requested_count))
            : null;
        const filter_hash = normalizeNullableString(snapshot.filter_hash);
        const submitted_at = normalizeNullableString(snapshot.submitted_at);
        const ready_at = normalizeNullableString(snapshot.ready_at);
        const failed_at = normalizeNullableString(snapshot.failed_at);
        const failure_code = normalizeNullableString(snapshot.failure_code);
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
          requested_count,
          filter_hash,
          submitted_at,
          ready_at,
          failed_at,
          failure_code,
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
  const round_diagnostics = Array.isArray(item.round_diagnostics)
    ? item.round_diagnostics
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const diagnostic = entry as Record<string, unknown>;
        const round = normalizeNullableString(diagnostic.round);
        if (!round) return null;
        const skillGroups =
          diagnostic.skill_signal_groups && typeof diagnostic.skill_signal_groups === "object"
            ? diagnostic.skill_signal_groups as Record<string, unknown>
            : {};
        const qualityDistribution =
          diagnostic.quality_distribution && typeof diagnostic.quality_distribution === "object"
            ? diagnostic.quality_distribution as Record<string, unknown>
            : null;
        const normalizeCount = (value: unknown) =>
          typeof value === "number" && Number.isFinite(value)
            ? Math.max(0, Math.round(value))
            : 0;
        return {
          round,
          requested_count: normalizeCount(diagnostic.requested_count),
          returned_count:
            typeof diagnostic.returned_count === "number" && Number.isFinite(diagnostic.returned_count)
              ? Math.max(0, Math.round(diagnostic.returned_count))
              : null,
          filter_hash: normalizeNullableString(diagnostic.filter_hash),
          title_terms: normalizeStringArray(diagnostic.title_terms, 12),
          skill_signal_groups: {
            search_domain: normalizeStringArray(skillGroups.search_domain, 12),
            platform_engineering: normalizeStringArray(skillGroups.platform_engineering, 12),
          },
          location_mode:
            diagnostic.location_mode === "country_only" ? "country_only" as const : "location_filter" as const,
          persona: normalizeRecallPersona(diagnostic.persona),
          quality_distribution: qualityDistribution
            ? {
              strong_now: normalizeCount(qualityDistribution.strong_now),
              consider_next: normalizeCount(qualityDistribution.consider_next),
              do_not_show: normalizeCount(qualityDistribution.do_not_show),
              total_scored: normalizeCount(qualityDistribution.total_scored),
            }
            : null,
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
      location_terms: normalizeStringArray(rawFilterSummary.location_terms, 24),
      strict_location_terms: normalizeStringArray(rawFilterSummary.strict_location_terms, 24),
      nearby_location_terms: normalizeStringArray(rawFilterSummary.nearby_location_terms, 16),
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
    cost_source,
    bright_balance_before,
    bright_balance_after,
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
    recall_personas,
    additional_snapshots,
    round_diagnostics,
    status:
      status === "submitted" || status === "polling" || status === "ready"
        ? status
        : undefined,
    filter_summary,
  };
}

function buildAdditionalSnapshotMetadata(params: {
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
}) {
  const existing = params.existing ?? null;
  const readyAt = params.readyAt ?? existing?.ready_at ?? null;
  const failedAt = params.clearFailure ? null : params.failedAt ?? existing?.failed_at ?? null;
  const failureCode = params.clearFailure ? null : params.failureCode ?? existing?.failure_code ?? null;
  return {
    round: params.round,
    snapshot_id: params.snapshotId ?? existing?.snapshot_id ?? null,
    records_limit: params.recordsLimit ?? existing?.records_limit ?? null,
    requested_count: params.recordsLimit ?? existing?.requested_count ?? null,
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
  totalProfileScanBudget?: number,
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
    metadata.bright_profile_budget === (
      typeof totalProfileScanBudget === "number" && Number.isFinite(totalProfileScanBudget)
        ? Math.max(0, Math.round(totalProfileScanBudget))
        : executionProfile.filterLimit
    );
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

const BACKEND_LANGUAGE_SKILLS = new Map([
  ["python", "Python"],
  ["typescript", "TypeScript"],
  ["javascript", "JavaScript"],
  ["go", "Go"],
  ["golang", "Go"],
  ["java", "Java"],
  ["rust", "Rust"],
  ["scala", "Scala"],
  ["kotlin", "Kotlin"],
  ["c++", "C++"],
]);

function normalizeRequiredSkillAlternatives(skills: string[]) {
  const languageLabels: string[] = [];
  const otherSkills: string[] = [];

  for (const skill of skills) {
    const normalized = normalizeText(skill);
    const languageLabel = BACKEND_LANGUAGE_SKILLS.get(normalized);
    if (languageLabel) {
      if (!languageLabels.includes(languageLabel)) {
        languageLabels.push(languageLabel);
      }
      continue;
    }
    otherSkills.push(skill);
  }

  if (languageLabels.length < 3) {
    return skills;
  }

  return [
    `one production backend language (${languageLabels.join(", ")})`,
    ...otherSkills,
  ].slice(0, 12);
}

export function sanitizeHiringBrief(value: unknown, fallbackParsed: Record<string, unknown>): HiringBrief {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const roleCore =
    item.role_core && typeof item.role_core === "object"
      ? (item.role_core as Record<string, unknown>)
      : {};

  const fallbackRequired = normalizeStringArray(fallbackParsed.required_skills, 12);
  const fallbackNiceToHave = normalizeStringArray(fallbackParsed.nice_to_have_skills, 12);
  const rawRequiredSkills =
    normalizeStringArray(roleCore.required_skills, 12).length > 0
      ? normalizeStringArray(roleCore.required_skills, 12)
      : fallbackRequired;

  return {
    role_core: {
      title: normalizeNullableString(roleCore.title) || normalizeNullableString(fallbackParsed.title),
      seniority:
        normalizeNullableString(roleCore.seniority) ||
        normalizeNullableString(fallbackParsed.seniority),
      function_focus: normalizeNullableString(roleCore.function_focus),
      required_skills: normalizeRequiredSkillAlternatives(rawRequiredSkills),
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

export function sanitizeAdvancementRubric(
  value: unknown,
  parsed: Record<string, unknown>,
): AdvancementRubric {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const recallSpec = normalizeRecallSpec(parsed.recall_spec, Number(parsed.candidate_count) || 5);
  const title = normalizeNullableString(parsed.title) || hiringBrief.role_core.title || "this role";
  const functionFocus = hiringBrief.role_core.function_focus;
  const mustHaveSignals = recallSpec.must_have_signals.length > 0
    ? recallSpec.must_have_signals
    : hiringBrief.role_core.required_skills;
  const sameWorkEvidence = normalizeStringArray(item.same_work_evidence, 5);
  const seniorityEvidence = normalizeStringArray(item.seniority_evidence, 5);
  const mustHaveEvidence = normalizeStringArray(item.must_have_evidence, 6);
  const acceptableTradeoffs = normalizeStringArray(item.acceptable_tradeoffs, 5);
  const rejectSignals = normalizeStringArray(item.reject_signals, 6);

  return {
    same_work_evidence: sameWorkEvidence.length > 0
      ? sameWorkEvidence
      : [
        functionFocus
          ? `Current profile evidence shows work in ${functionFocus}.`
          : `Current profile evidence shows work comparable to ${title}.`,
        mustHaveSignals.length > 0
          ? `Recent role evidence connects to ${mustHaveSignals.slice(0, 4).join(", ")}.`
          : "Recent role evidence matches the JD's day-to-day problem space.",
      ],
    seniority_evidence: seniorityEvidence.length > 0
      ? seniorityEvidence
      : [
        hiringBrief.role_core.seniority
          ? `Scope matches ${hiringBrief.role_core.seniority}, not just the title string.`
          : "Scope, ownership, and complexity match the level implied by the JD.",
      ],
    must_have_evidence: mustHaveEvidence.length > 0
      ? mustHaveEvidence
      : mustHaveSignals.slice(0, 6).map((signal) => `Concrete profile evidence for ${signal}.`),
    acceptable_tradeoffs: acceptableTradeoffs.length > 0
      ? acceptableTradeoffs
      : [
        "Different title is acceptable when profile evidence shows equivalent work.",
        "Missing exact tool wording is acceptable when comparable system ownership is explicit.",
      ],
    reject_signals: rejectSignals.length > 0
      ? rejectSignals
      : [
        "Only title, employer brand, target-company membership, or loose keywords support the match.",
        "Profile evidence is mostly unrelated to the JD's core work.",
        ...hiringBrief.must_have_constraints
          .slice(0, 3)
          .map((constraint) => `Clear mismatch on ${constraint}.`),
      ].slice(0, 6),
  };
}

export function buildPromptSearchContext(parsed: Record<string, unknown>) {
  const hiringBrief = sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const advancementRubric = sanitizeAdvancementRubric(parsed.advancement_rubric, parsed);
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
  if (
    hiringBrief.relocation_allowed === "yes" &&
    hiringBrief.location_flexibility !== "strict"
  ) {
    lines.push(
      "Location Policy: US candidates outside target metros are eligible when the technical fit is strong; treat current non-local location as a preference/risk signal, not a hard blocker, unless the profile explicitly cannot work hybrid or relocate.",
    );
  } else if (
    hiringBrief.location_flexibility === "strict" &&
    hiringBrief.relocation_allowed === "no"
  ) {
    lines.push(
      "Location Policy: this is a strict local role; only local/nearby candidates or candidates with explicit target-location evidence should be shortlisted.",
    );
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
  lines.push("Advancement Rubric:");
  if (advancementRubric.same_work_evidence.length > 0) {
    lines.push(`- Same Work Evidence: ${advancementRubric.same_work_evidence.join(" | ")}`);
  }
  if (advancementRubric.seniority_evidence.length > 0) {
    lines.push(`- Seniority Evidence: ${advancementRubric.seniority_evidence.join(" | ")}`);
  }
  if (advancementRubric.must_have_evidence.length > 0) {
    lines.push(`- Must-Have Evidence: ${advancementRubric.must_have_evidence.join(" | ")}`);
  }
  if (advancementRubric.acceptable_tradeoffs.length > 0) {
    lines.push(`- Acceptable Tradeoffs: ${advancementRubric.acceptable_tradeoffs.join(" | ")}`);
  }
  if (advancementRubric.reject_signals.length > 0) {
    lines.push(`- Reject Signals: ${advancementRubric.reject_signals.join(" | ")}`);
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

  // Current location alone is not an explicit incompatibility. Keep hard only
  // when work-model evidence says the candidate cannot satisfy the role.
  if (constraintVerdicts.work_model_fit === "no") return "hard";
  if (constraintVerdicts.location_fit === "non_local") return "soft";

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

export function computeAdvanceScore(
  capabilityScore: number,
  relevanceScore: number,
  joinLikelihoodScore: number,
  blockingSeverity: BlockingSeverity,
) {
  // Reachability carries lower weight in passive sourcing: a technically strong
  // but hard-to-reach candidate is exactly what recruiters pay us to surface.
  // Reachability still informs outreach strategy via its own score, but should
  // not dominate the shortlist gate.
  const baseScore = Math.round(
    capabilityScore * 0.35 + relevanceScore * 0.45 + joinLikelihoodScore * 0.2,
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
  if (
    params.qualityScore >= 75 &&
    params.overallScore >= 40 &&
    ["strong", "partial"].includes(params.constraintVerdicts.must_have_coverage)
  ) {
    return "consider_next";
  }
  if (params.overallScore < params.minVisibleQualityScore) return "do_not_show";
  return "consider_next";
}

function calibrateConstraintVerdictsForScores(
  verdicts: ConstraintVerdict,
  capabilityScore: number,
  relevanceScore: number,
): ConstraintVerdict {
  if (verdicts.must_have_coverage !== "weak") return verdicts;
  if (capabilityScore < SHORTLIST_CAPABILITY_MIN || relevanceScore < SHORTLIST_RELEVANCE_MIN) {
    return verdicts;
  }

  return {
    ...verdicts,
    must_have_coverage: relevanceScore >= 85 ? "strong" : "partial",
  };
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
  const constraintVerdicts = calibrateConstraintVerdictsForScores(
    sanitizeConstraintVerdicts(item.constraint_verdicts),
    capabilityScore,
    relevanceScore,
  );
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
  const bucket = deriveSuitabilityBucket({
    qualityScore,
    overallScore: advanceScore,
    advanceRecommendation,
    blockingSeverity,
    constraintVerdicts,
    strictLocalRole: false,
    minVisibleQualityScore: 60,
  });
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

function hasClearRoleMismatch(suitability: CandidateSuitability) {
  const text = [
    suitability.primary_risk,
    suitability.shortlist_reason,
    ...suitability.blocking_constraints,
    ...suitability.constraint_risks,
    ...suitability.risk_flags,
    ...suitability.why_not_higher,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");

  if (!text) return false;
  return [
    "role seniority mismatch",
    "seniority mismatch",
    "leadership focus",
    "managerial focus",
    "management focus",
    "program manager",
    "project manager",
    "seeking executive",
    "management roles",
    "not an ic",
    "not ic",
  ].some((term) => text.includes(term));
}

function hasActiveJobSearchSignal(suitability: CandidateSuitability) {
  const text = [
    suitability.primary_risk,
    suitability.shortlist_reason,
    ...suitability.blocking_constraints,
    ...suitability.constraint_risks,
    ...suitability.risk_flags,
    ...suitability.why_this_candidate,
    ...suitability.why_not_higher,
    ...suitability.scoring_breakdown.join_likelihood_reasons,
  ]
    .map((value) => normalizeText(value))
    .filter(Boolean)
    .join(" ");

  if (!text) return false;
  return [
    "actively looking",
    "active looking",
    "looking for new",
    "looking for opportunities",
    "open to work",
    "opentowork",
    "open to opportunities",
    "seeking new",
    "seeking opportunities",
    "available immediately",
    "c2c",
    "c2h",
  ].some((term) => text.includes(term));
}

function hasRecruiterVisibleEvidence(suitability: CandidateSuitability) {
  const verdicts = suitability.constraint_verdicts;
  const breakdown = suitability.scoring_breakdown;

  if (suitability.evidence_quality === "low") return false;
  if (verdicts.location_fit !== "local" && verdicts.location_fit !== "nearby") return false;
  if (verdicts.work_model_fit === "no") return false;
  if (verdicts.must_have_coverage === "weak" || verdicts.must_have_coverage === "unknown") {
    return false;
  }

  if (verdicts.must_have_coverage === "strong") {
    return breakdown.capability_score >= SHORTLIST_CAPABILITY_MIN &&
      breakdown.relevance_score >= Math.min(SHORTLIST_RELEVANCE_MIN, 65);
  }

  if (
    suitability.bucket === "consider_next" &&
    suitability.quality_score >= 76 &&
    breakdown.capability_score >= 75 &&
    (
      (
        suitability.first_contact_confidence === "high" &&
        breakdown.relevance_score >= SHORTLIST_RELEVANCE_MIN
      ) ||
      (
        breakdown.capability_score >= 85 &&
        suitability.quality_score >= 78 &&
        breakdown.relevance_score >= Math.min(SHORTLIST_RELEVANCE_MIN, 70) &&
        breakdown.join_likelihood_score >= 40
      )
    )
  ) {
    return true;
  }

  return (
    suitability.quality_score >= 78 &&
    breakdown.capability_score >= 75 &&
    breakdown.relevance_score >= 72
  );
}

export function shouldDisplayCandidate(assessment: ScoredCandidateAssessment) {
  const suitability = assessment.suitability;
  const breakdown = suitability.scoring_breakdown;

  if (
    suitability.blocking_severity === "hard" ||
    suitability.bucket === "do_not_show" ||
    hasClearRoleMismatch(suitability) ||
    (suitability.match_score < SHORTLIST_MATCH_SCORE_MIN && suitability.quality_score < 75) ||
    breakdown.capability_score < SHORTLIST_CAPABILITY_MIN
  ) {
    return false;
  }

  if (!hasRecruiterVisibleEvidence(suitability)) {
    return false;
  }

  const recruiterApproved =
    suitability.shortlist_decision === "yes" &&
    breakdown.relevance_score >= Math.min(SHORTLIST_RELEVANCE_MIN, 60) &&
    breakdown.join_likelihood_score >= Math.min(SHORTLIST_JOIN_LIKELIHOOD_MIN, 30);

  const strongTechnicalFit =
    breakdown.relevance_score >= SHORTLIST_RELEVANCE_MIN &&
    breakdown.capability_score >= SHORTLIST_CAPABILITY_MIN &&
    suitability.quality_score >= 70 &&
    breakdown.join_likelihood_score >= 20;

  const reviewableTechnicalFit =
    suitability.quality_score >= 75 &&
    breakdown.relevance_score >= 65 &&
    breakdown.join_likelihood_score >= 25;

  // Escape hatch for technically strong candidates whose reachability looks
  // low (happily employed senior engineers). This is the core passive-sourcing
  // use case; without this path, high-quality candidates get filtered out
  // before the recruiter ever sees them.
  const technicalWatchlistFit =
    suitability.quality_score >= 72 &&
    breakdown.relevance_score >= 68 &&
    breakdown.capability_score >= SHORTLIST_CAPABILITY_MIN &&
    ["strong", "partial"].includes(suitability.constraint_verdicts.must_have_coverage);

  return (
    recruiterApproved ||
    strongTechnicalFit ||
    reviewableTechnicalFit ||
    technicalWatchlistFit
  );
}

export function getDisplayTierForAssessment(
  assessment: ScoredCandidateAssessment,
): CandidateDisplayTier | null {
  if (!hasRecruiterVisibleEvidence(assessment.suitability)) {
    return null;
  }

  switch (assessment.suitability.bucket) {
    case "strong_now": {
      const breakdown = assessment.suitability.scoring_breakdown;
      const isFirstPriority =
        assessment.suitability.advance_recommendation === "advance" &&
        assessment.suitability.first_contact_confidence === "high" &&
        !hasActiveJobSearchSignal(assessment.suitability) &&
        assessment.suitability.evidence_quality !== "low" &&
        assessment.suitability.constraint_verdicts.must_have_coverage === "strong" &&
        assessment.suitability.constraint_verdicts.work_model_fit === "yes" &&
        breakdown.join_likelihood_score >= 55 &&
        assessment.suitability.quality_score >= 82 &&
        assessment.suitability.advance_score >= 78 &&
        breakdown.relevance_score >= 78 &&
        breakdown.capability_score >= 78;
      return isFirstPriority ? "priority_outreach" : "worth_reviewing";
    }
    case "consider_next":
      return "worth_reviewing";
    default:
      return null;
  }
}

export function deriveExcludedReason(assessment: ScoredCandidateAssessment): ExcludedReason {
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

  if (suitability.scoring_breakdown.join_likelihood_score < 35) {
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

function getJudgeModel() {
  return (
    process.env.SEARCH_JUDGE_MODEL ||
    process.env.OPENROUTER_JUDGE_MODEL ||
    process.env.AI_MODEL ||
    process.env.DEEPSEEK_JUDGE_MODEL ||
    process.env.DEEPSEEK_MODEL ||
    getDefaultLlmModel()
  );
}

function getArbiterModel() {
  return (
    process.env.SEARCH_ARBITER_MODEL ||
    process.env.OPENROUTER_ARBITER_MODEL ||
    process.env.DEEPSEEK_ARBITER_MODEL ||
    "deepseek-v4-pro"
  );
}

function getLightModel() {
  return (
    process.env.SEARCH_LIGHT_MODEL ||
    process.env.OPENROUTER_LIGHT_MODEL ||
    process.env.DEEPSEEK_LIGHT_MODEL ||
    process.env.AI_MODEL ||
    process.env.DEEPSEEK_MODEL ||
    getLightweightLlmModel()
  );
}


async function generateOutreachDraftsForRows(
  context: PipelineContext,
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  rows: CandidateRowInput[],
) {
  if (rows.length === 0) return rows;

  function fallbackDraftFor(row: ReturnType<typeof normalizeCandidateRowInput>) {
    const githubSignals =
      row.metadata.github_signals && typeof row.metadata.github_signals === "object"
        ? row.metadata.github_signals
        : null;
    const publicEvidence =
      row.metadata.public_evidence && typeof row.metadata.public_evidence === "object"
        ? row.metadata.public_evidence
        : null;
    const sellingKit =
      row.metadata.selling_kit && typeof row.metadata.selling_kit === "object"
        ? row.metadata.selling_kit
        : null;
    const evidence = buildRecruiterOutreachEvidence({
      name: row.name,
      headline: row.headline,
      location: row.location,
      skills: row.skills,
      matchReasons: row.match_reasons,
      githubSignals,
      publicEvidence,
      sellingKit,
    });
    const firstName = row.name.split(/\s+/).filter(Boolean)[0] || "there";
    return {
      ...row,
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

  const draftedRows = await Promise.all(
    rows.map(async (row) => {
      const normalizedRow = normalizeCandidateRowInput(row);
      if (normalizedRow.outreach_draft) return normalizedRow;
      const githubSignals =
        normalizedRow.metadata.github_signals && typeof normalizedRow.metadata.github_signals === "object"
          ? normalizedRow.metadata.github_signals
          : null;
      const publicEvidence =
        normalizedRow.metadata.public_evidence && typeof normalizedRow.metadata.public_evidence === "object"
          ? normalizedRow.metadata.public_evidence
          : null;
      const sellingKit =
        normalizedRow.metadata.selling_kit && typeof normalizedRow.metadata.selling_kit === "object"
          ? normalizedRow.metadata.selling_kit
          : null;
      const evidence = buildRecruiterOutreachEvidence({
        name: normalizedRow.name,
        headline: normalizedRow.headline,
        location: normalizedRow.location,
        skills: normalizedRow.skills,
        matchReasons: normalizedRow.match_reasons,
        githubSignals,
        publicEvidence,
        sellingKit,
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
          (signal) => generateLlmJson<{
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
                publicEvidence,
                sellingKit,
              },
            }),
            maxOutputTokens: runtime.outreachMaxOutputTokens,
            abortSignal: signal,
            timeoutMs: 60000,
            temperature: 0,
            jsonSchema: buildOutreachDraftJsonSchema(),
            deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_OUTREACH_THINKING", "disabled"),
            usageEvent: {
              searchId: context.searchId,
              jobId: context.jobId,
              userId: context.userId,
              stage: "outreach",
              batchSize: 1,
              candidateIndexes:
                typeof normalizedRow.metadata?.source_index === "number"
                  ? [normalizedRow.metadata.source_index]
                  : null,
            },
          }),
          60000,
          `Outreach draft for ${normalizedRow.name}`,
        );
        const subject = normalizeNullableString(parsedDraft.subject);
        const linkedin = normalizeNullableString(parsedDraft.linkedin);
        const email = normalizeNullableString(parsedDraft.email);
        if (!subject || !linkedin || !email) {
          logSearchEvent("outreach_draft_fallback", {
            search_id: context.searchId,
            candidate_index:
              typeof normalizedRow.metadata?.source_index === "number"
                ? normalizedRow.metadata.source_index
                : null,
            reason: "incomplete_llm_output",
            job_id: context.jobId,
          });
          return fallbackDraftFor(normalizedRow);
        }
        return {
          ...normalizedRow,
          outreach_draft: JSON.stringify({ subject, linkedin, email }),
        };
      } catch (error) {
        logSearchEvent("outreach_draft_fallback", {
          search_id: context.searchId,
          candidate_index:
            typeof normalizedRow.metadata?.source_index === "number"
              ? normalizedRow.metadata.source_index
              : null,
          reason: error instanceof Error ? error.message : String(error),
          job_id: context.jobId,
        });
        return fallbackDraftFor(normalizedRow);
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
  });
  void queueOrSendSearchNotification(context.searchId, "first_shortlist_ready").catch((error) => {
    searchJobLogger.error(
      {
        search_id: context.searchId,
        ...errorLogFields(error),
      },
      "Failed to queue first shortlist notification",
    );
  });
}



async function failSearch(searchId: string, error?: unknown) {
  const rows = await getSearchRowsForFailureBilling(searchId);
  const parsed = rows[0]?.parsed_requirements;
  const parsedRecord =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  const displayStats = normalizeSearchDisplayStats(parsedRecord.display_stats);
  const recallMetadata =
    parsedRecord.recall_metadata && typeof parsedRecord.recall_metadata === "object"
      ? (parsedRecord.recall_metadata as Record<string, unknown>)
      : null;
  const returnedProfiles =
    displayStats?.bright_profiles_returned ??
    getPositiveInt(recallMetadata?.bright_profiles_returned) ??
    0;
  const candidateCount = await countCandidatesForSearch(searchId);
  const isZeroRecall = error instanceof ZeroRecallError || (
    returnedProfiles === 0 &&
    (
      typeof recallMetadata?.bright_profiles_returned === "number" ||
      String(error instanceof Error ? error.message : error ?? "").toLowerCase().includes("no profiles")
    )
  );
  const searchErrorType = isZeroRecall ? "zero_recall" : "provider_failure";
  const releaseClientRole = candidateCount === 0;
  await updateSearchUsageEventMetadata(searchId, {
    search_error_type: searchErrorType,
    client_role_billing_status: releaseClientRole
      ? "released_after_failure"
      : "charged_after_partial_delivery_failure",
    client_roles_used: releaseClientRole ? 0 : 1,
    profile_scans_reserved: 0,
    profile_scans_used: returnedProfiles,
    profile_scans_returned: returnedProfiles,
    profile_scans_billing_status:
      returnedProfiles > 0 ? "charged_after_pipeline_failure" : "released_after_failure",
  });
  await updateSearchParsedRequirements(searchId, {
    ...parsedRecord,
    search_error_type: searchErrorType,
    search_error_at: nowIso(),
    search_error_retryable: true,
  });
  await setSearchStatus(searchId, "error", {
    error_message: isZeroRecall
      ? "No matching profiles were found for this search. Refine the JD or retry with broader criteria."
      : PUBLIC_SEARCH_FAILURE_MESSAGE,
  });

  if (candidateCount === 0) {
    void queueOrSendSearchNotification(searchId, "search_failed").catch((error) => {
      searchJobLogger.error(
        {
          search_id: searchId,
          ...errorLogFields(error),
        },
        "Failed to queue search failure notification",
      );
    });
  }
}

async function getSearchRowsForFailureBilling(searchId: string) {
  return db
    .select({
      parsed_requirements: hirelix_searches.parsed_requirements,
    })
    .from(hirelix_searches)
    .where(eq(hirelix_searches.id, searchId))
    .limit(1);
}

function getPositiveInt(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : null;
}

export async function processNextSearchJob(preferredSearchId?: string | null) {
  const job = await claimSearchJob({
    preferredSearchId,
    reclaimStaleRunningJobs,
  });
  if (!job) {
    return { processed: false, hasMore: false };
  }

  const stopHeartbeat = startSearchJobHeartbeat(job.id);

  try {
    try {
      await runSearchPipeline(job, {
        nowIso,
        logSearchEvent,
        normalizeNullableString,
        normalizeCountryCode,
        normalizeText,
        normalizeScore,
        normalizeStringArray,
        normalizeEnumValue,
        normalizeExperienceYears,
        truncateForPrompt,
        isPlaceholderTitle,
        deriveCoreSkillsFromJdText,
        inferCountriesFromJdText,
        sanitizeAdvancementRubric,
        sanitizeHiringBrief,
        sanitizeCompanyProfile,
        sanitizeCandidateSuitability,
        sanitizeConstraintVerdicts,
        normalizeBlockingConstraints,
        normalizeBlockingSeverity,
        normalizeAdvanceRecommendation,
        normalizeRecallSpec,
        normalizeRecallMetadata,
        normalizeSearchDisplayStats,
        buildSearchDisplayStats,
        buildSearchIntentInput: (jdText, userClarification) =>
          buildSearchIntentInput(jdText, userClarification),
        isWeakParsedIntent,
        enrichRecallSpecFromJd,
        isActivationRun,
        getSearchStartedAt,
        elapsedSince,
        withExecutionState: (parsed, executionProfile, overrides) =>
          withExecutionState(parsed, executionProfile, {
            planCode: normalizeSearchPlanCode(overrides.planCode),
            displayCount: overrides.displayCount,
          }),
        withDisplayStats,
        canReuseParsedRequirements,
        buildStandardSkillFilter,
        buildRecallLocationFilter,
        buildAdditionalSnapshotMetadata,
        hasRecallSnapshotDrift,
        mapSnapshotStatus: (metadata) => mapSnapshotStatus(metadata) ?? "submitted",
        isTransientSnapshotDownloadError,
        updateSearchDisplayStat,
        updateSearchDisplayStats,
        markSearchReviewable,
        estimateBrightPipelineLlmCost,
        sortCandidateAssessments,
        computeQualityScore,
        computeAdvanceScore,
        deriveAdvanceRecommendation,
        deriveFitDecisionFromScore,
        deriveShortlistDecision,
        shouldDisplayCandidate,
        getDisplayTierForAssessment,
        buildExcludedReasonCounts,
        buildPromptSearchContext,
        buildCompanyProfileContext,
        getJudgeModel,
        getArbiterModel,
        stripSpeculativeRelocation,
        generateOutreachDraftsForRows,
      });
      await updateRunningJobStatus(job.id, "done", {
        finished_at: nowIso(),
        locked_at: null,
        last_error: null,
      });
    } finally {
      stopHeartbeat();
    }
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

    const internalMessage = error instanceof Error
        ? error.message
        : "Search job failed";
    searchJobLogger.error(
      {
        job_id: job.id,
        search_id: job.search_id,
        attempt_count: job.attempt_count,
        ...errorLogFields(error),
      },
      "Search job failed",
    );
    const updated = await updateRunningJobStatus(
      job.id,
      "fatal_error",
      {
        available_at: nowIso(),
        last_error: internalMessage,
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

    await failSearch(job.search_id, error);

    logSearchEvent("search_provider_failed", {
      search_id: job.search_id,
      reason: "internal_error_logged",
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
