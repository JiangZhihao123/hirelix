import { CANDIDATE_SUITABILITY_PROMPT } from "@/lib/prompts";
import type {
  BlockingSeverity,
  CandidateRowInput,
  JudgeScoreResult,
  ScoredCandidateAssessment,
  ShortlistDecision,
} from "@/lib/search/types";
import { mergeCandidateRows } from "@/lib/search/recall";

export function buildJudgeScorePrompt(
  parsed: Record<string, unknown>,
  jdText: string,
  richProfiles: string,
  poolSize: number,
  judgeLabel: "Judge A" | "Judge B",
  options: {
    truncateForPrompt: (text: string, maxChars: number) => string;
    buildPromptSearchContext: (parsed: Record<string, unknown>) => string;
    expectedIndexes?: number[];
    mode?: "fast" | "deep";
  },
) {
  const mode = options.mode ?? "deep";
  const styleHint =
    judgeLabel === "Judge A"
      ? "Lean slightly toward recruiter optimism, but do not violate hard constraints."
      : "Lean slightly toward recruiter skepticism, but do not over-penalize strong evidence.";
  const fastJsonShape = poolSize === 1
    ? `{
  "index": 0,
  "capability_score": 0,
  "relevance_score": 0,
  "join_likelihood_score": 0,
  "advance_recommendation": "advance | hold | reject",
  "shortlist_decision": "yes | no",
  "primary_risk": "string | null",
  "first_contact_confidence": "high | medium | low",
  "blocking_severity": "hard | soft | none",
  "short_reasons": ["string"],
  "evidence_quality": "high | medium | low"
}`
    : `[
  {
    "index": 0,
    "capability_score": 0,
    "relevance_score": 0,
    "join_likelihood_score": 0,
    "advance_recommendation": "advance | hold | reject",
    "shortlist_decision": "yes | no",
    "primary_risk": "string | null",
    "first_contact_confidence": "high | medium | low",
    "blocking_severity": "hard | soft | none",
    "short_reasons": ["string"],
    "evidence_quality": "high | medium | low"
  }
]`;
  const deepJsonShape = poolSize === 1
    ? `{
  "index": 0,
  "capability_score": 0,
  "relevance_score": 0,
  "join_likelihood_score": 0,
  "constraint_verdicts": {
    "location_fit": "local | nearby | non_local | unknown",
    "work_model_fit": "yes | no | unclear",
    "must_have_coverage": "strong | partial | weak | unknown"
  },
  "primary_risk": "string | null",
  "first_contact_confidence": "high | medium | low",
  "blocking_constraints": ["string"],
  "blocking_severity": "hard | soft | none",
  "advance_recommendation": "advance | hold | reject",
  "shortlist_decision": "yes | no",
  "short_reasons": ["string"],
  "risk_flags": ["string"],
  "evidence_quality": "high | medium | low"
}`
    : `[
  {
    "index": 0,
    "capability_score": 0,
    "relevance_score": 0,
    "join_likelihood_score": 0,
    "constraint_verdicts": {
      "location_fit": "local | nearby | non_local | unknown",
      "work_model_fit": "yes | no | unclear",
      "must_have_coverage": "strong | partial | weak | unknown"
    },
    "primary_risk": "string | null",
    "first_contact_confidence": "high | medium | low",
    "blocking_constraints": ["string"],
    "blocking_severity": "hard | soft | none",
    "advance_recommendation": "advance | hold | reject",
    "shortlist_decision": "yes | no",
    "short_reasons": ["string"],
    "risk_flags": ["string"],
    "evidence_quality": "high | medium | low"
  }
]`;
  const jsonShape = mode === "fast" ? fastJsonShape : deepJsonShape;
  const expectedIndexes = options.expectedIndexes ?? [];
  const allowedIndexText = expectedIndexes.length
    ? `Allowed index values for this batch: ${expectedIndexes.join(", ")}.`
    : "";
  const indexRule = poolSize === 1
    ? `Return exactly one JSON object. Use the exact candidate index shown in the profile header (for example "[57] Name" means "index": 57). ${allowedIndexText}`.trim()
    : `Return one object per profile. Use the exact candidate index shown in each profile header, not the row position inside this batch. For example, if the header is "[57] Jane", return "index": 57, never "index": 0. ${allowedIndexText}`.trim();

  const sharedRules = `Rules:
- ${styleHint}
- ${indexRule}
- capability_score measures how strong the person is overall in seniority, depth, and execution track record. Profiles with only bootcamp credentials and no professional engineering tenure beyond internships should receive capability_score <= 40.
- relevance_score measures how directly their real background matches this JD's stack, responsibilities, and domain. Domain experience in the hiring company's industry (stated in hiring_brief) should boost relevance_score.
- join_likelihood_score measures how realistic it is that they would seriously consider this specific opportunity. Availability signals such as job-seeking, recent end-date, employment gap, or open-to-work can increase response likelihood, but active job-search language is not quality evidence and should not by itself create advance_recommendation=advance or first_contact_confidence=high in this passive-candidate workflow.
- blocking_severity should be hard only for explicit incompatibilities unrelated to location. Location is pre-assessed separately; do not hard-block on current city alone.
- advance_recommendation should reflect whether this candidate is worth moving forward in the real world.
- shortlist_decision should answer whether this person deserves to appear in a recruiter-curated shortlist.
- Do not collapse quality because of sparse evidence alone. Use evidence_quality and risk fields to express uncertainty.
- Reserve very low capability/relevance for explicit mismatch, not just missing fields.
- Do not reward prestige alone.
- For remote roles with an eligible country or region in Search Intent, set work_model_fit=yes when the profile location is eligible and there is no explicit work-model conflict. Do not mark work_model_fit=unclear merely because the profile does not state remote preference.
- For onsite or hybrid roles, require concrete location/work-model evidence before setting work_model_fit=yes.
- For IC engineering roles, people-management, program-management, director, or executive profiles are role mismatches unless the profile shows recent hands-on IC backend ownership. Mark shortlist_decision=no and list the mismatch in risk_flags/blocking_constraints.
- For Staff/Principal/Lead data platform, data infrastructure, or streaming platform roles, relevance_score >= 75 and must_have_coverage=strong require concrete evidence of shared platform ownership used by other engineers or data teams. Generic ETL, warehousing, dashboarding, migration, or pipeline delivery is not enough by itself.
- For those senior platform roles, active job-search headlines, certification stacks, tool lists, or vendor keyword lists can support join_likelihood or baseline skills, but must not create high capability_score, high relevance_score, or shortlist_decision=yes without ownership evidence.
- For senior data/streaming infrastructure roles, treat concrete evidence like Apache Druid/Spark core engine work, big data compute ownership, distributed data systems, Kafka/Pulsar streaming platforms, or recognized open-source committer/PMC work as strong platform evidence. Do not reject or mark do_not_show merely because one named tool such as Kafka is absent when comparable core platform evidence is explicit.
- Still distinguish platform engineering from analytics delivery: Snowflake/warehouse/BI/dashboard/ETL/pipeline migration evidence alone is not comparable core platform evidence and should remain partial or weak.
- must_have_coverage=strong requires concrete profile evidence for the JD's core must-haves. If a core must-have is merely implied by title/company, mark partial or unknown and list the gap in risk_flags.
- evidence_quality=high requires concrete evidence in the profile text, not prestige, senior title, or employer brand alone.
- first_contact_confidence=high requires no unresolved must-have gap, work-model uncertainty for the role type, or major verification risk. For remote roles, eligible country/location plus no explicit conflict is not work-model uncertainty.
- Keep short_reasons concrete and short. Max 2 items, each under 14 words.
- first_contact_confidence should reflect whether a recruiter would feel good reaching out immediately.
- Do not speculate about relocation or work authorization.
- Return ONLY valid JSON. Do NOT wrap the JSON in markdown code blocks.`;
  const deepOnlyRules = `Deep review additions:
- Keep the response compact. Do not include skills, location, experience_years, or long narrative fields.
- Use blocking_constraints to explicitly call out real blockers such as location, work model, seniority, authorization, or company-stage mismatch. Max 2 items, each under 8 words.
- If evidence is missing, unclear, or unverifiable, use soft, not hard.
- Use shortlist_decision=yes for candidates you would genuinely include today; use no for weak, risky, or speculative fits.
- Keep short_reasons concrete and evidence-based. Max 2 items, each under 10 words.
- Keep risk_flags concrete and short. Max 2 items, each under 8 words.`;

  return `You are ${judgeLabel}, one of two independent hiring reviewers.

## Task
Review each candidate independently using this exact JSON shape:
${jsonShape}

${sharedRules}
${mode === "deep" ? `\n${deepOnlyRules}` : ""}

## Original Job Description
${options.truncateForPrompt(jdText.trim(), 5000)}

## Search Intent
${options.buildPromptSearchContext(parsed)}

## Candidate Profiles (${poolSize} candidates)
The profiles below are raw candidate profiles derived from LinkedIn data.

${richProfiles}`;
}

export function buildArbiterPrompt(
  parsed: Record<string, unknown>,
  jdText: string,
  profileText: string,
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
  options: {
    truncateForPrompt: (text: string, maxChars: number) => string;
    buildPromptSearchContext: (parsed: Record<string, unknown>) => string;
    buildCompanyProfileContext: (parsed: Record<string, unknown>) => string;
  },
) {
  const candidateIndex = judgeA.index;
  return `${CANDIDATE_SUITABILITY_PROMPT}

You are the scoring arbiter. Two independent reviewers disagreed on this candidate. Your job is to resolve the conflict and return a single final decision.

## Original Job Description
${options.truncateForPrompt(jdText.trim(), 5000)}

## Search Intent
${options.buildPromptSearchContext(parsed)}

## Company Context
${options.buildCompanyProfileContext(parsed)}

## Candidate Profile
${profileText}

## Judge A
${JSON.stringify(judgeA, null, 2)}

## Judge B
${JSON.stringify(judgeB, null, 2)}

## Your Task
Return exactly one final assessment object for this candidate. Resolve the disagreement rather than averaging blindly.

Rules:
- The assessment "index" must be ${candidateIndex}. This is the exact candidate index from the profile header and reviewer outputs.
- Return tri-scores plus explicit quality/advance outputs.
- quality_score should reflect only candidate quality for this JD: capability + relevance.
- advance_score should reflect real-world advanceability: quality + join likelihood - blocker severity.
- join_likelihood_score can influence advance_score but must not directly drag down quality_score.
- Sparse or incomplete profile evidence should lower confidence tags first, not automatically collapse quality_score.
- Reserve very low quality_score for clear mismatch, not mere missing details.
- Location eligibility is pre-assessed by a dedicated module — do not hard-block based on location alone. Focus arbitration on capability, relevance, and join likelihood.
- If work model, authorization, seniority, or company-stage mismatch is a real blocker, list it in blocking_constraints.
- Use hard blocker only for explicit, unambiguous conflicts (wrong function, clear seniority mismatch, explicit authorization barrier); unknown or sparse evidence must be soft.
- Keep text fields concise: max 3 bullets per array, each under 16 words.
- Return ONLY valid JSON array with one object using this exact shape:
[
  {
    "index": ${candidateIndex},
    "capability_score": 0,
    "relevance_score": 0,
    "join_likelihood_score": 0,
    "quality_score": 0,
    "advance_score": 0,
    "advance_recommendation": "advance | hold | reject",
    "shortlist_decision": "yes | no",
    "shortlist_reason": "string | null",
    "primary_risk": "string | null",
    "first_contact_confidence": "high | medium | low",
    "blocking_constraints": ["string"],
    "blocking_severity": "hard | soft | none",
    "join_likelihood_reasons": ["string"],
    "constraint_verdicts": {
      "location_fit": "local | nearby | non_local | unknown",
      "work_model_fit": "yes | no | unclear",
      "must_have_coverage": "strong | partial | weak | unknown"
    },
    "risk_flags": ["string"],
    "why_this_candidate": ["string"],
    "why_not_higher": ["string"],
    "skills": ["string"],
    "experience_years": 0,
    "location": "string | null",
    "evidence_quality": "high | medium | low",
    "why_reachable_now": "string | null"
  }
]
- shortlist_decision should answer whether this candidate belongs in the recruiter-visible shortlist.
- shortlist_reason should be a short, concrete explanation for that yes/no decision.
- Return ONLY valid JSON array with one object.`;
}

export function parseScoredAssessments(
  raw: unknown,
  poolSize: number,
  options: {
    sanitizeCandidateSuitability: (value: unknown) => ScoredCandidateAssessment["suitability"] | null;
    normalizeStringArray: (value: unknown, maxItems: number) => string[];
    normalizeExperienceYears: (value: unknown) => number | null;
    normalizeNullableString: (value: unknown) => string | null;
    sortCandidateAssessments: (
      left: ScoredCandidateAssessment,
      right: ScoredCandidateAssessment,
    ) => number;
  },
): ScoredCandidateAssessment[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry): ScoredCandidateAssessment | null => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const rawIndex = typeof item.index === "number" ? item.index : Number(item.index);
      if (!Number.isFinite(rawIndex) || rawIndex < 0 || rawIndex >= poolSize) return null;
      const suitability = options.sanitizeCandidateSuitability(item);
      if (!suitability) return null;
      return {
        index: rawIndex,
        suitability,
        skills: options.normalizeStringArray(item.skills, 10),
        experience_years: options.normalizeExperienceYears(item.experience_years),
        location: options.normalizeNullableString(item.location),
        why_reachable_now: options.normalizeNullableString(item.why_reachable_now),
      };
    })
    .filter((entry): entry is ScoredCandidateAssessment => Boolean(entry))
    .sort(options.sortCandidateAssessments);
}

export function parseJudgeScoreResults(
  raw: unknown,
  poolSize: number,
  expectedIndexes: number[] = [],
  options: {
    sanitizeCandidateSuitability: (value: unknown) => ScoredCandidateAssessment["suitability"] | null;
    normalizeScore: (value: unknown) => number;
    stripSpeculativeRelocation: (texts: string[]) => string[];
    normalizeStringArray: (value: unknown, maxItems: number) => string[];
    normalizeBlockingConstraints: (value: unknown) => string[];
    normalizeBlockingSeverity: (value: unknown) => BlockingSeverity;
    normalizeAdvanceRecommendation: (value: unknown) => JudgeScoreResult["advance_recommendation"];
    normalizeEnumValue: <T extends string>(value: unknown, allowed: readonly T[], fallback: T) => T;
    deriveShortlistDecision: (
      advanceRecommendation: JudgeScoreResult["advance_recommendation"],
      blockingSeverity: BlockingSeverity,
    ) => ShortlistDecision;
    normalizeNullableString: (value: unknown) => string | null;
    sanitizeConstraintVerdicts: (value: unknown) => JudgeScoreResult["constraint_verdicts"];
    normalizeExperienceYears: (value: unknown) => number | null;
  },
): JudgeScoreResult[] {
  const entries = Array.isArray(raw)
    ? raw
    : (raw && typeof raw === "object"
      ? ((raw as Record<string, unknown>).assessments && Array.isArray((raw as Record<string, unknown>).assessments)
        ? (raw as Record<string, unknown>).assessments as unknown[]
        : [raw])
      : []);
  if (entries.length === 0) return [];
  const fallbackIndex = expectedIndexes.length === 1 ? expectedIndexes[0] : null;
  const expectedIndexSet = new Set(expectedIndexes);
  const canMapBatchRelativeIndex = expectedIndexes.length > 1;

  return entries
    .map((entry): JudgeScoreResult | null => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const rawIndexValue =
        typeof item.index === "number"
          ? item.index
          : item.index != null
            ? Number(item.index)
            : fallbackIndex;
      if (!Number.isFinite(rawIndexValue) || rawIndexValue == null) return null;
      const rawIndex = rawIndexValue;
      if (!Number.isFinite(rawIndex) || rawIndex < 0) return null;
      const normalizedIndex =
        expectedIndexSet.has(rawIndex)
          ? rawIndex
          : canMapBatchRelativeIndex && rawIndex < expectedIndexes.length
            ? expectedIndexes[rawIndex]
            : rawIndex;
      if (
        !Number.isFinite(normalizedIndex) ||
        normalizedIndex < 0 ||
        normalizedIndex >= poolSize
      ) {
        return null;
      }
      const suitability = options.sanitizeCandidateSuitability(item);
      return {
        index: normalizedIndex,
        capability_score: options.normalizeScore(item.capability_score),
        relevance_score:
          item.relevance_score != null
            ? options.normalizeScore(item.relevance_score)
            : suitability?.match_score ?? options.normalizeScore(item.match_score),
        join_likelihood_score: options.normalizeScore(item.join_likelihood_score),
        join_likelihood_reasons: options.stripSpeculativeRelocation(
          options.normalizeStringArray(item.join_likelihood_reasons, 3),
        ),
        short_reasons: options.normalizeStringArray(item.short_reasons, 3),
        risk_flags: options.stripSpeculativeRelocation(
          options.normalizeStringArray(item.risk_flags ?? item.constraint_risks, 4),
        ),
        blocking_constraints: options.normalizeBlockingConstraints(item.blocking_constraints),
        blocking_severity: options.normalizeBlockingSeverity(item.blocking_severity),
        advance_recommendation: options.normalizeAdvanceRecommendation(item.advance_recommendation),
        shortlist_decision: options.normalizeEnumValue(
          item.shortlist_decision,
          ["yes", "no"] as const,
          options.deriveShortlistDecision(
            options.normalizeAdvanceRecommendation(item.advance_recommendation),
            options.normalizeBlockingSeverity(item.blocking_severity),
          ),
        ),
        shortlist_reason: options.normalizeNullableString(item.shortlist_reason),
        constraint_verdicts: options.sanitizeConstraintVerdicts(item.constraint_verdicts),
        evidence_quality: options.normalizeEnumValue(
          item.evidence_quality,
          ["high", "medium", "low"] as const,
          "medium",
        ),
        skills: options.normalizeStringArray(item.skills, 10),
        experience_years: options.normalizeExperienceYears(item.experience_years),
        location: options.normalizeNullableString(item.location),
        why_reachable_now: options.normalizeNullableString(item.why_reachable_now),
      };
    })
    .filter((entry): entry is JudgeScoreResult => Boolean(entry));
}

export function hasJudgeConflict(
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
  options: {
    computeQualityScore: (capabilityScore: number, relevanceScore: number) => number;
    deriveFitDecisionFromScore: (score: number) => ScoredCandidateAssessment["suitability"]["fit_decision"];
  },
) {
  const judgeAQuality = options.computeQualityScore(judgeA.capability_score, judgeA.relevance_score);
  const judgeBQuality = options.computeQualityScore(judgeB.capability_score, judgeB.relevance_score);
  const maxQuality = Math.max(judgeAQuality, judgeBQuality);
  const hasHardBlockerConflict =
    (judgeA.blocking_severity === "hard") !== (judgeB.blocking_severity === "hard");
  return maxQuality >= 85 && hasHardBlockerConflict;
}

function mergeConstraintVerdicts(
  judgeA: JudgeScoreResult["constraint_verdicts"],
  judgeB: JudgeScoreResult["constraint_verdicts"],
): JudgeScoreResult["constraint_verdicts"] {
  const locationRank = {
    non_local: 0,
    unknown: 1,
    nearby: 2,
    local: 3,
  } as const;
  const workModelRank = {
    no: 0,
    unclear: 1,
    yes: 2,
  } as const;
  const mustHaveRank = {
    weak: 0,
    unknown: 1,
    partial: 2,
    strong: 3,
  } as const;

  return {
    location_fit:
      locationRank[judgeA.location_fit] <= locationRank[judgeB.location_fit]
        ? judgeA.location_fit
        : judgeB.location_fit,
    work_model_fit:
      workModelRank[judgeA.work_model_fit] <= workModelRank[judgeB.work_model_fit]
        ? judgeA.work_model_fit
        : judgeB.work_model_fit,
    must_have_coverage:
      mustHaveRank[judgeA.must_have_coverage] <= mustHaveRank[judgeB.must_have_coverage]
        ? judgeA.must_have_coverage
        : judgeB.must_have_coverage,
  };
}

function mergeEvidenceQuality(
  judgeA: JudgeScoreResult["evidence_quality"],
  judgeB: JudgeScoreResult["evidence_quality"],
): JudgeScoreResult["evidence_quality"] {
  const evidenceRank = {
    low: 0,
    medium: 1,
    high: 2,
  } as const;
  return evidenceRank[judgeA] <= evidenceRank[judgeB] ? judgeA : judgeB;
}

export function mergeJudgeResults(
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
  options: {
    computeQualityScore: (capabilityScore: number, relevanceScore: number) => number;
    computeAdvanceScore: (
      capabilityScore: number,
      relevanceScore: number,
      joinLikelihoodScore: number,
      blockingSeverity: BlockingSeverity,
    ) => number;
    deriveAdvanceRecommendation: (
      advanceScore: number,
      blockingSeverity: BlockingSeverity,
    ) => JudgeScoreResult["advance_recommendation"];
    sanitizeCandidateSuitability: (value: unknown) => ScoredCandidateAssessment["suitability"] | null;
    normalizeNullableString: (value: unknown) => string | null;
  },
): ScoredCandidateAssessment {
  const capabilityScore = Math.round((judgeA.capability_score + judgeB.capability_score) / 2);
  const relevanceScore = Math.round((judgeA.relevance_score + judgeB.relevance_score) / 2);
  const joinLikelihoodScore = Math.round(
    (judgeA.join_likelihood_score + judgeB.join_likelihood_score) / 2,
  );
  const blockingSeverity: BlockingSeverity =
    judgeA.blocking_severity === "hard" && judgeB.blocking_severity === "hard"
      ? "hard"
      : judgeA.blocking_severity === "soft" || judgeB.blocking_severity === "soft" ||
        judgeA.blocking_severity === "hard" || judgeB.blocking_severity === "hard"
        ? "soft"
        : "none";
  const qualityScore = options.computeQualityScore(capabilityScore, relevanceScore);
  const advanceScore = options.computeAdvanceScore(
    capabilityScore,
    relevanceScore,
    joinLikelihoodScore,
    blockingSeverity,
  );
  const advanceRecommendation =
    judgeA.advance_recommendation === "reject" || judgeB.advance_recommendation === "reject"
      ? "reject"
      : judgeA.advance_recommendation === "hold" || judgeB.advance_recommendation === "hold"
        ? "hold"
        : options.deriveAdvanceRecommendation(advanceScore, blockingSeverity);
  const shortlistDecision: ShortlistDecision =
    judgeA.shortlist_decision === "no" || judgeB.shortlist_decision === "no"
      ? "no"
      : "yes";
  const constraintVerdicts = mergeConstraintVerdicts(
    judgeA.constraint_verdicts,
    judgeB.constraint_verdicts,
  );
  const suitability = options.sanitizeCandidateSuitability({
    capability_score: capabilityScore,
    relevance_score: relevanceScore,
    join_likelihood_score: joinLikelihoodScore,
    quality_score: qualityScore,
    advance_score: advanceScore,
    advance_recommendation: advanceRecommendation,
    shortlist_decision: shortlistDecision,
    shortlist_reason:
      options.normalizeNullableString(judgeA.shortlist_reason) ||
      options.normalizeNullableString(judgeB.shortlist_reason) ||
      null,
    blocking_constraints: Array.from(
      new Set([...judgeA.blocking_constraints, ...judgeB.blocking_constraints]),
    ).slice(0, 8),
    blocking_severity: blockingSeverity,
    join_likelihood_reasons: Array.from(
      new Set([...judgeA.join_likelihood_reasons, ...judgeB.join_likelihood_reasons]),
    ).slice(0, 6),
    constraint_verdicts: constraintVerdicts,
    risk_flags: [...judgeA.risk_flags, ...judgeB.risk_flags],
    constraint_risks: [...judgeA.risk_flags, ...judgeB.risk_flags],
    why_this_candidate: [...judgeA.short_reasons, ...judgeB.short_reasons],
    why_not_higher: [...judgeA.risk_flags, ...judgeB.risk_flags],
    evidence_quality: mergeEvidenceQuality(judgeA.evidence_quality, judgeB.evidence_quality),
  });

  return {
    index: judgeA.index,
    suitability: suitability || {
      fit_decision: "reject",
      actionability: "not_actionable",
      bucket: "do_not_show",
      match_score: 0,
      quality_score: 0,
      overall_score: 0,
      advance_score: 0,
      advance_recommendation: "reject",
      shortlist_decision: "no",
      shortlist_reason: "Scoring response was incomplete.",
      primary_risk: "Scoring response was incomplete.",
      first_contact_confidence: "low",
      subscription_trigger_score: 0,
      blocking_constraints: [],
      blocking_severity: "none",
      scoring_breakdown: {
        capability_score: 0,
        relevance_score: 0,
        join_likelihood_score: 0,
        join_likelihood_reasons: [],
        quality_score: 0,
        overall_score: 0,
        advance_score: 0,
      },
      constraint_verdicts: {
        location_fit: "unknown",
        work_model_fit: "unclear",
        must_have_coverage: "unknown",
      },
      constraint_risks: [],
      risk_flags: [],
      why_this_candidate: [],
      why_not_higher: [],
      evidence_quality: "medium",
    },
    skills: Array.from(new Set([...judgeA.skills, ...judgeB.skills])).slice(0, 10),
    experience_years: judgeA.experience_years ?? judgeB.experience_years,
    location: judgeA.location ?? judgeB.location,
    why_reachable_now: judgeA.why_reachable_now ?? judgeB.why_reachable_now,
    scoring_method: "selective_dual_review",
    judge_delta: Math.max(
      Math.abs(judgeA.capability_score - judgeB.capability_score),
      Math.abs(judgeA.relevance_score - judgeB.relevance_score),
      Math.abs(judgeA.join_likelihood_score - judgeB.join_likelihood_score),
    ),
    judge_conflict: false,
  };
}

export function tagPoolRows(
  primaryRows: CandidateRowInput[],
  supplementalRows: CandidateRowInput[],
  candidateLimit: number,
) {
  const metadataScore = (row: CandidateRowInput, field: "quality_score" | "advance_score") => {
    const directValue = row.metadata?.[field];
    if (typeof directValue === "number") return directValue;
    const scoringBreakdown = row.metadata?.scoring_breakdown;
    if (scoringBreakdown && typeof scoringBreakdown === "object" && field in scoringBreakdown) {
      const nestedValue = (scoringBreakdown as Record<string, unknown>)[field];
      if (typeof nestedValue === "number") return nestedValue;
    }
    return row.match_score;
  };
  const deliveryPriority = (row: CandidateRowInput) => {
    switch (row.metadata?.delivery_bucket) {
      case "reach_first":
        return 0;
      case "review_next":
        return 1;
      case "lower_priority":
        return 2;
      case "not_recommended":
        return 3;
      default:
        return 2;
    }
  };
  const finalRows = mergeCandidateRows(primaryRows, supplementalRows, candidateLimit).sort(
    (left, right) => {
      const priorityDelta = deliveryPriority(left) - deliveryPriority(right);
      if (priorityDelta !== 0) return priorityDelta;
      const rightQuality = metadataScore(right, "quality_score");
      const leftQuality = metadataScore(left, "quality_score");
      const rightAdvance = metadataScore(right, "advance_score");
      const leftAdvance = metadataScore(left, "advance_score");
      const rightTrigger =
        typeof right.metadata?.subscription_trigger_score === "number"
          ? right.metadata.subscription_trigger_score
          : right.match_score;
      const leftTrigger =
        typeof left.metadata?.subscription_trigger_score === "number"
          ? left.metadata.subscription_trigger_score
          : left.match_score;
      const rightPreliminary = right.metadata?.preliminary === true ? 1 : 0;
      const leftPreliminary = left.metadata?.preliminary === true ? 1 : 0;
      return (
        rightQuality - leftQuality ||
        rightAdvance - leftAdvance ||
        right.match_score - left.match_score ||
        rightTrigger - leftTrigger ||
        leftPreliminary - rightPreliminary
      );
    },
  );
  return finalRows.map((row) => ({
    ...row,
    metadata: {
      ...row.metadata,
      pool_type: "main",
    },
  }));
}

export function selectShortlistedAssessments(
  assessments: ScoredCandidateAssessment[],
  options: {
    shouldDisplayCandidate: (assessment: ScoredCandidateAssessment) => boolean;
    sortCandidateAssessments: (
      left: ScoredCandidateAssessment,
      right: ScoredCandidateAssessment,
    ) => number;
  },
) {
  const shortlisted = assessments
    .filter(options.shouldDisplayCandidate)
    .sort(options.sortCandidateAssessments);

  return {
    selected: shortlisted,
    selectedCount: shortlisted.length,
    selectedRate: assessments.length > 0 ? shortlisted.length / assessments.length : 0,
    shortlistYesCount: shortlisted.length,
    shortlistNoCount: Math.max(assessments.length - shortlisted.length, 0),
  };
}
