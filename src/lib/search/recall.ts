import type { BrightDataProfile } from "@/lib/brightdata";
import type {
  BrightDataDatasetFilterRequest,
  BrightDataFilterRule,
} from "@/lib/brightdata";
import { buildPendingGithubSignals } from "@/lib/github-signals";
import { extractPublicProfileLinks, mergePublicProfileLinks } from "@/lib/github/public-links";
import {
  normalizeCandidateRowInput,
  normalizeCountryCode,
  normalizeNullableString,
  normalizeScrapedDescription,
  normalizeText,
} from "@/lib/search/normalize";
import { getParsedRoleFamily } from "@/lib/search/lane-contract-critic";
import type { SearchExecutionProfile } from "@/lib/search-execution";
import type {
  CandidateDeliveryBucket,
  CandidateDisplayTier,
  CandidateRowInput,
  HiringBrief,
  HeadhunterLaneKind,
  RecallPersona,
  RecallPersonaKind,
  RecallRoundDiagnostics,
  RecallSpec,
  ScoredCandidateAssessment,
  SourcingLane,
} from "@/lib/search/types";

export type RecallFilterMode = "primary" | "relaxed";
export type HeadhunterRecallStrategyMode = "legacy" | "headhunter_v1" | "headhunter_v2";

export type RecallRound = {
  round: string;
  request: BrightDataDatasetFilterRequest;
  diagnostics: Omit<RecallRoundDiagnostics, "filter_hash" | "returned_count" | "quality_distribution">;
};

type BudgetPool = "hidden" | "company";

type BudgetedRecallRound = RecallRound & {
  budgetPool?: BudgetPool;
  budgetWeight?: number;
};

const MAX_BRIGHT_OR_FILTERS = 20;
const MAX_LLM_SOURCING_LANES = 4;
const MIN_LLM_SUPPLEMENTAL_RECORDS = 3;

const GENERIC_SENIORITY_TITLE_TERMS = new Set([
  "staff",
  "principal",
  "lead",
  "senior",
]);

const NON_SEARCHABLE_RECALL_SIGNAL_PATTERNS = [
  /\bus[-\s]?based\b/i,
  /\bin\s+sf\s+nyc\s+or\s+seattle\b/i,
  /\bin\s+sf\b/i,
  /\bnyc\s+or\s+seattle\b/i,
  /\bhybrid\b/i,
  /\brelocat/i,
  /\bopen to/i,
  /\b\d+\s*(?:years?|yrs?)\b/i,
];

const AMBIGUOUS_SHORT_COMPANY_TARGET_TERMS = new Set([
  "ai",
  "go",
  "ml",
  "qa",
]);

const SEARCH_DOMAIN_KEYWORDS = [
  "search",
  "index",
  "indexing",
  "retrieval",
  "ranking",
  "rank",
  "vector",
  "embedding",
  "embeddings",
  "semantic",
  "relevance",
  "elastic",
  "elasticsearch",
  "lucene",
  "solr",
  "algolia",
  "pinecone",
  "weaviate",
];

const PLATFORM_ENGINEERING_KEYWORDS = [
  "distributed",
  "systems",
  "kubernetes",
  "backend",
  "back end",
  "infrastructure",
  "platform",
  "data pipeline",
  "data pipelines",
  "pipeline",
];

const DATABASE_BACKEND_KEYWORDS = [
  "postgresql",
  "postgres",
  "database",
  "databases",
  "sql",
  "storage",
  "data intensive",
  "data-intensive",
];

const API_BACKEND_KEYWORDS = [
  "api",
  "apis",
  "backend",
  "back end",
  "microservice",
  "microservices",
  "service",
  "services",
  "rest",
  "grpc",
];

const BACKEND_ROLE_TITLE_KEYWORDS = [
  "backend",
  "back end",
  "software engineer",
  "server",
  "api",
  "service",
  "services",
  "microservice",
  "microservices",
];

const BACKEND_ROLE_EVIDENCE_KEYWORDS = [
  ...API_BACKEND_KEYWORDS,
  "server",
  "server-side",
  "server side",
  "production backend",
];

const PRODUCTION_OWNERSHIP_KEYWORDS = [
  "production",
  "reliability",
  "observability",
  "incident",
  "on-call",
  "on call",
  "scale",
  "scalability",
  "distributed",
  "systems",
];

const CONTRACT_DEPTH_KEYWORDS = [
  ...DATABASE_BACKEND_KEYWORDS,
  ...PRODUCTION_OWNERSHIP_KEYWORDS,
  ...SEARCH_DOMAIN_KEYWORDS,
  "payment",
  "payments",
  "billing",
  "ledger",
  "transaction",
  "transactions",
  "transaction systems",
  "fintech",
];

const COMMON_ATOMIC_SEARCH_TERMS = [
  ...BACKEND_ROLE_EVIDENCE_KEYWORDS,
  ...DATABASE_BACKEND_KEYWORDS,
  ...PRODUCTION_OWNERSHIP_KEYWORDS,
  ...SEARCH_DOMAIN_KEYWORDS,
  "golang",
  "java",
  "kotlin",
  "rust",
  "python",
  "scala",
  "typescript",
  "node.js",
  "postgresql",
  "postgres",
  "redis",
  "kafka",
  "aws",
  "gcp",
  "google cloud",
  "kubernetes",
  "payment",
  "payments",
  "billing",
  "ledger",
  "transaction",
  "transactions",
  "transaction systems",
  "fintech",
];

const LOW_PRECISION_EXTRACTED_ATOMIC_TERMS = new Set([
  "distributed",
  "systems",
  "platform",
  "infrastructure",
  "service",
  "services",
  "scale",
  "scalability",
]);

const ENGINEERING_TITLE_KEYWORDS = [
  "software",
  "backend",
  "back end",
  "platform",
  "infrastructure",
  "search",
  "data",
  "machine learning",
  "ml",
  "site reliability",
  "sre",
  "staff",
  "senior",
  "principal",
  "engineer",
];

const DEFAULT_HIDDEN_GEM_TITLES = [
  "Platform Engineer",
  "Infrastructure Engineer",
  "ML Infrastructure Engineer",
  "Backend Engineer",
  "Site Reliability Engineer",
  "Production Engineer",
];

const LOW_PRECISION_PLATFORM_HIDDEN_GEM_TITLES = [
  "platform engineer",
];

const LOW_PRECISION_RELIABILITY_HIDDEN_GEM_TITLES = [
  "cloud engineer",
  "devops engineer",
  "site reliability engineer",
  "sre",
];

const DATA_PLATFORM_HIDDEN_GEM_TITLES = [
  "Data Platform Engineer",
  "Senior Data Platform Engineer",
  "Staff Data Platform Engineer",
  "Principal Data Platform Engineer",
  "Lead Data Platform Engineer",
  "Data Infrastructure Engineer",
  "Senior Data Infrastructure Engineer",
  "Staff Data Infrastructure Engineer",
  "Principal Data Infrastructure Engineer",
  "Lead Data Infrastructure Engineer",
  "Streaming Platform Engineer",
  "Senior Streaming Platform Engineer",
  "Staff Streaming Platform Engineer",
  "Principal Streaming Platform Engineer",
  "Big Data Platform Engineer",
  "Senior Big Data Platform Engineer",
  "Big Data Compute Engineer",
  "Senior Big Data Compute Engineer",
  "Data Systems Engineer",
  "Senior Data Systems Engineer",
  "Senior Data Engineer",
  "Staff Data Engineer",
  "Principal Data Engineer",
  "Lead Data Engineer",
  "Distributed Data Systems Engineer",
  "Backend Data Infrastructure Engineer",
];

const DATA_PLATFORM_COMPANY_TARGET_TITLES = [
  "Senior Software Engineer",
  "Staff Software Engineer",
  "Principal Software Engineer",
  "Lead Software Engineer",
  "Senior Backend Engineer",
  "Staff Backend Engineer",
  "Senior Infrastructure Engineer",
  "Staff Infrastructure Engineer",
  "Senior Platform Engineer",
  "Staff Platform Engineer",
];

const DATA_PLATFORM_SKILL_LANE_TITLES = [
  "Senior Software Engineer",
  "Staff Software Engineer",
  "Principal Software Engineer",
  "Lead Software Engineer",
  "Senior Backend Engineer",
  "Staff Backend Engineer",
  "Principal Backend Engineer",
  "Senior Platform Engineer",
  "Staff Platform Engineer",
  "Principal Platform Engineer",
  "Senior Infrastructure Engineer",
  "Staff Infrastructure Engineer",
  "Principal Infrastructure Engineer",
  "Senior Data Engineer",
  "Staff Data Engineer",
  "Principal Data Engineer",
  "Lead Data Engineer",
];

const DATA_PLATFORM_SENIORITY_LANE_TITLES = [
  "Staff Software Engineer",
  "Principal Software Engineer",
  "Lead Software Engineer",
  "Staff Backend Engineer",
  "Principal Backend Engineer",
  "Lead Backend Engineer",
  "Staff Platform Engineer",
  "Principal Platform Engineer",
  "Lead Platform Engineer",
  "Staff Infrastructure Engineer",
  "Principal Infrastructure Engineer",
  "Lead Infrastructure Engineer",
  "Staff Data Engineer",
  "Principal Data Engineer",
  "Lead Data Engineer",
];

const DATA_PLATFORM_KEYWORDS = [
  "data platform",
  "data infrastructure",
  "data engineering",
  "big data compute",
  "data systems",
  "spark",
  "kafka",
  "flink",
  "druid",
  "pulsar",
  "airflow",
  "databricks",
  "iceberg",
  "lakehouse",
  "query engine",
];

const DATA_PLATFORM_HIGH_SIGNAL_TERMS = [
  "confluent",
  "hudi",
  "datalake",
  "data lake",
  "kafka",
  "spark",
  "flink",
  "druid",
  "pulsar",
  "big data compute",
  "distributed data systems",
  "streaming platform",
  "data ingestion",
  "query platform",
  "metadata platform",
  "workflow platform",
  "airflow",
  "databricks",
  "iceberg",
  "hadoop",
  "hdfs",
];

const DATA_PLATFORM_OWNERSHIP_TERMS = [
  "platform owned by other engineers",
  "data platform",
  "data infrastructure",
  "data systems",
  "distributed systems",
  "distributed data systems",
  "streaming platform",
  "big data compute",
  "query platform",
  "metadata platform",
  "workflow platform",
  "data ingestion",
  "data lake",
  "datalake",
];

function includesAnyKeyword(term: string, keywords: string[]) {
  const normalized = normalizeText(term);
  return keywords.some((keyword) => normalized.includes(keyword));
}

function isPlatformPrimaryRole(recallSpec: RecallSpec, hiringBrief?: HiringBrief) {
  const primaryRoleText = normalizeText([
    ...recallSpec.title_variants,
    hiringBrief?.role_core.title,
    hiringBrief?.role_core.function_focus,
  ].filter(Boolean).join(" "));
  return /\b(platform|infrastructure|site reliability|sre|devops|cloud)\b/.test(primaryRoleText);
}

function isReliabilityPrimaryRole(recallSpec: RecallSpec, hiringBrief?: HiringBrief) {
  const primaryRoleText = normalizeText([
    ...recallSpec.title_variants,
    hiringBrief?.role_core.title,
    hiringBrief?.role_core.function_focus,
  ].filter(Boolean).join(" "));
  return /\b(site reliability|sre|devops|cloud)\b/.test(primaryRoleText);
}

function hasDataPlatformSignals(recallSpec: RecallSpec) {
  const signals = [
    ...recallSpec.core_skill_terms,
    ...recallSpec.differentiating_skill_terms,
    ...recallSpec.domain_terms,
    ...recallSpec.must_have_signals,
  ];
  return signals.some((signal) => includesAnyKeyword(signal, DATA_PLATFORM_KEYWORDS));
}

function isDataPlatformPrimaryRole(
  parsed: Record<string, unknown>,
  recallSpec: RecallSpec,
  hiringBrief?: HiringBrief,
) {
  const roleFamily = getParsedRoleFamily(parsed, recallSpec);
  if (roleFamily === "data_engineering") return true;
  const primaryRoleText = normalizeText([
    ...recallSpec.title_variants,
    hiringBrief?.role_core.title,
    hiringBrief?.role_core.function_focus,
  ].filter(Boolean).join(" "));
  return /\b(data platform|data infrastructure|data engineering|data engineer|streaming platform|big data)\b/.test(primaryRoleText);
}

function buildHiddenGemTitleTerms(
  recallSpec: RecallSpec,
  hiringBrief?: HiringBrief,
  parsed: Record<string, unknown> = {},
) {
  const dataPlatformRole = isDataPlatformPrimaryRole(parsed, recallSpec, hiringBrief);
  const platformPrimaryRole = isPlatformPrimaryRole(recallSpec, hiringBrief);
  const reliabilityPrimaryRole = isReliabilityPrimaryRole(recallSpec, hiringBrief);
  return compactTerms([
    ...recallSpec.lateral_title_variants,
    ...(dataPlatformRole ? DATA_PLATFORM_HIDDEN_GEM_TITLES : []),
    ...DEFAULT_HIDDEN_GEM_TITLES,
  ], 14).filter((term) => {
    if (dataPlatformRole) return true;
    const normalized = normalizeText(term);
    if (normalized === "data engineer") return false;
    if (!platformPrimaryRole && LOW_PRECISION_PLATFORM_HIDDEN_GEM_TITLES.includes(normalized)) {
      return false;
    }
    if (!reliabilityPrimaryRole && LOW_PRECISION_RELIABILITY_HIDDEN_GEM_TITLES.includes(normalized)) {
      return false;
    }
    return true;
  });
}

function buildDataPlatformTitleTerms(recallSpec: RecallSpec) {
  return compactTerms([
    ...recallSpec.title_variants.filter((term) => includesAnyKeyword(term, DATA_PLATFORM_KEYWORDS)),
    ...recallSpec.lateral_title_variants.filter((term) => includesAnyKeyword(term, DATA_PLATFORM_KEYWORDS)),
    ...DATA_PLATFORM_HIDDEN_GEM_TITLES,
  ], 28);
}

function seniorityRequiresSeniorDataPlatformTitle(hiringBrief: HiringBrief) {
  const seniorityText = normalizeText([
    hiringBrief.role_core.seniority,
    hiringBrief.role_core.title,
    hiringBrief.role_core.function_focus,
    ...hiringBrief.must_have_constraints,
  ].filter(Boolean).join(" "));

  return /\b(staff|principal|lead|senior|sr)\b/.test(seniorityText);
}

function filterDataPlatformTitleTermsForSeniority(
  titleTerms: string[],
  hiringBrief: HiringBrief,
) {
  if (!seniorityRequiresSeniorDataPlatformTitle(hiringBrief)) return titleTerms;

  const seniorDataTitles = titleTerms.filter((term) => {
    const normalized = normalizeText(term);
    return /\b(staff|principal|lead|senior|sr)\b/.test(normalized) ||
      normalized.includes("backend data infrastructure") ||
      normalized.includes("distributed data systems");
  });

  return compactTerms(seniorDataTitles, 24);
}

function compactTerms(terms: string[], limit: number) {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const term of terms) {
    const normalized = normalizeText(term);
    if (normalized.length < 2 || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
    if (values.length >= limit) break;
  }
  return values;
}

export function sanitizeRecallSignalTerms(terms: string[], limit = 12) {
  return compactTerms(
    terms.filter((term) => !NON_SEARCHABLE_RECALL_SIGNAL_PATTERNS.some((pattern) => pattern.test(term))),
    limit,
  );
}

function buildEngineeringTitleTerms(titleTerms: string[], fallbackTitle: string | null) {
  const candidates = compactTerms(
    [
      ...titleTerms,
      fallbackTitle ?? "",
      "Senior Backend Engineer",
      "Staff Backend Engineer",
      "Senior Platform Engineer",
      "Staff Platform Engineer",
      "Senior Search Engineer",
      "Staff Search Engineer",
    ],
    12,
  );
  return candidates
    .filter((term) => includesAnyKeyword(term, ENGINEERING_TITLE_KEYWORDS))
    .slice(0, 8);
}

function buildLaneTitleTerms(
  titleTerms: string[],
  fallbackTitle: string | null,
  limit = 12,
) {
  const candidates = compactTerms(
    [
      ...titleTerms,
      fallbackTitle ?? "",
    ],
    limit,
  );
  return candidates
    .filter((term) => includesAnyKeyword(term, ENGINEERING_TITLE_KEYWORDS))
    .slice(0, limit);
}

export function buildRecallSkillSignalGroups(recallSpec: RecallSpec) {
  const searchableSignals = sanitizeRecallSignalTerms([
    ...recallSpec.differentiating_skill_terms,
    ...recallSpec.domain_terms,
    ...recallSpec.must_have_signals,
    ...recallSpec.core_skill_terms,
  ], 24);
  const baselineSignals = sanitizeRecallSignalTerms([
    ...recallSpec.baseline_skill_terms,
    ...recallSpec.core_skill_terms,
  ], 18);

  const searchDomain = compactTerms(
    searchableSignals.filter((term) => includesAnyKeyword(term, SEARCH_DOMAIN_KEYWORDS)),
    8,
  );
  const platformEngineering = compactTerms(
    baselineSignals.filter((term) => includesAnyKeyword(term, PLATFORM_ENGINEERING_KEYWORDS)),
    8,
  );
  const databaseBackend = compactTerms(
    searchableSignals.filter((term) => includesAnyKeyword(term, DATABASE_BACKEND_KEYWORDS)),
    6,
  );
  const apiBackend = compactTerms(
    searchableSignals.filter((term) => includesAnyKeyword(term, API_BACKEND_KEYWORDS)),
    6,
  );
  const productionOwnership = compactTerms(
    searchableSignals.filter((term) => includesAnyKeyword(term, PRODUCTION_OWNERSHIP_KEYWORDS)),
    6,
  );

  return {
    search_domain: searchDomain.length > 0
      ? searchDomain
      : compactTerms(recallSpec.differentiating_skill_terms, 5),
    platform_engineering: platformEngineering.length > 0
      ? platformEngineering
      : compactTerms(recallSpec.baseline_skill_terms.length > 0
        ? recallSpec.baseline_skill_terms
        : recallSpec.core_skill_terms, 6),
    database_backend: databaseBackend,
    api_backend: apiBackend,
    production_ownership: productionOwnership,
  };
}

function buildProfileSignalFilter(terms: string[], maxTerms = 8): BrightDataFilterRule | null {
  const normalizedTerms = compactTerms(terms, maxTerms);
  if (normalizedTerms.length === 0) return null;

  return {
    operator: "or",
    filters: [
      ...normalizedTerms.map((term) => ({
        name: "experience:description",
        operator: "includes" as const,
        value: term,
      })),
      ...normalizedTerms.map((term) => ({
        name: "experience:title",
        operator: "includes" as const,
        value: term,
      })),
      ...normalizedTerms.map((term) => ({
        name: "about",
        operator: "includes" as const,
        value: term,
      })),
    ].slice(0, MAX_BRIGHT_OR_FILTERS),
  };
}

function normalizeBrightSkillSignalTerms(terms: string[]) {
  return terms.flatMap((term) => {
    const normalized = normalizeText(term);
    if (normalized === "go") return ["golang"];
    if (AMBIGUOUS_SHORT_COMPANY_TARGET_TERMS.has(normalized)) return [];
    return [normalized];
  });
}

function buildBroadRecallSkillFilter(
  recallSpec: RecallSpec,
  signalGroups: ReturnType<typeof buildRecallSkillSignalGroups>,
  maxTerms = 10,
): BrightDataFilterRule | null {
  return buildProfileSignalFilter(
    normalizeBrightSkillSignalTerms([
      ...sanitizeRecallSignalTerms([
        ...recallSpec.baseline_skill_terms,
        ...recallSpec.core_skill_terms,
      ], 18),
      ...signalGroups.platform_engineering,
      ...signalGroups.database_backend,
      ...signalGroups.api_backend,
      ...signalGroups.production_ownership,
      ...signalGroups.search_domain,
      ...sanitizeRecallSignalTerms([
        ...recallSpec.differentiating_skill_terms,
        ...recallSpec.domain_terms,
      ], 18),
    ]),
    maxTerms,
  );
}

function getHeadhunterBrief(parsed: Record<string, unknown>) {
  return parsed.headhunter_brief && typeof parsed.headhunter_brief === "object"
    ? (parsed.headhunter_brief as Record<string, unknown>)
    : null;
}

function getStringArrayField(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function isAtomicSearchTerm(term: string) {
  const normalized = normalizeText(term);
  if (normalized.length < 2) return false;
  if (LOW_PRECISION_EXTRACTED_ATOMIC_TERMS.has(normalized)) return false;
  if (COMMON_ATOMIC_SEARCH_TERMS.some((keyword) => normalized === keyword)) return true;
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return wordCount <= 3 &&
    !/\b(engineers?|candidates?|people|profiles?|ownership|backgrounds?|experience|equivalent|substitute|wording|systems can)\b/.test(normalized);
}

function extractAtomicSearchTerms(terms: string[], limit: number) {
  const values: string[] = [];
  for (const rawTerm of terms) {
    const normalized = normalizeText(rawTerm);
    if (!normalized) continue;
    const phraseParts = normalized
      .split(/\s*(?:,|;|\/|\bor\b|\band\b|\(|\))\s*/i)
      .map((part) => part.trim())
      .filter(Boolean);
    const candidates = phraseParts.length > 1 ? phraseParts : [normalized];
    for (const candidate of candidates) {
      if (isAtomicSearchTerm(candidate)) {
        values.push(candidate);
      }
      const embeddedKeywords = [...COMMON_ATOMIC_SEARCH_TERMS]
        .filter((keyword) => !LOW_PRECISION_EXTRACTED_ATOMIC_TERMS.has(keyword))
        .sort((left, right) => right.length - left.length);
      for (const keyword of embeddedKeywords) {
        if (candidate.includes(keyword)) {
          values.push(keyword);
        }
      }
    }
  }
  return compactTerms(values, limit);
}

function buildLaneContractTerms(
  parsed: Record<string, unknown>,
  recallSpec: RecallSpec,
  lane: SourcingLane,
) {
  const brief = getHeadhunterBrief(parsed);
  return extractAtomicSearchTerms(sanitizeRecallSignalTerms([
    lane.target_persona ?? "",
    ...(lane.non_negotiables ?? []),
    ...(lane.relaxed_evidence ?? []),
    ...lane.skill_terms,
    ...recallSpec.differentiating_skill_terms,
    ...recallSpec.must_have_signals,
    ...recallSpec.domain_terms,
    ...recallSpec.core_skill_terms,
    ...getStringArrayField(brief?.equivalent_evidence),
    ...getStringArrayField(brief?.ideal_candidate_backgrounds),
  ], 36), 24);
}

function buildSameRoleFamilyTitleTerms(params: {
  lane: SourcingLane;
  recallSpec: RecallSpec;
  parsedTitle: string | null;
  fallbackTitleTerms: string[];
  roleFamily?: string;
}) {
  const laneTerms = buildLaneTitleTerms(
    params.lane.title_terms.filter(Boolean),
    params.lane.lane_kind === "primary_relaxed" ? null : params.parsedTitle,
    params.lane.lane_kind === "primary_relaxed" ? 14 : 10,
  );
  const baseTerms = laneTerms.length > 0
    ? laneTerms
    : buildLaneTitleTerms(params.fallbackTitleTerms, params.parsedTitle, 10);
  const contractText = normalizeText([
    params.lane.target_persona,
    ...(params.lane.non_negotiables ?? []),
    ...params.lane.skill_terms,
    ...params.recallSpec.title_variants,
    params.parsedTitle,
  ].filter(Boolean).join(" "));
  const backendRole = includesAnyKeyword(contractText, BACKEND_ROLE_TITLE_KEYWORDS) &&
    params.roleFamily !== "data_engineering";
  if (!backendRole) return baseTerms;

  const backendTerms = baseTerms.filter((term) =>
    includesAnyKeyword(term, BACKEND_ROLE_TITLE_KEYWORDS)
  );
  if (backendTerms.length > 0) return backendTerms;

  const softwareEngineerTerms = baseTerms.filter((term) => {
    const normalized = normalizeText(term);
    return normalized.includes("software engineer") &&
      !includesAnyKeyword(normalized, [
        "frontend",
        "front end",
        "mobile",
        "data",
        "machine learning",
        "ml",
        "site reliability",
        "sre",
        "devops",
      ]);
  });
  return softwareEngineerTerms.length > 0 ? softwareEngineerTerms : baseTerms;
}

function buildHeadhunterLaneEvidenceFilter(params: {
  parsed: Record<string, unknown>;
  recallSpec: RecallSpec;
  lane: SourcingLane;
  signalGroups: ReturnType<typeof buildRecallSkillSignalGroups>;
}) {
  if (isDataPlatformPrimaryRole(params.parsed, params.recallSpec)) {
    return buildProfileSignalFilter(
      normalizeBrightSkillSignalTerms([
        ...params.lane.skill_terms,
        ...(params.lane.non_negotiables ?? []),
        ...(params.lane.relaxed_evidence ?? []),
      ]),
      params.lane.lane_kind === "primary_relaxed" ? 8 : 10,
    ) ?? buildDataPlatformSkillLaneFilter(params.recallSpec);
  }

  const contractTerms = buildLaneContractTerms(params.parsed, params.recallSpec, params.lane);
  const backendAnchorTerms = compactTerms(
    extractAtomicSearchTerms([
      ...contractTerms.filter((term) => includesAnyKeyword(term, BACKEND_ROLE_EVIDENCE_KEYWORDS)),
      ...params.signalGroups.api_backend,
      "backend",
      "api",
      "microservices",
    ], 12),
    8,
  );
  const depthTerms = compactTerms(
    extractAtomicSearchTerms([
      ...contractTerms.filter((term) =>
        includesAnyKeyword(term, CONTRACT_DEPTH_KEYWORDS)
      ),
      ...params.signalGroups.database_backend,
      ...params.signalGroups.production_ownership,
      ...params.signalGroups.search_domain,
    ], 14),
    10,
  );
  const explicitSkillTerms = compactTerms(
    normalizeBrightSkillSignalTerms([
      ...params.lane.skill_terms,
      ...(params.lane.relaxed_evidence ?? []),
      ...params.recallSpec.differentiating_skill_terms,
    ]),
    params.lane.lane_kind === "primary_relaxed" ? 8 : 10,
  );

  if (params.lane.lane_kind === "primary_relaxed") {
    const boundaryTerms = compactTerms(
      [
        "backend engineering",
        ...contractTerms.filter((term) => includesAnyKeyword(term, BACKEND_ROLE_EVIDENCE_KEYWORDS)),
        ...backendAnchorTerms,
      ],
      4,
    );
    const specificEvidenceTerms = compactTerms(
      [
        ...explicitSkillTerms,
        ...contractTerms.filter((term) =>
          !includesAnyKeyword(term, BACKEND_ROLE_EVIDENCE_KEYWORDS)
        ),
        ...params.signalGroups.database_backend,
        ...params.signalGroups.production_ownership,
      ],
      8,
    );
    return buildProfileSignalFilter([
      ...specificEvidenceTerms,
      ...boundaryTerms,
    ], 10);
  }

  const contractEvidence = combineEvidenceFilters([
    backendAnchorTerms.length > 0 && depthTerms.length > 0
      ? buildHighIntentSignalPairFilter(backendAnchorTerms, depthTerms, 4)
      : null,
  ]);
  if (contractEvidence) return contractEvidence;

  const balancedSkillFilter = buildBalancedSkillFilter({
    ...params.recallSpec,
    core_skill_terms: explicitSkillTerms.length > 0 ? explicitSkillTerms : params.recallSpec.core_skill_terms,
    baseline_skill_terms: params.signalGroups.api_backend.length > 0
      ? params.signalGroups.api_backend
      : params.recallSpec.baseline_skill_terms,
    differentiating_skill_terms: params.recallSpec.differentiating_skill_terms,
    domain_terms: params.recallSpec.domain_terms,
    must_have_signals: params.recallSpec.must_have_signals,
  });
  return balancedSkillFilter ?? buildProfileSignalFilter(explicitSkillTerms, 8);
}

function buildProfileSignalLeaf(term: string, name: "about" | "position"): BrightDataFilterRule {
  return {
    name: name === "position" ? "experience:title" : name,
    operator: "includes",
    value: term,
  };
}

function buildHighIntentSignalPairFilter(
  anchorTerms: string[],
  depthTerms: string[],
  maxPairs = 4,
): BrightDataFilterRule | null {
  const anchors = compactTerms(anchorTerms, 6);
  const depths = compactTerms(depthTerms, 6);
  if (anchors.length === 0 || depths.length === 0) return null;

  const pairs: BrightDataFilterRule[] = [];
  const seen = new Set<string>();
  const addPair = (
    anchor: string,
    depth: string,
    anchorField: "about" | "position",
    depthField: "about" | "position",
  ) => {
    const key = `${anchorField}:${normalizeText(anchor)}|${depthField}:${normalizeText(depth)}`;
    if (seen.has(key) || pairs.length >= maxPairs) return;
    seen.add(key);
    pairs.push({
      operator: "and",
      filters: [
        buildProfileSignalLeaf(anchor, anchorField),
        buildProfileSignalLeaf(depth, depthField),
      ],
    });
  };

  for (const anchor of anchors) {
    for (const depth of depths) {
      addPair(anchor, depth, "position", "position");
      addPair(anchor, depth, "about", "position");
      addPair(anchor, depth, "position", "about");
      addPair(anchor, depth, "about", "about");
      if (pairs.length >= maxPairs) break;
    }
    if (pairs.length >= maxPairs) break;
  }

  if (pairs.length === 0) return null;
  return pairs.length === 1 ? pairs[0] : { operator: "or", filters: pairs };
}

function buildCurrentPositionSignalPairFilter(
  anchorTerms: string[],
  depthTerms: string[],
  maxPairs = 4,
): BrightDataFilterRule | null {
  const anchors = compactTerms(anchorTerms, 8);
  const depths = compactTerms(depthTerms, 8);
  if (anchors.length === 0 || depths.length === 0) return null;

  const pairs: BrightDataFilterRule[] = [];
  const seen = new Set<string>();
  const addPair = (
    anchor: string,
    depth: string,
    anchorField: "about" | "position",
    depthField: "about" | "position",
  ) => {
    const key = `${anchorField}:${normalizeText(anchor)}|${depthField}:${normalizeText(depth)}`;
    if (seen.has(key) || pairs.length >= maxPairs) return;
    seen.add(key);
    pairs.push({
      operator: "and",
      filters: [
        buildProfileSignalLeaf(anchor, anchorField),
        buildProfileSignalLeaf(depth, depthField),
      ],
    });
  };

  for (const anchor of anchors) {
    for (const depth of depths) {
      addPair(anchor, depth, "about", "position");
      addPair(anchor, depth, "position", "about");
      addPair(anchor, depth, "about", "about");
      addPair(anchor, depth, "position", "position");
      if (pairs.length >= maxPairs) break;
    }
    if (pairs.length >= maxPairs) break;
  }

  if (pairs.length === 0) return null;
  return pairs.length === 1 ? pairs[0] : { operator: "or", filters: pairs };
}

function combineEvidenceFilters(filters: Array<BrightDataFilterRule | null>) {
  const presentFilters = filters.filter(
    (filter): filter is BrightDataFilterRule => Boolean(filter),
  );
  if (presentFilters.length === 0) return null;
  const flattenedFilters = presentFilters.flatMap((filter) =>
    "filters" in filter && filter.operator === "or" ? filter.filters : [filter],
  );
  return flattenedFilters.length === 1
    ? flattenedFilters[0]
    : { operator: "or" as const, filters: flattenedFilters };
}

function buildBalancedSkillFilter(recallSpec: RecallSpec): BrightDataFilterRule | null {
  const groups = buildRecallSkillSignalGroups(recallSpec);
  const anchorFilter = combineEvidenceFilters([
    buildProfileSignalFilter(groups.search_domain, 6),
    buildProfileSignalFilter(groups.api_backend, 6),
  ]);
  const depthFilter = combineEvidenceFilters([
    buildProfileSignalFilter(groups.database_backend, 6),
    buildProfileSignalFilter(groups.production_ownership, 6),
    buildProfileSignalFilter(groups.platform_engineering, 6),
  ]);

  if (anchorFilter && depthFilter) {
    return { operator: "and", filters: [anchorFilter, depthFilter] };
  }
  return anchorFilter ?? depthFilter;
}

function buildHighIntentSkillFilter(
  recallSpec: RecallSpec,
  signalGroups: ReturnType<typeof buildRecallSkillSignalGroups>,
): BrightDataFilterRule | null {
  const primaryDepthTerms = compactTerms([
    ...signalGroups.database_backend,
    ...signalGroups.production_ownership,
  ], 10);
  const depthTerms = compactTerms([
    ...(primaryDepthTerms.length > 0 ? primaryDepthTerms : signalGroups.platform_engineering),
  ], 12);
  if (depthTerms.length === 0) return null;

  const depthTermSet = new Set(depthTerms.map((term) => normalizeText(term)));
  const rawAnchorTerms = compactTerms([
    ...signalGroups.search_domain,
    ...signalGroups.api_backend,
    ...sanitizeRecallSignalTerms([
      ...recallSpec.differentiating_skill_terms,
      ...recallSpec.must_have_signals,
    ], 16),
  ], 18);
  const anchorTerms = compactTerms(
    rawAnchorTerms.filter((term) => !depthTermSet.has(normalizeText(term))),
    10,
  );
  if (anchorTerms.length === 0) return null;

  return buildHighIntentSignalPairFilter(anchorTerms, depthTerms);
}

function buildShallowCompanySkillFilter(
  recallSpec: RecallSpec,
  signalGroups: ReturnType<typeof buildRecallSkillSignalGroups>,
  options: { dataPlatformRole?: boolean } = {},
) {
  const prioritizedTerms = options.dataPlatformRole
    ? compactTerms([
      ...sanitizeRecallSignalTerms([
        ...recallSpec.differentiating_skill_terms,
        ...recallSpec.domain_terms,
        ...recallSpec.core_skill_terms,
        ...recallSpec.must_have_signals,
      ], 32).filter((term) => includesAnyKeyword(term, DATA_PLATFORM_HIGH_SIGNAL_TERMS)),
      ...DATA_PLATFORM_HIGH_SIGNAL_TERMS,
      ...DATA_PLATFORM_OWNERSHIP_TERMS,
    ], 12)
    : [];

  return buildProfileSignalFilter([
    ...prioritizedTerms,
    ...sanitizeRecallSignalTerms([
      ...recallSpec.differentiating_skill_terms,
      ...recallSpec.must_have_signals,
    ], 12),
    ...signalGroups.search_domain,
    ...signalGroups.platform_engineering,
    ...signalGroups.database_backend,
    ...signalGroups.production_ownership,
    ...sanitizeRecallSignalTerms([
      ...recallSpec.baseline_skill_terms,
      ...recallSpec.core_skill_terms,
    ], 12),
  ], options.dataPlatformRole ? 10 : 8);
}

function buildCompanyTargetSkillFilter(
  recallSpec: RecallSpec,
  signalGroups: ReturnType<typeof buildRecallSkillSignalGroups>,
  options: { dataPlatformRole?: boolean } = {},
) {
  if (options.dataPlatformRole) {
    return buildShallowCompanySkillFilter(recallSpec, signalGroups, options);
  }

  const normalizedTerms = compactTerms([
    ...signalGroups.database_backend,
    ...signalGroups.production_ownership,
    ...signalGroups.api_backend,
    ...signalGroups.platform_engineering,
    ...signalGroups.search_domain,
    ...sanitizeRecallSignalTerms([
      ...recallSpec.differentiating_skill_terms,
      ...recallSpec.must_have_signals,
      ...recallSpec.baseline_skill_terms,
      ...recallSpec.core_skill_terms,
    ], 24),
  ], 24).flatMap((term) => {
    const normalized = normalizeText(term);
    if (normalized === "go") return ["golang"];
    if (AMBIGUOUS_SHORT_COMPANY_TARGET_TERMS.has(normalized)) return [];
    return [normalized];
  });

  return buildProfileSignalFilter(normalizedTerms, 8);
}

function buildHiddenGemCurrentPositionSkillFilter(
  recallSpec: RecallSpec,
  signalGroups: ReturnType<typeof buildRecallSkillSignalGroups>,
) {
  const anchorTerms = compactTerms([
    ...signalGroups.search_domain,
    ...signalGroups.api_backend,
    ...sanitizeRecallSignalTerms([
      ...recallSpec.differentiating_skill_terms,
      ...recallSpec.must_have_signals,
    ], 18).flatMap((term) => {
      const normalized = normalizeText(term);
      if (normalized === "go") return ["golang"];
      if (AMBIGUOUS_SHORT_COMPANY_TARGET_TERMS.has(normalized)) return [];
      return [normalized];
    }),
  ], 12);
  const depthTerms = compactTerms([
    ...signalGroups.database_backend,
    ...signalGroups.production_ownership,
    ...sanitizeRecallSignalTerms([
      ...recallSpec.baseline_skill_terms,
      ...recallSpec.core_skill_terms,
    ], 18).flatMap((term) => {
      const normalized = normalizeText(term);
      if (normalized === "go") return ["golang"];
      if (AMBIGUOUS_SHORT_COMPANY_TARGET_TERMS.has(normalized)) return [];
      return [normalized];
    }),
  ], 12);

  return buildCurrentPositionSignalPairFilter(anchorTerms, depthTerms);
}

function buildDataPlatformSkillLaneFilter(recallSpec: RecallSpec): BrightDataFilterRule | null {
  const skillSignals = compactTerms([
    ...sanitizeRecallSignalTerms([
      ...recallSpec.differentiating_skill_terms,
      ...recallSpec.domain_terms,
      ...recallSpec.core_skill_terms,
      ...recallSpec.must_have_signals,
    ], 32).filter((term) => includesAnyKeyword(term, DATA_PLATFORM_HIGH_SIGNAL_TERMS)),
    ...DATA_PLATFORM_HIGH_SIGNAL_TERMS,
  ], 10);

  const ownershipSignals = compactTerms([
    ...sanitizeRecallSignalTerms([
      ...recallSpec.differentiating_skill_terms,
      ...recallSpec.domain_terms,
      ...recallSpec.must_have_signals,
    ], 24).filter((term) => includesAnyKeyword(term, DATA_PLATFORM_OWNERSHIP_TERMS)),
    "data platform",
    "data infrastructure",
    "streaming platform",
    "distributed systems",
  ], 6);

  const skillFilter = buildProfileSignalFilter(skillSignals, 8);
  const ownershipFilter = buildProfileSignalFilter(ownershipSignals, 6);
  if (skillFilter && ownershipFilter) {
    return { operator: "and", filters: [skillFilter, ownershipFilter] };
  }
  return skillFilter ?? ownershipFilter;
}

function buildDataPlatformSeniorityLaneFilter(): BrightDataFilterRule | null {
  return buildProfileSignalFilter([
    "data platform",
    "data infrastructure",
    "streaming platform",
    "distributed systems",
    "kafka",
    "flink",
    "spark",
    "airflow",
    "platform",
    "infrastructure",
  ], 10);
}

function buildTitleFilter(titleTerms: string[], limit = 12): BrightDataFilterRule | null {
  const terms = compactTerms(titleTerms, limit).filter(
    (term) => !GENERIC_SENIORITY_TITLE_TERMS.has(term),
  );
  if (terms.length === 0) return null;
  return {
    operator: "or",
    filters: [
      ...terms.map((term) => ({
        name: "current_company:title",
        operator: "includes" as const,
        value: term,
      })),
      ...terms.map((term) => ({
        name: "experience:title",
        operator: "includes" as const,
        value: term,
      })),
    ].slice(0, MAX_BRIGHT_OR_FILTERS),
  };
}

function toRecallPersona(params: {
  round: string;
  kind: RecallPersonaKind;
  label: string;
  intent: string;
  titleTerms?: string[];
  skillTerms?: string[];
  companyTerms?: string[];
}): RecallPersona {
  return {
    id: params.round,
    round: params.round,
    kind: params.kind,
    label: params.label,
    intent: params.intent,
    title_terms: compactTerms(params.titleTerms ?? [], 18),
    skill_terms: compactTerms(params.skillTerms ?? [], 18),
    company_terms: compactTerms(params.companyTerms ?? [], 15),
  };
}

function withPersona(
  diagnostics: Omit<RecallRoundDiagnostics, "filter_hash" | "returned_count" | "quality_distribution">,
  params: {
    kind: RecallPersonaKind;
    label: string;
    intent: string;
    titleTerms?: string[];
    skillTerms?: string[];
    companyTerms?: string[];
  },
) {
  return {
    ...diagnostics,
    persona: toRecallPersona({
      round: diagnostics.round,
      kind: params.kind,
      label: params.label,
      intent: params.intent,
      titleTerms: params.titleTerms ?? diagnostics.title_terms,
      skillTerms: params.skillTerms ?? [
        ...diagnostics.skill_signal_groups.search_domain,
        ...diagnostics.skill_signal_groups.platform_engineering,
      ],
      companyTerms: params.companyTerms,
    }),
  };
}

function buildCompanyFilter(companyTerms: string[]): BrightDataFilterRule | null {
  const terms = compactTerms(companyTerms, 15);
  if (terms.length === 0) return null;
  return {
    operator: "or",
    filters: terms.map((term) => {
      const exactMatch = normalizeText(term).length <= 5;
      return {
        name: "current_company_name",
        operator: exactMatch ? "=" : "includes",
        value: term,
      };
    }),
  };
}

function getLlmLaneRoundName(lane: SourcingLane, index: number) {
  return `llm_${lane.strategy}_${index + 1}`;
}

function getFilterChildCount(filter: BrightDataFilterRule | null) {
  if (!filter) return 0;
  return "filters" in filter ? filter.filters.length : 1;
}

function allocateWeightedLimits(
  items: Array<{ index: number; weight: number }>,
  totalBudget: number,
) {
  const limits = new Map<number, number>();
  const normalizedBudget = Math.max(0, Math.round(totalBudget));
  if (items.length === 0 || normalizedBudget <= 0) return limits;

  const normalizedItems = items.map((item) => ({
    ...item,
    weight: Math.max(0.25, item.weight),
  }));
  if (normalizedBudget < normalizedItems.length) {
    const prioritized = [...normalizedItems].sort((left, right) => right.weight - left.weight);
    for (let index = 0; index < normalizedBudget; index += 1) {
      const item = prioritized[index];
      if (item) limits.set(item.index, 1);
    }
    return limits;
  }

  const totalWeight = normalizedItems.reduce((sum, item) => sum + item.weight, 0);
  const rawAllocations = normalizedItems.map((item) => {
    const raw = normalizedBudget * item.weight / Math.max(totalWeight, 1);
    return {
      ...item,
      allocated: Math.max(1, Math.floor(raw)),
      remainder: raw - Math.floor(raw),
    };
  });
  let allocatedTotal = rawAllocations.reduce((sum, item) => sum + item.allocated, 0);

  const byRemainderDesc = [...rawAllocations].sort((left, right) =>
    right.remainder - left.remainder || right.weight - left.weight,
  );
  for (let index = 0; allocatedTotal < normalizedBudget; index = (index + 1) % byRemainderDesc.length) {
    const item = byRemainderDesc[index];
    if (!item) continue;
    item.allocated += 1;
    allocatedTotal += 1;
  }

  const byRemainderAsc = [...rawAllocations].sort((left, right) =>
    left.remainder - right.remainder || left.weight - right.weight,
  );
  for (let index = 0; allocatedTotal > normalizedBudget; index = (index + 1) % byRemainderAsc.length) {
    const item = byRemainderAsc[index];
    if (!item || item.allocated <= 1) continue;
    item.allocated -= 1;
    allocatedTotal -= 1;
  }

  for (const item of rawAllocations) {
    limits.set(item.index, item.allocated);
  }
  return limits;
}

function withRecordsLimit(round: BudgetedRecallRound, recordsLimit: number): BudgetedRecallRound | null {
  const normalizedLimit = Math.max(0, Math.round(recordsLimit));
  if (normalizedLimit <= 0) return null;
  return {
    ...round,
    request: {
      ...round.request,
      recordsLimit: normalizedLimit,
    },
    diagnostics: {
      ...round.diagnostics,
      requested_count: normalizedLimit,
    },
  };
}

function isLlmSupplementalRound(round: BudgetedRecallRound) {
  return round.round.startsWith("llm_");
}

function pruneLowBudgetLlmSupplementalRounds(
  rounds: BudgetedRecallRound[],
  executionProfile: SearchExecutionProfile,
) {
  let pruned = [...rounds];

  const prunePool = (pool: BudgetPool, budget: number) => {
    let changed = true;
    while (changed) {
      changed = false;
      const poolItems = pruned
        .map((round, index) => ({ round, index }))
        .filter((item) => item.round.budgetPool === pool);
      const hasDeterministicRound = poolItems.some((item) => !isLlmSupplementalRound(item.round));
      const llmItems = poolItems.filter((item) => isLlmSupplementalRound(item.round));
      if (!hasDeterministicRound || llmItems.length === 0) return;

      const limits = allocateWeightedLimits(
        poolItems.map((item) => ({
          index: item.index,
          weight: item.round.budgetWeight ?? item.round.request.recordsLimit,
        })),
        budget,
      );
      const lowBudgetIndexes = new Set(
        llmItems
          .filter((item) => (limits.get(item.index) ?? 0) < MIN_LLM_SUPPLEMENTAL_RECORDS)
          .map((item) => item.index),
      );
      if (lowBudgetIndexes.size === 0) return;

      pruned = pruned.filter((_round, index) => !lowBudgetIndexes.has(index));
      changed = true;
    }
  };

  prunePool("hidden", executionProfile.hiddenGemLimit);
  prunePool("company", executionProfile.companyTargetLimit);

  return pruned;
}

function rebalanceSupplementalRoundLimits(
  rounds: BudgetedRecallRound[],
  executionProfile: SearchExecutionProfile,
): RecallRound[] {
  let rebalanced = [...rounds];
  const rebalancePool = (pool: BudgetPool, budget: number) => {
    const poolItems = rebalanced
      .map((round, index) => ({ round, index }))
      .filter((item) => item.round.budgetPool === pool);
    const limits = allocateWeightedLimits(
      poolItems.map((item) => ({
        index: item.index,
        weight: item.round.budgetWeight ?? item.round.request.recordsLimit,
      })),
      budget,
    );
    rebalanced = rebalanced.flatMap((round, index) => {
      if (round.budgetPool !== pool) return [round];
      const updated = withRecordsLimit(round, limits.get(index) ?? 0);
      return updated ? [updated] : [];
    });
  };

  rebalancePool("hidden", executionProfile.hiddenGemLimit);
  rebalancePool("company", executionProfile.companyTargetLimit);

  return rebalanced.map((round) => ({
    round: round.round,
    request: round.request,
    diagnostics: round.diagnostics,
  }));
}

export function getHeadhunterRecallStrategyMode(parsed: Record<string, unknown>): HeadhunterRecallStrategyMode {
  const raw = (process.env.SEARCH_RECALL_STRATEGY || "").trim().toLowerCase();
  if (raw === "headhunter_v2") return "headhunter_v2";
  if (raw === "headhunter_v1") return "headhunter_v1";
  if (parsed.recall_strategy_mode === "headhunter_v2") return "headhunter_v2";
  if (parsed.recall_strategy_mode === "headhunter_v1") return "headhunter_v1";
  const displayStats = parsed.display_stats && typeof parsed.display_stats === "object"
    ? (parsed.display_stats as Record<string, unknown>)
    : null;
  if (displayStats?.recall_strategy_mode === "headhunter_v2") return "headhunter_v2";
  if (displayStats?.recall_strategy_mode === "headhunter_v1") return "headhunter_v1";
  return "legacy";
}

function isHeadhunterRecallStrategy(parsed: Record<string, unknown>) {
  return getHeadhunterRecallStrategyMode(parsed) !== "legacy";
}

function getLaneInitialBudget(
  recallSpec: RecallSpec,
  laneKind: HeadhunterLaneKind,
  fallback: number,
) {
  const lane = recallSpec.sourcing_lanes.find((item) => item.lane_kind === laneKind);
  return typeof lane?.initial_budget === "number" && Number.isFinite(lane.initial_budget)
    ? Math.max(1, Math.round(lane.initial_budget))
    : fallback;
}

function buildHeadhunterProbeBudgets(
  recallSpec: RecallSpec,
  executionProfile: SearchExecutionProfile,
  strategyMode: HeadhunterRecallStrategyMode,
) {
  const totalAvailable = Math.max(
    1,
    Math.round(
      executionProfile.filterLimit +
      executionProfile.hiddenGemLimit +
      executionProfile.companyTargetLimit,
    ),
  );
  // v2 is the paid, multi-lane cold-start path: spend the configured batch
  // budget across all approved lanes in parallel. v1 keeps the small probe so
  // its adaptive audit can decide whether to expand.
  const probeBudget = strategyMode === "headhunter_v2"
    ? totalAvailable
    : Math.min(50, totalAvailable);
  if (executionProfile.name === "bright_free_preview") {
    if (strategyMode === "headhunter_v2") {
      return {
        primaryExact: Math.max(1, Math.min(25, probeBudget)),
        primaryRelaxed: 0,
      };
    }
    if (probeBudget >= 50) {
      return {
        primaryExact: 35,
        primaryRelaxed: 15,
      };
    }
    const primaryExact = Math.max(
      1,
      Math.min(probeBudget - 1, Math.round(probeBudget * 35 / 50)),
    );
    return {
      primaryExact,
      primaryRelaxed: Math.max(0, probeBudget - primaryExact),
    };
  }

  const requestedPrimaryExact = getLaneInitialBudget(recallSpec, "primary_exact", 35);
  const requestedPrimaryRelaxed = getLaneInitialBudget(recallSpec, "primary_relaxed", 15);
  const requestedTotal = Math.max(1, requestedPrimaryExact + requestedPrimaryRelaxed);
  const primaryExact = Math.max(
    1,
    Math.min(
      probeBudget - 1,
      Math.round(probeBudget * requestedPrimaryExact / requestedTotal),
    ),
  );
  return {
    primaryExact,
    primaryRelaxed: Math.max(0, probeBudget - primaryExact),
  };
}

function derivePrimaryRelaxedLane(
  recallSpec: RecallSpec,
  primaryExactLane: SourcingLane | undefined,
): SourcingLane | null {
  const existing = recallSpec.sourcing_lanes.find((lane) => lane.lane_kind === "primary_relaxed");
  if (existing) return existing;

  const source = primaryExactLane ??
    recallSpec.sourcing_lanes.find((lane) => lane.lane_kind === "primary_exact");
  if (!source) return null;

  const titleTerms = buildLaneTitleTerms(
    [...source.title_terms, ...recallSpec.title_variants],
    null,
    8,
  );
  const relaxedSkills = extractAtomicSearchTerms([
    ...source.skill_terms,
    ...(source.non_negotiables ?? []),
    ...(source.relaxed_evidence ?? []),
    ...recallSpec.differentiating_skill_terms,
    ...recallSpec.domain_terms,
    ...recallSpec.must_have_signals,
    ...recallSpec.core_skill_terms,
  ], 12);

  return {
    ...source,
    name: `${source.name || "primary"} relaxed`,
    strategy: "skill",
    lane_kind: "primary_relaxed",
    target_persona: source.target_persona ?? "Same role-family candidates with equivalent evidence",
    non_negotiables: source.non_negotiables ?? [],
    relaxed_evidence: compactTerms([
      ...(source.relaxed_evidence ?? []),
      ...recallSpec.differentiating_skill_terms,
      ...recallSpec.domain_terms,
    ], 8),
    exclusion_patterns: source.exclusion_patterns ?? [],
    initial_budget: getLaneInitialBudget(recallSpec, "primary_relaxed", 15),
    max_budget: Math.min(source.max_budget ?? 80, 80),
    title_terms: titleTerms.length > 0 ? titleTerms : compactTerms(source.title_terms, 6),
    skill_terms: relaxedSkills.length > 0 ? relaxedSkills : source.skill_terms,
    company_terms: [],
    avoid_terms: source.avoid_terms,
    budget_weight: Math.max(0.25, source.budget_weight || 1),
  };
}

function buildLlmSupplementalRounds(params: {
  datasetId: string;
  recallSpec: RecallSpec;
  countryFilter: BrightDataFilterRule | null;
  locationFilter: BrightDataFilterRule | null;
  qualityFilters: BrightDataFilterRule[];
  signalGroups: ReturnType<typeof buildRecallSkillSignalGroups>;
  locationMode: "country_only" | "location_filter";
}) {
  const lanes = params.recallSpec.sourcing_lanes
    .filter((lane) =>
      lane.title_terms.length > 0 ||
      lane.skill_terms.length > 0 ||
      lane.company_terms.length > 0
    )
    .slice(0, MAX_LLM_SOURCING_LANES);
  if (lanes.length === 0) return [];

  const rounds: BudgetedRecallRound[] = [];

  lanes.forEach((lane, index) => {
    const filters: BrightDataFilterRule[] = [];
    const titleFilter = buildTitleFilter(lane.title_terms, lane.strategy === "company" ? 18 : 14);
    const skillFilter = buildProfileSignalFilter(lane.skill_terms, 10);
    const companyFilter = buildCompanyFilter(lane.company_terms);
    const budgetWeight = Math.max(0.25, lane.budget_weight || 1);

    if (lane.strategy === "company") {
      if (!companyFilter) return;
      filters.push(companyFilter);
      if (params.countryFilter) filters.push(params.countryFilter);
      if (titleFilter && getFilterChildCount(titleFilter) >= 2) filters.push(titleFilter);
      if (skillFilter && compactTerms(lane.skill_terms, 10).length >= 3) filters.push(skillFilter);
    } else {
      if (!titleFilter) return;
      filters.push(titleFilter);
      if (skillFilter) filters.push(skillFilter);
      if (params.countryFilter) filters.push(params.countryFilter);
      if (params.locationFilter) filters.push(params.locationFilter);
    }
    filters.push(...params.qualityFilters);

    const round = getLlmLaneRoundName(lane, index);
    rounds.push({
      round,
      budgetPool: lane.strategy === "company" ? "company" : "hidden",
      budgetWeight,
      request: {
        datasetId: params.datasetId,
        recordsLimit: Math.max(1, Math.round(budgetWeight)),
        filter: filters.length === 1
          ? filters[0]
          : { operator: "and", filters },
      },
      diagnostics: withPersona({
        round,
        requested_count: Math.max(1, Math.round(budgetWeight)),
        title_terms: compactTerms(lane.title_terms, 18),
        skill_signal_groups: {
          search_domain: compactTerms(lane.skill_terms, 10),
          platform_engineering: params.signalGroups.platform_engineering,
        },
        location_mode: lane.strategy === "company" ? "country_only" : params.locationMode,
      }, {
        kind: lane.strategy === "company"
          ? "target_company"
          : lane.strategy === "seniority"
            ? "seniority_depth"
            : lane.strategy === "skill"
              ? "skill_depth"
              : "adjacent_strong",
        label: lane.name || `LLM ${lane.strategy} lane`,
        intent: lane.strategy === "company"
          ? "Find engineers from target or adjacent companies with enough title/skill breadth to avoid over-narrow company filters."
          : "Find adjacent high-signal engineers without requiring every JD keyword to appear in the Bright filter.",
        titleTerms: lane.title_terms,
        skillTerms: lane.skill_terms,
        companyTerms: lane.company_terms,
      }),
    });
  });

  return rounds;
}

function buildCountryFilter(countryCodes: string[]): BrightDataFilterRule | null {
  if (countryCodes.length === 0) return null;
  return countryCodes.length === 1
    ? {
      name: "country_code",
      operator: "=",
      value: countryCodes[0],
    }
    : {
      operator: "or",
      filters: countryCodes.map((country) => ({
        name: "country_code",
        operator: "=",
        value: country,
      })),
    };
}

function getRecallLocationMode(hiringBrief: HiringBrief) {
  if (hiringBrief.location_flexibility === "strict") return "location_filter" as const;
  if (hiringBrief.work_model === "remote") return "country_only" as const;
  if (hiringBrief.relocation_allowed !== "no") return "country_only" as const;
  return "location_filter" as const;
}

function buildQualityFilters(): BrightDataFilterRule[] {
  return [
    { name: "default_avatar", operator: "=", value: false },
    { name: "connections", operator: ">=", value: 50 },
  ];
}

export function trimBrightDataProfileForMetadata(profile: BrightDataProfile) {
  return {
    ...profile,
    avatar: null,
    about: profile.about ? profile.about.substring(0, 1000) : null,
    experience: (profile.experience || []).slice(0, 8).map((entry) => ({
      ...entry,
      description: entry.description ? entry.description.substring(0, 500) : null,
    })),
    education: (profile.education || []).slice(0, 5),
    skills: (profile.skills || []).slice(0, 20),
    certifications: (profile.certifications || []).slice(0, 10),
    languages: (profile.languages || []).slice(0, 10),
  };
}

export function buildBrightDataCandidateRows(
  profiles: BrightDataProfile[],
  selected: ScoredCandidateAssessment[],
  limit: number,
  poolType: "main" | "outreach_pool",
  options: {
    getDisplayTierForAssessment: (
      assessment: ScoredCandidateAssessment,
    ) => CandidateDisplayTier | null;
    getDeliveryBucketForAssessment?: (
      assessment: ScoredCandidateAssessment,
      displayTier: CandidateDisplayTier | null,
    ) => CandidateDeliveryBucket;
  },
) {
  const rows: CandidateRowInput[] = [];

  for (const [rankIndex, item] of selected.slice(0, limit).entries()) {
    const rawIndex = item.index;
    if (!Number.isFinite(rawIndex) || rawIndex < 0 || rawIndex >= profiles.length) continue;

    const profile = profiles[rawIndex];
    const publicLinks = mergePublicProfileLinks(
      profile.public_links,
      extractPublicProfileLinks(profile),
    );
    const primaryGithubUrl = publicLinks.github_urls[0] || null;
    const displayTier = options.getDisplayTierForAssessment(item);
    const recallSource =
      typeof (profile as BrightDataProfile & { __recall_source?: unknown }).__recall_source === "string"
        ? (profile as BrightDataProfile & { __recall_source?: string }).__recall_source
        : null;
    const deliveryBucket =
      options.getDeliveryBucketForAssessment?.(item, displayTier) ??
      (displayTier === "priority_outreach"
        ? "reach_first"
        : displayTier === "worth_reviewing"
          ? "review_next"
          : item.suitability.advance_recommendation === "reject" ||
              item.suitability.blocking_severity === "hard" ||
              item.suitability.bucket === "do_not_show"
            ? "not_recommended"
            : "lower_priority");
    const isRecommended = deliveryBucket === "reach_first" || deliveryBucket === "review_next";
    const derivedCompanyHeadline = profile.current_company
      ? `${profile.current_company.title || ""} at ${profile.current_company.name || ""}`.trim() || null
      : null;
    rows.push(normalizeCandidateRowInput({
      name: profile.name || "Unknown",
      headline: profile.headline || derivedCompanyHeadline,
      location: item.location || [profile.city, profile.country_code].filter(Boolean).join(", ") || null,
      skills: item.skills.length > 0
        ? item.skills
        : (profile.skills || []).slice(0, 10),
      experience_years: item.experience_years,
      match_score:
        item.suitability.advance_score ||
        item.suitability.match_score ||
        item.suitability.overall_score ||
        50,
      match_reasons:
        item.suitability.why_this_candidate.length > 0
          ? item.suitability.why_this_candidate
          : ["Profile matches search criteria"],
      profile_url: profile.url || profile.input?.url || null,
      github_url: primaryGithubUrl,
      email: null,
      outreach_draft: null,
      metadata: {
        source: "brightdata",
        ...(recallSource ? { recall_source: recallSource } : {}),
        source_index: rawIndex,
        scored_rank: rankIndex + 1,
        analysis_stage: "final",
        preliminary: false,
        pool_type: poolType,
        delivery_bucket: deliveryBucket,
        is_recommended: isRecommended,
        scoring_method: item.scoring_method || "selective_dual_review",
        judge_delta: item.judge_delta ?? 0,
        judge_conflict: item.judge_conflict ?? false,
        quality_score: item.suitability.quality_score,
        overall_score: item.suitability.overall_score,
        advance_score: item.suitability.advance_score,
        advance_recommendation: item.suitability.advance_recommendation,
        shortlist_decision: item.suitability.shortlist_decision,
        shortlist_reason: item.suitability.shortlist_reason,
        bucket: item.suitability.bucket,
        ...(displayTier ? { display_tier: displayTier } : {}),
        primary_risk: item.suitability.primary_risk,
        first_contact_confidence: item.suitability.first_contact_confidence,
        subscription_trigger_score: item.suitability.subscription_trigger_score,
        blocking_constraints: item.suitability.blocking_constraints,
        blocking_severity: item.suitability.blocking_severity,
        quality_breakdown: {
          capability_score: item.suitability.scoring_breakdown.capability_score,
          relevance_score: item.suitability.scoring_breakdown.relevance_score,
        },
        suitability: item.suitability,
        scoring_breakdown: item.suitability.scoring_breakdown,
        constraint_verdicts: item.suitability.constraint_verdicts,
        constraint_risks: item.suitability.constraint_risks,
        risk_flags: item.suitability.risk_flags,
        join_likelihood_reasons: item.suitability.scoring_breakdown.join_likelihood_reasons,
        why_reachable_now: item.why_reachable_now ?? null,
        why_not_higher: item.suitability.why_not_higher,
        work_history: (profile.experience || [])
          .slice(0, 5)
          .map((entry) => ({
            title: normalizeNullableString(entry.title),
            company: normalizeNullableString(entry.company),
            start_date: normalizeNullableString(entry.duration),
            end_date: null,
            summary: normalizeScrapedDescription(entry.description),
          }))
          .filter((entry) => entry.title || entry.company || entry.summary),
        education: (profile.education || [])
          .slice(0, 3)
          .map((entry) => ({
            school: normalizeNullableString(entry.subtitle),
            degree: normalizeNullableString(entry.degree),
            major: normalizeNullableString(entry.field_of_study),
            start_year: normalizeNullableString(entry.start_year),
            end_year: normalizeNullableString(entry.end_year),
          }))
          .filter((entry) => entry.school || entry.degree || entry.major),
        about: profile.about ? profile.about.substring(0, 500) : null,
        public_links: publicLinks,
        raw_profile: trimBrightDataProfileForMetadata(profile),
      },
    }));
  }

  return rows;
}

export function mergeCandidateRows(
  primary: CandidateRowInput[],
  supplement: CandidateRowInput[],
  limit: number,
) {
  const merged: CandidateRowInput[] = [];
  const seen = new Set<string>();

  for (const row of [...primary, ...supplement]) {
    const key = (row.profile_url || row.name).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
    if (merged.length >= limit) break;
  }

  return merged;
}

export function enrichRowsWithGithubSignals(
  rows: CandidateRowInput[],
  options: {
    requiredSkills: string[];
    displayCount: number;
    githubEnrichLimit: number;
  },
) {
  if (rows.length === 0) return rows;

  const githubLimit = Math.min(
    options.displayCount || rows.length,
    rows.length,
    options.githubEnrichLimit,
  );

  return rows.map((row, index) => {
    if (index >= githubLimit) {
      return row;
    }

    const metadata = {
      ...(row.metadata || {}),
      github_signals: buildPendingGithubSignals({
        status: "queued",
        candidateName: row.name,
        headline: row.headline,
        requiredSkills: options.requiredSkills,
        existingGithubUrl: row.github_url,
        existingSignals:
          row.metadata?.github_signals && typeof row.metadata.github_signals === "object"
            ? (row.metadata.github_signals as Record<string, unknown>)
            : null,
      }),
      github_signal_score: null,
      github_discovery_confidence: 0,
    };

    return {
      ...row,
      metadata,
    };
  });
}

export function buildBrightDataRecallFilter(
  parsed: Record<string, unknown>,
  candidateCount: number,
  executionProfile: SearchExecutionProfile,
  options: {
    normalizeRecallSpec: (
      value: unknown,
      requestedLimit: number,
      options?: { recordLimitOverride?: number },
    ) => RecallSpec;
    sanitizeHiringBrief: (
      value: unknown,
      fallbackParsed: Record<string, unknown>,
    ) => HiringBrief;
    buildStandardSkillFilter: (
      recallSpec: RecallSpec,
      mode: RecallFilterMode,
    ) => BrightDataFilterRule | null;
    buildRecallLocationFilter: (
      hiringBrief: HiringBrief,
      recallSpec: RecallSpec,
      countryCodes: string[],
      mode: RecallFilterMode,
    ) => BrightDataFilterRule | null;
    isPlaceholderTitle: (title: string | null | undefined) => boolean;
    mode?: RecallFilterMode;
  },
): BrightDataDatasetFilterRequest | null {
  const datasetId =
    process.env.BRIGHTDATA_RECALL_DATASET_ID ||
    process.env.BRIGHTDATA_DATASET_ID;
  if (!datasetId) return null;

  const recallSpec = options.normalizeRecallSpec(parsed.recall_spec, candidateCount, {
    recordLimitOverride: executionProfile.filterLimit,
  });
  const mode = options.mode ?? "primary";
  const rawTitleTerms = (recallSpec.title_variants.length > 0
    ? recallSpec.title_variants
    : [normalizeNullableString(parsed.title)].filter((value): value is string => Boolean(value)))
    .filter((term) => !options.isPlaceholderTitle(term));
  const titleTerms = buildEngineeringTitleTerms(rawTitleTerms, normalizeNullableString(parsed.title));

  if (titleTerms.length === 0) return null;

  const hiringBrief = options.sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const locationMode = getRecallLocationMode(hiringBrief);
  const isDataPlatformRole = isDataPlatformPrimaryRole(parsed, recallSpec, hiringBrief);
  const signalGroups = buildRecallSkillSignalGroups(recallSpec);
  const effectiveTitleTerms = isDataPlatformRole
    ? filterDataPlatformTitleTermsForSeniority(buildDataPlatformTitleTerms(recallSpec), hiringBrief)
    : titleTerms;
  const countryCodes = recallSpec.countries
    .map((country) => normalizeCountryCode(country))
    .filter((country): country is string => Boolean(country))
    .slice(0, 4);

  const titleFilter = buildTitleFilter(effectiveTitleTerms);
  if (!titleFilter) return null;

  const rootFilters: BrightDataFilterRule[] = [titleFilter];

  const countryFilter = buildCountryFilter(countryCodes);
  if (countryFilter) rootFilters.push(countryFilter);

  const standardSkillFilter =
    isDataPlatformRole
      ? null
      : mode === "relaxed"
      ? options.buildStandardSkillFilter(recallSpec, mode)
      : buildBroadRecallSkillFilter(recallSpec, signalGroups);
  if (standardSkillFilter) {
    rootFilters.push(standardSkillFilter);
  }

  const locationFilter = locationMode === "location_filter"
    ? options.buildRecallLocationFilter(
      hiringBrief,
      recallSpec,
      countryCodes,
      mode,
    )
    : null;
  if (locationFilter) {
    rootFilters.push(locationFilter);
  }

  rootFilters.push(...buildQualityFilters());

  return {
    datasetId,
    recordsLimit: executionProfile.filterLimit,
    filter:
      rootFilters.length === 1
        ? rootFilters[0]
        : {
          operator: "and",
          filters: rootFilters,
        },
		  };
}

function buildHeadhunterLaneRecallRequest(
  parsed: Record<string, unknown>,
  recallSpec: RecallSpec,
  hiringBrief: HiringBrief,
  lane: SourcingLane,
  recordsLimit: number,
  options: {
    buildRecallLocationFilter: (
      hiringBrief: HiringBrief,
      recallSpec: RecallSpec,
      countryCodes: string[],
      mode: RecallFilterMode,
    ) => BrightDataFilterRule | null;
    isPlaceholderTitle: (title: string | null | undefined) => boolean;
  },
): BrightDataDatasetFilterRequest | null {
  const datasetId =
    process.env.BRIGHTDATA_RECALL_DATASET_ID ||
    process.env.BRIGHTDATA_DATASET_ID;
  if (!datasetId) return null;

  const limit = Math.max(1, Math.round(recordsLimit));
  const parsedTitle = normalizeNullableString(parsed.title);
  const fallbackTitleTerms = (recallSpec.title_variants.length > 0
    ? recallSpec.title_variants
    : [parsedTitle].filter((value): value is string => Boolean(value)))
    .filter((term) => !options.isPlaceholderTitle(term));
  const signalGroups = buildRecallSkillSignalGroups(recallSpec);
  const isDataPlatformRole = isDataPlatformPrimaryRole(parsed, recallSpec, hiringBrief);
  const roleFamily = getParsedRoleFamily(parsed, recallSpec);
  const titleTerms = isDataPlatformRole
    ? filterDataPlatformTitleTermsForSeniority(buildDataPlatformTitleTerms(recallSpec), hiringBrief)
    : buildSameRoleFamilyTitleTerms({
      lane,
      recallSpec,
      parsedTitle,
      fallbackTitleTerms,
      roleFamily,
    });
  const titleFilter = buildTitleFilter(
    titleTerms,
    lane.lane_kind === "target_company_engineering" || lane.strategy === "company" ? 18 : 14,
  );
  const skillFilter = buildHeadhunterLaneEvidenceFilter({
    parsed,
    recallSpec,
    lane,
    signalGroups,
  });
  const countryCodes = recallSpec.countries
    .map((country) => normalizeCountryCode(country))
    .filter((country): country is string => Boolean(country))
    .slice(0, 4);
  const countryFilter = buildCountryFilter(countryCodes);
  const locationMode = getRecallLocationMode(hiringBrief);
  const mode = lane.lane_kind === "primary_relaxed" || lane.strategy === "skill"
    ? "relaxed" as const
    : "primary" as const;
  const locationFilter = locationMode === "location_filter"
    ? options.buildRecallLocationFilter(hiringBrief, recallSpec, countryCodes, mode)
    : null;
  const companyTerms = lane.company_terms.length > 0
    ? lane.company_terms
    : lane.lane_kind === "target_company_engineering"
      ? recallSpec.target_companies
      : [];
  const companyFilter = buildCompanyFilter(companyTerms);
  const filters: BrightDataFilterRule[] = [];

  if (lane.strategy === "company" || lane.lane_kind === "target_company_engineering") {
    if (!companyFilter || !titleFilter || !skillFilter) return null;
    filters.push(companyFilter, titleFilter, skillFilter);
  } else {
    if (!titleFilter || !skillFilter) return null;
    filters.push(titleFilter, skillFilter);
  }

  if (countryFilter) filters.push(countryFilter);
  if (locationFilter) filters.push(locationFilter);
  filters.push(...buildQualityFilters());

  return {
    datasetId,
    recordsLimit: limit,
    filter: filters.length === 1 ? filters[0] : { operator: "and", filters },
  };
}

export function buildBrightDataRecallFilterForLane(
  parsed: Record<string, unknown>,
  lane: SourcingLane,
  recordsLimit: number,
  options: {
    normalizeRecallSpec: (
      value: unknown,
      requestedLimit: number,
      options?: { recordLimitOverride?: number },
    ) => RecallSpec;
    sanitizeHiringBrief: (
      value: unknown,
      fallbackParsed: Record<string, unknown>,
    ) => HiringBrief;
    buildStandardSkillFilter: (
      recallSpec: RecallSpec,
      mode: RecallFilterMode,
    ) => BrightDataFilterRule | null;
    buildRecallLocationFilter: (
      hiringBrief: HiringBrief,
      recallSpec: RecallSpec,
      countryCodes: string[],
      mode: RecallFilterMode,
    ) => BrightDataFilterRule | null;
    isPlaceholderTitle: (title: string | null | undefined) => boolean;
  },
): BrightDataDatasetFilterRequest | null {
  const datasetId =
    process.env.BRIGHTDATA_RECALL_DATASET_ID ||
    process.env.BRIGHTDATA_DATASET_ID;
  if (!datasetId) return null;

  const limit = Math.max(1, Math.round(recordsLimit));
  const recallSpec = options.normalizeRecallSpec(parsed.recall_spec, limit, {
    recordLimitOverride: limit,
  });
  const hiringBrief = options.sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const headhunterRequest = buildHeadhunterLaneRecallRequest(
    parsed,
    recallSpec,
    hiringBrief,
    lane,
    limit,
    {
      buildRecallLocationFilter: options.buildRecallLocationFilter,
      isPlaceholderTitle: options.isPlaceholderTitle,
    },
  );
  if (headhunterRequest) return headhunterRequest;

  const countryCodes = recallSpec.countries
    .map((country) => normalizeCountryCode(country))
    .filter((country): country is string => Boolean(country))
    .slice(0, 4);
  const titleTerms = buildEngineeringTitleTerms(
    lane.title_terms.filter((term) => !options.isPlaceholderTitle(term)),
    normalizeNullableString(parsed.title),
  );
  const titleFilter = buildTitleFilter(titleTerms, lane.strategy === "company" ? 18 : 14);
  const skillFilter = buildProfileSignalFilter(lane.skill_terms, 10) ??
    options.buildStandardSkillFilter(
      {
        ...recallSpec,
        core_skill_terms: lane.skill_terms.length > 0 ? lane.skill_terms : recallSpec.core_skill_terms,
        must_have_signals: lane.skill_terms.length > 0 ? lane.skill_terms : recallSpec.must_have_signals,
      },
      lane.lane_kind === "primary_relaxed" || lane.strategy === "skill" ? "relaxed" : "primary",
    );
  const companyFilter = buildCompanyFilter(lane.company_terms);
  const countryFilter = buildCountryFilter(countryCodes);
  const locationFilter = getRecallLocationMode(hiringBrief) === "location_filter"
    ? options.buildRecallLocationFilter(
      hiringBrief,
      recallSpec,
      countryCodes,
      lane.lane_kind === "primary_relaxed" ? "relaxed" : "primary",
    )
    : null;
  const filters: BrightDataFilterRule[] = [];

  if (lane.strategy === "company" || lane.lane_kind === "target_company_engineering") {
    if (!companyFilter) return null;
    filters.push(companyFilter);
    if (titleFilter) filters.push(titleFilter);
    if (skillFilter) filters.push(skillFilter);
  } else {
    if (!titleFilter && !skillFilter) return null;
    if (titleFilter && skillFilter) {
      filters.push(titleFilter, skillFilter);
    } else if (titleFilter) {
      filters.push(titleFilter);
    } else if (skillFilter) {
      filters.push(skillFilter);
    }
  }

  if (countryFilter) filters.push(countryFilter);
  if (locationFilter) filters.push(locationFilter);
  filters.push(...buildQualityFilters());

  return {
    datasetId,
    recordsLimit: limit,
    filter: filters.length === 1 ? filters[0] : { operator: "and", filters },
  };
}

export function getTotalRecallRequestLimit(rounds: RecallRound[]) {
  return rounds.reduce((sum, round) => sum + Math.max(0, round.request.recordsLimit), 0);
}

export function scaleRecallRoundsForValidation(
  rounds: RecallRound[],
  options: { perRoundLimit?: number; totalLimit?: number } = {},
): RecallRound[] {
  const perRoundLimit = Math.max(1, Math.round(options.perRoundLimit ?? 5));
  const totalLimit = Math.max(1, Math.round(options.totalLimit ?? 40));
  let remaining = totalLimit;

  return rounds.flatMap((round) => {
    if (remaining <= 0) return [];
    const recordsLimit = Math.min(
      Math.max(1, round.request.recordsLimit),
      perRoundLimit,
      remaining,
    );
    remaining -= recordsLimit;
    return [{
      ...round,
      request: {
        ...round.request,
        recordsLimit,
      },
      diagnostics: {
        ...round.diagnostics,
        requested_count: recordsLimit,
      },
    }];
  });
}

export function getRecallPersonas(rounds: RecallRound[]) {
  const personas: RecallPersona[] = [];
  const seen = new Set<string>();
  for (const round of rounds) {
    const persona = round.diagnostics.persona;
    if (!persona || seen.has(persona.id)) continue;
    seen.add(persona.id);
    personas.push(persona);
  }
  return personas;
}

function buildDeterministicExpansionRounds(params: {
  datasetId: string;
  recallSpec: RecallSpec;
  hiringBrief: HiringBrief;
  executionProfile: SearchExecutionProfile;
  countryFilter: BrightDataFilterRule | null;
  locationFilter: BrightDataFilterRule | null;
  qualityFilters: BrightDataFilterRule[];
  signalGroups: ReturnType<typeof buildRecallSkillSignalGroups>;
  isDataPlatformRole: boolean;
  standardTitleTerms: string[];
  locationMode: "country_only" | "location_filter";
}) {
  const rounds: BudgetedRecallRound[] = [];
  const lateralTitles = params.isDataPlatformRole
    ? filterDataPlatformTitleTermsForSeniority(buildDataPlatformTitleTerms(params.recallSpec), params.hiringBrief)
    : buildHiddenGemTitleTerms(params.recallSpec, params.hiringBrief);
  const differentiatingTerms = compactTerms([
    ...params.signalGroups.search_domain,
    ...params.signalGroups.platform_engineering,
  ], 10);

  if (params.isDataPlatformRole && params.countryFilter) {
    const laneLimit = Math.max(1, Math.floor(params.executionProfile.hiddenGemLimit / 2));
    const skillLaneLimit = laneLimit;
    const seniorityLaneLimit = Math.max(0, params.executionProfile.hiddenGemLimit - laneLimit);
    const skillLaneFilter = buildDataPlatformSkillLaneFilter(params.recallSpec);
    const skillLaneTitleFilter = buildTitleFilter(DATA_PLATFORM_SKILL_LANE_TITLES, 18);
    if (skillLaneLimit > 0 && skillLaneFilter && skillLaneTitleFilter) {
      const skillLaneFilters: BrightDataFilterRule[] = [
        skillLaneTitleFilter,
        params.countryFilter,
        skillLaneFilter,
        ...params.qualityFilters,
      ];
      if (params.locationFilter) skillLaneFilters.push(params.locationFilter);
      rounds.push({
        round: "standard_skill",
        budgetPool: "hidden",
        budgetWeight: skillLaneLimit,
        request: {
          datasetId: params.datasetId,
          recordsLimit: skillLaneLimit,
          filter: { operator: "and", filters: skillLaneFilters },
        },
        diagnostics: withPersona({
          round: "standard_skill",
          requested_count: skillLaneLimit,
          title_terms: compactTerms(DATA_PLATFORM_SKILL_LANE_TITLES, 18),
          skill_signal_groups: params.signalGroups,
          location_mode: params.locationMode,
        }, {
          kind: "skill_depth",
          label: "Data platform skill-depth engineers",
          intent: "Find engineers with data-platform ownership evidence even when exact titles vary.",
          titleTerms: DATA_PLATFORM_SKILL_LANE_TITLES,
          skillTerms: [
            ...params.signalGroups.search_domain,
            ...params.signalGroups.platform_engineering,
            ...DATA_PLATFORM_HIGH_SIGNAL_TERMS,
          ],
        }),
      });
    }

    const seniorityLaneFilter = buildDataPlatformSeniorityLaneFilter();
    const seniorityLaneTitleFilter = buildTitleFilter(DATA_PLATFORM_SENIORITY_LANE_TITLES, 15);
    if (seniorityLaneLimit > 0 && seniorityLaneFilter && seniorityLaneTitleFilter) {
      const seniorityLaneFilters: BrightDataFilterRule[] = [
        seniorityLaneTitleFilter,
        params.countryFilter,
        seniorityLaneFilter,
        ...params.qualityFilters,
      ];
      if (params.locationFilter) seniorityLaneFilters.push(params.locationFilter);
      rounds.push({
        round: "standard_seniority",
        budgetPool: "hidden",
        budgetWeight: seniorityLaneLimit,
        request: {
          datasetId: params.datasetId,
          recordsLimit: seniorityLaneLimit,
          filter: { operator: "and", filters: seniorityLaneFilters },
        },
        diagnostics: withPersona({
          round: "standard_seniority",
          requested_count: seniorityLaneLimit,
          title_terms: compactTerms(DATA_PLATFORM_SENIORITY_LANE_TITLES, 15),
          skill_signal_groups: params.signalGroups,
          location_mode: params.locationMode,
        }, {
          kind: "seniority_depth",
          label: "Senior data-platform ICs",
          intent: "Find staff/principal/lead data-platform profiles while scoring later separates hands-on ICs from manager-only profiles.",
          titleTerms: DATA_PLATFORM_SENIORITY_LANE_TITLES,
          skillTerms: [
            ...params.signalGroups.platform_engineering,
            ...DATA_PLATFORM_OWNERSHIP_TERMS,
          ],
        }),
      });
    }
  }

  if (!params.isDataPlatformRole && lateralTitles.length > 0 && differentiatingTerms.length > 0) {
    const hiddenSignalFilter = buildBroadRecallSkillFilter(
      params.recallSpec,
      params.signalGroups,
      12,
    ) ?? buildHiddenGemCurrentPositionSkillFilter(
      params.recallSpec,
      params.signalGroups,
    ) ?? buildHighIntentSkillFilter(params.recallSpec, params.signalGroups) ??
      buildBalancedSkillFilter({
        ...params.recallSpec,
        core_skill_terms: params.signalGroups.platform_engineering,
        baseline_skill_terms: params.signalGroups.platform_engineering,
        differentiating_skill_terms: params.signalGroups.search_domain,
        domain_terms: params.signalGroups.search_domain,
        must_have_signals: params.signalGroups.search_domain,
      });
    if (hiddenSignalFilter) {
        const hiddenGemFilters: BrightDataFilterRule[] = [
          {
            operator: "or",
            filters: [
              ...lateralTitles.map((term) => ({
                name: "current_company:title",
                operator: "includes" as const,
                value: term,
              })),
              ...lateralTitles.map((term) => ({
                name: "experience:title",
                operator: "includes" as const,
                value: term,
              })),
            ].slice(0, MAX_BRIGHT_OR_FILTERS),
          },
        ];
      if (params.countryFilter) hiddenGemFilters.push(params.countryFilter);
      hiddenGemFilters.push(hiddenSignalFilter);
      if (params.locationFilter) hiddenGemFilters.push(params.locationFilter);
      hiddenGemFilters.push(...params.qualityFilters);
      const recordsLimit = params.executionProfile.hiddenGemLimit;
      if (recordsLimit > 0) {
        rounds.push({
          round: "hidden_gem",
          budgetPool: "hidden",
          budgetWeight: recordsLimit,
          request: {
            datasetId: params.datasetId,
            recordsLimit,
            filter: { operator: "and", filters: hiddenGemFilters },
          },
          diagnostics: withPersona({
            round: "hidden_gem",
            requested_count: recordsLimit,
            title_terms: lateralTitles,
            skill_signal_groups: params.signalGroups,
            location_mode: params.locationMode,
          }, {
            kind: "adjacent_strong",
            label: "Adjacent strong technical operators",
            intent: "Find credible adjacent backend/platform/infrastructure engineers who may be missed by exact JD titles.",
            titleTerms: lateralTitles,
            skillTerms: differentiatingTerms,
          }),
        });
      }
    }
  }

  const targetCompanies = params.recallSpec.target_companies.filter((company) => company.length >= 2);
  if (targetCompanies.length > 0) {
    const companyFilters: BrightDataFilterRule[] = [
      {
        operator: "or",
        filters: targetCompanies.slice(0, 15).map((company) => {
          const exactMatch = normalizeText(company).length <= 5;
          return {
            name: "current_company_name",
            operator: exactMatch ? "=" : "includes",
            value: company,
          };
        }),
      },
    ];
    if (params.countryFilter) companyFilters.push(params.countryFilter);

    const companyTitleTerms = params.isDataPlatformRole
      ? compactTerms([
        ...DATA_PLATFORM_COMPANY_TARGET_TITLES,
        ...params.standardTitleTerms,
        ...lateralTitles,
      ], 18)
      : compactTerms([
        ...params.standardTitleTerms,
        ...DEFAULT_HIDDEN_GEM_TITLES,
      ], 10);
    const companyTitleFilter = buildTitleFilter(companyTitleTerms, params.isDataPlatformRole ? 18 : 12);
    const strictCompanySkillFilter = params.isDataPlatformRole
      ? buildCompanyTargetSkillFilter(params.recallSpec, params.signalGroups, { dataPlatformRole: true })
      : buildBroadRecallSkillFilter(params.recallSpec, params.signalGroups, 10);
    const companySkillFilter = strictCompanySkillFilter;
    const companyEvidenceFilter = params.isDataPlatformRole
      ? combineEvidenceFilters([companyTitleFilter, companySkillFilter])
      : combineEvidenceFilters([companyTitleFilter, companySkillFilter]);
    if (companyEvidenceFilter) companyFilters.push(companyEvidenceFilter);
    companyFilters.push(...params.qualityFilters);
    const recordsLimit = params.executionProfile.companyTargetLimit;
    if (recordsLimit > 0) {
      rounds.push({
        round: "company_target",
        budgetPool: "company",
        budgetWeight: recordsLimit,
        request: {
          datasetId: params.datasetId,
          recordsLimit,
          filter: { operator: "and", filters: companyFilters },
        },
        diagnostics: withPersona({
          round: "company_target",
          requested_count: recordsLimit,
          title_terms: companyTitleTerms,
          skill_signal_groups: params.signalGroups,
          location_mode: "country_only",
        }, {
          kind: "target_company",
          label: "Target-company engineers",
          intent: "Find engineers from target or adjacent companies with broad enough title/skill evidence for recruiter review.",
          titleTerms: companyTitleTerms,
          skillTerms: [
            ...params.signalGroups.search_domain,
            ...params.signalGroups.platform_engineering,
          ],
          companyTerms: targetCompanies,
        }),
      });
    }
  }

  return rounds;
}

export function buildBrightDataRecallFilters(
  parsed: Record<string, unknown>,
  candidateCount: number,
  executionProfile: SearchExecutionProfile,
  options: {
    normalizeRecallSpec: (
      value: unknown,
      requestedLimit: number,
      options?: { recordLimitOverride?: number },
    ) => RecallSpec;
    sanitizeHiringBrief: (
      value: unknown,
      fallbackParsed: Record<string, unknown>,
    ) => HiringBrief;
    buildStandardSkillFilter: (
      recallSpec: RecallSpec,
      mode: RecallFilterMode,
    ) => BrightDataFilterRule | null;
    buildRecallLocationFilter: (
      hiringBrief: HiringBrief,
      recallSpec: RecallSpec,
      countryCodes: string[],
      mode: RecallFilterMode,
    ) => BrightDataFilterRule | null;
    isPlaceholderTitle: (title: string | null | undefined) => boolean;
    hiddenGemLimit: number;
    companyTargetLimit: number;
  },
): RecallRound[] {
  const recallSpec = options.normalizeRecallSpec(parsed.recall_spec, candidateCount, {
    recordLimitOverride: executionProfile.filterLimit,
  });
  const headhunterStrategyMode = getHeadhunterRecallStrategyMode(parsed);
  const headhunterMode = headhunterStrategyMode !== "legacy";
  const headhunterBudgets = headhunterMode
    ? buildHeadhunterProbeBudgets(recallSpec, executionProfile, headhunterStrategyMode)
    : null;
  const hiringBrief = options.sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const locationMode = getRecallLocationMode(hiringBrief);
  const rawTitleTerms = recallSpec.title_variants.length > 0
    ? recallSpec.title_variants
    : [normalizeNullableString(parsed.title)].filter((value): value is string => Boolean(value));
  const parsedTitle = normalizeNullableString(parsed.title);
  const standardTitleTerms = buildEngineeringTitleTerms(rawTitleTerms, parsedTitle);
  const signalGroups = buildRecallSkillSignalGroups(recallSpec);
  const isDataPlatformRole = isDataPlatformPrimaryRole(parsed, recallSpec, hiringBrief);
  const roleFamily = getParsedRoleFamily(parsed, recallSpec);
  const primaryExactLane = recallSpec.sourcing_lanes.find((lane) => lane.lane_kind === "primary_exact");
  const primaryRelaxedLane = derivePrimaryRelaxedLane(recallSpec, primaryExactLane);
  const standardExecutionProfile = headhunterBudgets
    ? { ...executionProfile, filterLimit: headhunterBudgets.primaryExact }
    : executionProfile;
  const standardRequest = (
    headhunterMode && primaryExactLane
      ? buildHeadhunterLaneRecallRequest(
        parsed,
        recallSpec,
        hiringBrief,
        primaryExactLane,
        standardExecutionProfile.filterLimit,
        {
          buildRecallLocationFilter: options.buildRecallLocationFilter,
          isPlaceholderTitle: options.isPlaceholderTitle,
        },
      )
      : null
  ) ?? buildBrightDataRecallFilter(parsed, candidateCount, standardExecutionProfile, {
    normalizeRecallSpec: options.normalizeRecallSpec,
    sanitizeHiringBrief: options.sanitizeHiringBrief,
    buildStandardSkillFilter: options.buildStandardSkillFilter,
    buildRecallLocationFilter: options.buildRecallLocationFilter,
    isPlaceholderTitle: options.isPlaceholderTitle,
  });
  if (!standardRequest) return [];

  const dataPlatformStandardTitleTerms = isDataPlatformRole
    ? filterDataPlatformTitleTermsForSeniority(buildDataPlatformTitleTerms(recallSpec), hiringBrief)
    : [];
  const headhunterStandardTitleTerms =
    headhunterMode && primaryExactLane && !isDataPlatformRole
      ? buildSameRoleFamilyTitleTerms({
        lane: primaryExactLane,
        recallSpec,
        parsedTitle,
        fallbackTitleTerms: rawTitleTerms,
        roleFamily,
      })
      : [];
  const standardDiagnosticTitleTerms = dataPlatformStandardTitleTerms.length > 0
    ? dataPlatformStandardTitleTerms
    : headhunterStandardTitleTerms.length > 0
      ? headhunterStandardTitleTerms
    : standardTitleTerms;
  const standardDiagnosticSkillTerms =
    headhunterMode && primaryExactLane
      ? compactTerms([
        ...primaryExactLane.skill_terms,
        ...(primaryExactLane.non_negotiables ?? []),
        ...(primaryExactLane.relaxed_evidence ?? []),
      ], 18)
      : [
        ...signalGroups.search_domain,
        ...signalGroups.platform_engineering,
      ];
  const rounds: RecallRound[] = [{
    round: "standard",
    request: standardRequest,
    diagnostics: withPersona({
      round: "standard",
      requested_count: standardRequest.recordsLimit,
      title_terms: standardDiagnosticTitleTerms,
      skill_signal_groups: signalGroups,
      location_mode: locationMode,
    }, {
      kind: "standard_ic",
      label: headhunterMode ? "Primary exact headhunter lane" : "Standard matching IC engineers",
      intent: headhunterMode
        ? "Probe the most direct role-fit lane before spending more recall budget."
        : "Find the most direct title and role-fit profiles before exploring adjacent sourcing personas.",
      titleTerms: standardDiagnosticTitleTerms,
      skillTerms: standardDiagnosticSkillTerms,
    }),
  }];

  if (headhunterStrategyMode === "headhunter_v2") {
    const configuredLanes = recallSpec.sourcing_lanes
      .filter((lane) => lane.lane_kind !== "exploration")
      .slice(0, 4);
    const primaryLane = configuredLanes.find((lane) => lane.lane_kind === "primary_exact");
    const lanes = primaryLane
      ? [primaryLane, ...configuredLanes.filter((lane) => lane !== primaryLane)]
      : configuredLanes;
    const totalBudget = Math.max(
      1,
      Math.round(
        executionProfile.filterLimit +
        executionProfile.hiddenGemLimit +
        executionProfile.companyTargetLimit,
      ),
    );
    const laneLimits = allocateWeightedLimits(
      lanes.map((lane, index) => ({
        index,
        weight:
          typeof lane.initial_budget === "number" && Number.isFinite(lane.initial_budget)
            ? lane.initial_budget
            : typeof lane.budget_weight === "number" && Number.isFinite(lane.budget_weight)
              ? lane.budget_weight
              : 1,
      })),
      totalBudget,
    );
    const laneRounds = lanes.flatMap((lane, index): RecallRound[] => {
      const limit = laneLimits.get(index) ?? 0;
      if (limit <= 0) return [];
      const request = buildHeadhunterLaneRecallRequest(
        parsed,
        recallSpec,
        hiringBrief,
        lane,
        limit,
        {
          buildRecallLocationFilter: options.buildRecallLocationFilter,
          isPlaceholderTitle: options.isPlaceholderTitle,
        },
      );
      if (!request) return [];
      const isPrimary = index === 0;
      const round = isPrimary ? "standard" : `lane_${index + 1}`;
      return [{
        round,
        request,
        diagnostics: withPersona({
          round,
          requested_count: request.recordsLimit,
          title_terms: lane.title_terms,
          skill_signal_groups: signalGroups,
          location_mode: locationMode,
        }, {
          kind: lane.lane_kind === "target_company_engineering" ? "target_company" : "skill_depth",
          label: lane.target_persona || `Headhunter lane ${index + 1}`,
          intent: lane.target_persona || "Find candidates in an approved sourcing lane.",
          titleTerms: lane.title_terms,
          skillTerms: lane.skill_terms,
        }),
      }];
    });
    if (laneRounds.length > 0) return laneRounds;
  }

  if (headhunterMode) {
    const relaxedLimit = headhunterBudgets?.primaryRelaxed ?? 0;
    if (relaxedLimit <= 0) return rounds;
    const relaxedRequest = primaryRelaxedLane
      ? buildHeadhunterLaneRecallRequest(
        parsed,
        recallSpec,
        hiringBrief,
        primaryRelaxedLane,
        relaxedLimit,
        {
          buildRecallLocationFilter: options.buildRecallLocationFilter,
          isPlaceholderTitle: options.isPlaceholderTitle,
        },
      )
      : null;
    if (!relaxedRequest) return rounds;
    const relaxedDiagnosticTitleTerms =
      primaryRelaxedLane && !isDataPlatformRole
        ? buildSameRoleFamilyTitleTerms({
          lane: primaryRelaxedLane,
          recallSpec,
          parsedTitle,
          fallbackTitleTerms: rawTitleTerms,
          roleFamily,
        })
        : standardDiagnosticTitleTerms;
    const relaxedDiagnosticSkillTerms =
      primaryRelaxedLane
        ? compactTerms([
          ...primaryRelaxedLane.skill_terms,
          ...(primaryRelaxedLane.non_negotiables ?? []),
          ...(primaryRelaxedLane.relaxed_evidence ?? []),
        ], 18)
        : standardDiagnosticSkillTerms;
    return [
      ...rounds,
      {
        round: "primary_relaxed",
        request: relaxedRequest,
        diagnostics: withPersona({
          round: "primary_relaxed",
          requested_count: relaxedRequest.recordsLimit,
          title_terms: relaxedDiagnosticTitleTerms,
          skill_signal_groups: signalGroups,
          location_mode: locationMode,
        }, {
          kind: "skill_depth",
          label: "Primary relaxed headhunter lane",
          intent: "Probe same-role-family profiles that may use adjacent titles but still need equivalent evidence before expansion.",
          titleTerms: relaxedDiagnosticTitleTerms,
          skillTerms: relaxedDiagnosticSkillTerms,
        }),
      },
    ];
  }

  if (recallSpec.recall_strategy !== "multi_round") return rounds;

  const datasetId = standardRequest.datasetId;
  const countryCodes = recallSpec.countries
    .map((country) => normalizeCountryCode(country))
    .filter((country): country is string => Boolean(country))
    .slice(0, 4);

  const qualityFilters = buildQualityFilters();
  const countryFilter = buildCountryFilter(countryCodes);
  const locationFilter = locationMode === "location_filter"
    ? options.buildRecallLocationFilter(
      hiringBrief,
      recallSpec,
      countryCodes,
      "primary",
    )
    : null;

  const supplementalRounds = [
    ...buildDeterministicExpansionRounds({
      datasetId,
      recallSpec,
      hiringBrief,
      executionProfile,
      countryFilter,
      locationFilter,
      qualityFilters,
      signalGroups,
      isDataPlatformRole,
      standardTitleTerms,
      locationMode,
    }),
    ...buildLlmSupplementalRounds({
      datasetId,
      recallSpec,
      countryFilter,
      locationFilter,
      qualityFilters,
      signalGroups,
      locationMode,
    }),
  ];

  const prunedSupplementalRounds = pruneLowBudgetLlmSupplementalRounds(
    supplementalRounds,
    executionProfile,
  );

  return [
    ...rounds,
    ...rebalanceSupplementalRoundLimits(prunedSupplementalRounds, executionProfile),
  ];
}
