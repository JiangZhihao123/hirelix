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
  },
) {
  const styleHint =
    judgeLabel === "Judge A"
      ? "Lean slightly toward recruiter optimism, but do not violate hard constraints."
      : "Lean slightly toward recruiter skepticism, but do not over-penalize strong evidence.";
  const jsonShape = poolSize === 1
    ? `{
  "index": 0,
  "capability_score": 0,
  "relevance_score": 0,
  "join_likelihood_score": 0,
  "join_likelihood_reasons": ["string"],
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
  "shortlist_reason": "string | null",
  "short_reasons": ["string"],
  "risk_flags": ["string"],
  "evidence_quality": "high | medium | low",
  "skills": ["string"],
  "experience_years": 0,
  "location": "string | null",
  "why_reachable_now": "string | null"
}`
    : `[
  {
    "index": 0,
    "capability_score": 0,
    "relevance_score": 0,
    "join_likelihood_score": 0,
    "join_likelihood_reasons": ["string"],
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
    "shortlist_reason": "string | null",
    "short_reasons": ["string"],
    "risk_flags": ["string"],
    "evidence_quality": "high | medium | low",
    "skills": ["string"],
    "experience_years": 0,
    "location": "string | null",
    "why_reachable_now": "string | null"
  }
]`;
  const indexRule = poolSize === 1
    ? 'Return exactly one JSON object. Use the candidate index shown in the profile header (for example "[57] Name" means index 57).'
    : "Return one object per profile.";

  return `You are ${judgeLabel}, one of two independent hiring reviewers.

## Original Job Description
${options.truncateForPrompt(jdText.trim(), 5000)}

## Search Intent
${options.buildPromptSearchContext(parsed)}

## Candidate Profiles (${poolSize} candidates)
The profiles below are raw candidate profiles derived from LinkedIn data.

${richProfiles}

## Task
Review each candidate independently using this exact JSON shape:
${jsonShape}

Rules:
- ${styleHint}
- ${indexRule}
- capability_score measures how strong the person is overall in seniority, depth, and execution track record. Profiles with only bootcamp credentials and no professional engineering tenure beyond internships should receive capability_score <= 40.
- relevance_score measures how directly their real background matches this JD's stack, responsibilities, and domain. Domain experience in the hiring company's industry (stated in hiring_brief) should boost relevance_score — a candidate who has worked in the same industry as the hiring company is significantly more relevant than one who hasn't, especially for startup roles where ramp-up time matters.
- join_likelihood_score measures how realistic it is that they would seriously consider this specific opportunity. Actively look for job-seeking signals and boost join_likelihood_score when present: (1) "Current: not currently employed" — candidate is between jobs, significantly more likely to respond; (2) most recent experience ended recently (within ~12 months) with no current role — likely just left and open to opportunities; (3) visible employment gap in experience timeline — may be actively looking; (4) explicit language in about/headline such as "open to opportunities", "seeking", "available", "#opentowork" or similar. Any of these signals warrants a meaningful boost (+10 to +20 points) to join_likelihood_score.
- Use blocking_constraints to explicitly call out real blockers such as location, work model, seniority, authorization, or company-stage mismatch.
- blocking_severity should be hard only for explicit incompatibilities unrelated to location (location is pre-assessed by a dedicated module — do not hard-block based on location alone).
- If evidence is missing, unclear, or unverifiable, use soft (not hard).
- Use hard only for clear seniority mismatch, wrong function (e.g. frontend for a backend role), or explicit work-authorization conflict.
- For explicit out-of-region hard blockers confirmed by location evidence, reflect in blocking_constraints but still use soft — let the location module own the hard gate.
- advance_recommendation should reflect whether this candidate is worth moving forward in the real world, independent of raw quality.
- shortlist_decision should answer the recruiter question directly: does this person deserve to appear in the shortlist shown to the hiring manager?
- Use shortlist_decision=yes for candidates you would genuinely include in a recruiter-curated shortlist today, even if they are not perfect.
- Use shortlist_decision=no for candidates you would keep out of the shortlist because the fit is too weak, too risky, or too speculative.
- shortlist_reason should be one short recruiter-style explanation for the yes/no decision.
- Penalize overqualification, role-level mismatch, prestige mismatch, unrealistic company-stage mismatch, and hard location/work-model mismatch in join_likelihood_score.
- For startup/growth-stage roles: evaluate startup affinity holistically based on career trajectory. Penalize candidates with 7+ years at a single large company AND zero startup/small-company experience AND no entrepreneurial signals — they are unlikely to make the leap. But a big-company engineer with prior startup stints, side projects, open-source, or "0 to 1" language is a strong prospect — large-company rigor combined with startup adaptability is valuable. Boost join_likelihood when career trajectory shows startup affinity (multiple startup stints, founding experience, decreasing company size over career, or entrepreneurial language in about/experience).
- A realistic candidate who would actually respond to cold outreach is more valuable than a dream candidate who never will. Factor reachability into advance_recommendation.
- Do not collapse quality because of sparse evidence alone. Use evidence_quality + risk fields to express uncertainty.
- When title/about/current role strongly align but details are sparse, capability/relevance can still be moderate.
- Reserve very low capability/relevance for explicit mismatch, not just missing fields.
- Do not reward prestige alone.
- Keep short_reasons concrete and short. Max 3 items, each under 14 words.
- Keep join_likelihood_reasons concrete and evidence-based. Max 3 items, each under 16 words.
- Keep risk_flags concrete and short. Max 3 items, each under 10 words.
- first_contact_confidence should reflect whether a recruiter would feel good reaching out immediately.
- why_reachable_now: one sentence explaining why this specific person might be open to this opportunity RIGHT NOW. Look for timing signals: recent job change (< 6 months at current role), career trajectory shift (big company → startup pattern), active LinkedIn profile (high connections/followers), explicit "open to opportunities" language, short tenure at current company, or industry/domain alignment that makes this role a natural next step. Return null only if there are zero timing signals. This field is shown directly to the hiring manager — make it specific and actionable, not generic.
- Do not speculate about relocation or work authorization.
- Return ONLY valid JSON. Do NOT wrap the JSON in markdown code blocks (no \`\`\`json or \`\`\`). Return raw JSON directly.`;
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
    "index": 0,
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
      if (!Number.isFinite(rawIndex) || rawIndex < 0 || rawIndex >= poolSize) return null;
      const suitability = options.sanitizeCandidateSuitability(item);
      return {
        index: rawIndex,
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
  return (
    Math.abs(judgeA.capability_score - judgeB.capability_score) > 8 ||
    Math.abs(judgeA.relevance_score - judgeB.relevance_score) > 8 ||
    Math.abs(judgeA.join_likelihood_score - judgeB.join_likelihood_score) > 8 ||
    judgeA.blocking_severity !== judgeB.blocking_severity ||
    judgeA.shortlist_decision !== judgeB.shortlist_decision ||
    judgeA.advance_recommendation !== judgeB.advance_recommendation ||
    options.deriveFitDecisionFromScore(judgeAQuality) !== options.deriveFitDecisionFromScore(judgeBQuality) ||
    (judgeA.relevance_score >= 75 && judgeB.join_likelihood_score <= 35) ||
    (judgeB.relevance_score >= 75 && judgeA.join_likelihood_score <= 35)
  );
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
    constraint_verdicts: judgeA.constraint_verdicts,
    risk_flags: [...judgeA.risk_flags, ...judgeB.risk_flags],
    constraint_risks: [...judgeA.risk_flags, ...judgeB.risk_flags],
    why_this_candidate: [...judgeA.short_reasons, ...judgeB.short_reasons],
    why_not_higher: [...judgeA.risk_flags, ...judgeB.risk_flags],
    evidence_quality:
      judgeA.evidence_quality === "high" || judgeB.evidence_quality === "high"
        ? "high"
        : judgeA.evidence_quality === "medium" || judgeB.evidence_quality === "medium"
          ? "medium"
          : "low",
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
    scoring_method: "dual_review_auto",
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
  const finalRows = mergeCandidateRows(primaryRows, supplementalRows, candidateLimit).sort(
    (left, right) => {
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
        rightTrigger - leftTrigger ||
        right.match_score - left.match_score ||
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
