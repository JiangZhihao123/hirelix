import type { BrightDataProfile } from "@/lib/brightdata";
import type {
  BrightDataDatasetFilterRequest,
  BrightDataFilterRule,
} from "@/lib/brightdata";
import { buildPendingGithubSignals } from "@/lib/github-signals";
import {
  normalizeCandidateRowInput,
  normalizeCountryCode,
  normalizeNullableString,
  normalizeScrapedDescription,
  normalizeText,
} from "@/lib/search/normalize";
import type { SearchExecutionProfile } from "@/lib/search-execution";
import type {
  CandidateDisplayTier,
  CandidateRowInput,
  HiringBrief,
  RecallSpec,
  ScoredCandidateAssessment,
} from "@/lib/search/types";

export type RecallFilterMode = "primary" | "relaxed";

export type RecallRound = {
  round: "standard" | "hidden_gem" | "company_target";
  request: BrightDataDatasetFilterRequest;
};

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
  },
) {
  const rows: CandidateRowInput[] = [];

  for (const item of selected.slice(0, limit)) {
    const rawIndex = item.index;
    if (!Number.isFinite(rawIndex) || rawIndex < 0 || rawIndex >= profiles.length) continue;

    const profile = profiles[rawIndex];
    const displayTier = options.getDisplayTierForAssessment(item);
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
      github_url: null,
      email: null,
      outreach_draft: null,
      metadata: {
        source: "brightdata",
        analysis_stage: "final",
        preliminary: false,
        pool_type: poolType,
        scoring_method: item.scoring_method || "dual_review_auto",
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
  const titleTerms = (recallSpec.title_variants.length > 0
    ? recallSpec.title_variants
    : [normalizeNullableString(parsed.title)].filter((value): value is string => Boolean(value)))
    .filter((term) => !options.isPlaceholderTitle(term));

  if (titleTerms.length === 0) return null;

  const hiringBrief = options.sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const countryCodes = recallSpec.countries
    .map((country) => normalizeCountryCode(country))
    .filter((country): country is string => Boolean(country))
    .slice(0, 4);

  const rootFilters: BrightDataFilterRule[] = [
    {
      operator: "or",
      filters: titleTerms.map((term) => ({
        name: "position",
        operator: "includes",
        value: term,
      })),
    },
  ];

  if (countryCodes.length > 0) {
    rootFilters.push(
      countryCodes.length === 1
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
        },
    );
  }

  const standardSkillFilter = options.buildStandardSkillFilter(recallSpec, mode);
  if (standardSkillFilter) {
    rootFilters.push(standardSkillFilter);
  }

  const locationFilter = options.buildRecallLocationFilter(
    hiringBrief,
    recallSpec,
    countryCodes,
    mode,
  );
  if (locationFilter) {
    rootFilters.push(locationFilter);
  }

  rootFilters.push({ name: "default_avatar", operator: "=", value: false });
  rootFilters.push({ name: "connections", operator: ">=", value: 50 });

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

  const rounds: RecallRound[] = [{ round: "standard", request: standardRequest }];

  const recallSpec = options.normalizeRecallSpec(parsed.recall_spec, candidateCount, {
    recordLimitOverride: executionProfile.filterLimit,
  });
  if (recallSpec.recall_strategy !== "multi_round") return rounds;

  const datasetId = standardRequest.datasetId;
  const hiringBrief = options.sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const countryCodes = recallSpec.countries
    .map((country) => normalizeCountryCode(country))
    .filter((country): country is string => Boolean(country))
    .slice(0, 4);

  const qualityFilters: BrightDataFilterRule[] = [
    { name: "default_avatar", operator: "=", value: false },
    { name: "connections", operator: ">=", value: 50 },
  ];

  const countryFilter: BrightDataFilterRule | null =
    countryCodes.length === 1
      ? { name: "country_code", operator: "=", value: countryCodes[0] }
      : countryCodes.length > 1
        ? {
          operator: "or",
          filters: countryCodes.map((country) => ({
            name: "country_code",
            operator: "=",
            value: country,
          })),
        }
        : null;
  const locationFilter = options.buildRecallLocationFilter(
    hiringBrief,
    recallSpec,
    countryCodes,
    "primary",
  );

  const lateralTitles = recallSpec.lateral_title_variants.filter((term) => term.length >= 3);
  const differentiatingTerms = (
    recallSpec.differentiating_skill_terms.length > 0
      ? [...recallSpec.differentiating_skill_terms, ...recallSpec.baseline_skill_terms]
      : [...recallSpec.core_skill_terms, ...recallSpec.baseline_skill_terms]
  )
    .map((term) => normalizeText(term))
    .filter((term) => term.length >= 2)
    .slice(0, 8);

  if (lateralTitles.length > 0 && differentiatingTerms.length > 0) {
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
    hiddenGemFilters.push({
      operator: "or",
      filters: [
        ...differentiatingTerms.map((term) => ({
          name: "about",
          operator: "includes" as const,
          value: term,
        })),
        ...differentiatingTerms.map((term) => ({
          name: "position",
          operator: "includes" as const,
          value: term,
        })),
      ].slice(0, 20),
    });
    if (locationFilter) hiddenGemFilters.push(locationFilter);
    hiddenGemFilters.push(...qualityFilters);

    rounds.push({
      round: "hidden_gem",
      request: {
        datasetId,
        recordsLimit: executionProfile.hiddenGemLimit || options.hiddenGemLimit,
        filter: { operator: "and", filters: hiddenGemFilters },
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

    const companyTitleTerms = recallSpec.title_variants.slice(0, 6);
    const companySkillTerms = [...differentiatingTerms, ...recallSpec.core_skill_terms.slice(0, 6)];
    const companyRelevanceFilters: BrightDataFilterRule[] = [
      ...companyTitleTerms.map((term) => ({
        name: "position",
        operator: "includes" as const,
        value: term,
      })),
      ...companySkillTerms.map((term) => ({
        name: "about",
        operator: "includes" as const,
        value: term,
      })),
    ].slice(0, 20);
    if (companyRelevanceFilters.length > 0) {
      companyFilters.push({ operator: "or", filters: companyRelevanceFilters });
    }
    companyFilters.push(...qualityFilters);

    rounds.push({
      round: "company_target",
      request: {
        datasetId,
        recordsLimit: executionProfile.companyTargetLimit || options.companyTargetLimit,
        filter: { operator: "and", filters: companyFilters },
      },
    });
  }

  return rounds;
}
