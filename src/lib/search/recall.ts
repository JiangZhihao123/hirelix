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
import type { SearchExecutionProfile } from "@/lib/search-execution";
import type {
  CandidateDeliveryBucket,
  CandidateDisplayTier,
  CandidateRowInput,
  HiringBrief,
  RecallRoundDiagnostics,
  RecallSpec,
  ScoredCandidateAssessment,
} from "@/lib/search/types";

export type RecallFilterMode = "primary" | "relaxed";

export type RecallRound = {
  round: "standard" | "hidden_gem" | "company_target";
  request: BrightDataDatasetFilterRequest;
  diagnostics: Omit<RecallRoundDiagnostics, "filter_hash" | "returned_count" | "quality_distribution">;
};

const MAX_BRIGHT_OR_FILTERS = 20;

const NON_SEARCHABLE_RECALL_SIGNAL_PATTERNS = [
  /\bus[-\s]?based\b/i,
  /\bin\s+sf\s+nyc\s+or\s+seattle\b/i,
  /\bin\s+sf\b/i,
  /\bnyc\s+or\s+seattle\b/i,
  /\bhybrid\b/i,
  /\brelocat/i,
  /\bopen to/i,
];

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

function includesAnyKeyword(term: string, keywords: string[]) {
  const normalized = normalizeText(term);
  return keywords.some((keyword) => normalized.includes(keyword));
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
        name: "about",
        operator: "includes" as const,
        value: term,
      })),
      ...normalizedTerms.map((term) => ({
        name: "position",
        operator: "includes" as const,
        value: term,
      })),
    ].slice(0, MAX_BRIGHT_OR_FILTERS),
  };
}

function combineEvidenceFilters(filters: Array<BrightDataFilterRule | null>) {
  const presentFilters = filters.filter(
    (filter): filter is BrightDataFilterRule => Boolean(filter),
  );
  if (presentFilters.length === 0) return null;
  return presentFilters.length === 1
    ? presentFilters[0]
    : { operator: "or" as const, filters: presentFilters };
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

function buildTitleFilter(titleTerms: string[]): BrightDataFilterRule | null {
  const terms = compactTerms(titleTerms, 12);
  if (terms.length === 0) return null;
  return {
    operator: "or",
    filters: terms.map((term) => ({
      name: "position",
      operator: "includes",
      value: term,
    })),
  };
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
  return hiringBrief.relocation_allowed === "yes" && hiringBrief.location_flexibility !== "strict"
    ? "country_only" as const
    : "location_filter" as const;
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
  const countryCodes = recallSpec.countries
    .map((country) => normalizeCountryCode(country))
    .filter((country): country is string => Boolean(country))
    .slice(0, 4);

  const titleFilter = buildTitleFilter(titleTerms);
  if (!titleFilter) return null;

  const rootFilters: BrightDataFilterRule[] = [titleFilter];

  const countryFilter = buildCountryFilter(countryCodes);
  if (countryFilter) rootFilters.push(countryFilter);

  const standardSkillFilter =
    mode === "relaxed"
      ? options.buildStandardSkillFilter(recallSpec, mode)
      : buildBalancedSkillFilter(recallSpec);
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
  const standardRequest = buildBrightDataRecallFilter(parsed, candidateCount, executionProfile, {
    normalizeRecallSpec: options.normalizeRecallSpec,
    sanitizeHiringBrief: options.sanitizeHiringBrief,
    buildStandardSkillFilter: options.buildStandardSkillFilter,
    buildRecallLocationFilter: options.buildRecallLocationFilter,
    isPlaceholderTitle: options.isPlaceholderTitle,
  });
  if (!standardRequest) return [];

  const recallSpec = options.normalizeRecallSpec(parsed.recall_spec, candidateCount, {
    recordLimitOverride: executionProfile.filterLimit,
  });
  const hiringBrief = options.sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const locationMode = getRecallLocationMode(hiringBrief);
  const rawTitleTerms = recallSpec.title_variants.length > 0
    ? recallSpec.title_variants
    : [normalizeNullableString(parsed.title)].filter((value): value is string => Boolean(value));
  const standardTitleTerms = buildEngineeringTitleTerms(rawTitleTerms, normalizeNullableString(parsed.title));
  const signalGroups = buildRecallSkillSignalGroups(recallSpec);
  const rounds: RecallRound[] = [{
    round: "standard",
    request: standardRequest,
    diagnostics: {
      round: "standard",
      requested_count: standardRequest.recordsLimit,
      title_terms: standardTitleTerms,
      skill_signal_groups: signalGroups,
      location_mode: locationMode,
    },
  }];

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

  const lateralTitles = compactTerms([
    ...recallSpec.lateral_title_variants,
    ...DEFAULT_HIDDEN_GEM_TITLES,
  ], 10).filter((term) => term !== "data engineer");
  const differentiatingTerms = compactTerms([
    ...signalGroups.search_domain,
    ...signalGroups.platform_engineering,
  ], 10);

  if (lateralTitles.length > 0 && differentiatingTerms.length > 0) {
    const hiddenSignalFilter = buildBalancedSkillFilter({
      ...recallSpec,
      core_skill_terms: signalGroups.platform_engineering,
      baseline_skill_terms: signalGroups.platform_engineering,
      differentiating_skill_terms: signalGroups.search_domain,
      domain_terms: signalGroups.search_domain,
      must_have_signals: signalGroups.search_domain,
    });
    if (!hiddenSignalFilter) return rounds;
    const hiddenGemFilters: BrightDataFilterRule[] = [
      {
        operator: "or",
        filters: lateralTitles.map((term) => ({
          name: "position",
          operator: "includes",
          value: term,
        })),
      },
    ];
    if (countryFilter) hiddenGemFilters.push(countryFilter);
    hiddenGemFilters.push(hiddenSignalFilter);
    if (locationFilter) hiddenGemFilters.push(locationFilter);
    hiddenGemFilters.push(...qualityFilters);
    const recordsLimit = executionProfile.hiddenGemLimit;
    if (recordsLimit <= 0) return rounds;

    rounds.push({
      round: "hidden_gem",
      request: {
        datasetId,
        recordsLimit,
        filter: { operator: "and", filters: hiddenGemFilters },
      },
      diagnostics: {
        round: "hidden_gem",
        requested_count: recordsLimit,
        title_terms: lateralTitles,
        skill_signal_groups: signalGroups,
        location_mode: locationMode,
      },
    });
  }

  const targetCompanies = recallSpec.target_companies.filter((company) => company.length >= 2);
  if (targetCompanies.length > 0) {
    const companyFilters: BrightDataFilterRule[] = [
      {
        operator: "or",
        filters: targetCompanies.slice(0, 15).map((company) => ({
          name: "current_company_name",
          operator: "includes",
          value: company,
        })),
      },
    ];
    if (countryFilter) companyFilters.push(countryFilter);

    const companyTitleTerms = compactTerms([
      ...standardTitleTerms,
      ...DEFAULT_HIDDEN_GEM_TITLES,
    ], 10);
    const companyTitleFilter = buildTitleFilter(companyTitleTerms);
    if (companyTitleFilter) companyFilters.push(companyTitleFilter);
    companyFilters.push(...qualityFilters);
    const recordsLimit = executionProfile.companyTargetLimit;
    if (recordsLimit <= 0) return rounds;

    rounds.push({
      round: "company_target",
      request: {
        datasetId,
        recordsLimit,
        filter: { operator: "and", filters: companyFilters },
      },
      diagnostics: {
        round: "company_target",
        requested_count: recordsLimit,
        title_terms: companyTitleTerms,
        skill_signal_groups: signalGroups,
        location_mode: "country_only",
      },
    });
  }

  return rounds;
}
