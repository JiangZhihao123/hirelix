import {
  generateLlmJson,
  resolveDeepSeekReasoningEffort,
} from "@/lib/llm-client";
import {
  ARBITER_SCORE_JSON_SCHEMA,
  buildFastJudgeScoreJsonSchema,
  buildJudgeScoreJsonSchema,
} from "@/lib/llm-schemas";
import {
  DEEP_SCORING_BATCH_SIZE,
  DEEP_CACHE_PRIMER_COUNT,
  FAST_JUDGE_BATCH_SIZE,
  FAST_JUDGE_CONCURRENCY,
  ARBITER_SCORING_TIMEOUT_MS,
  DEEP_REVIEW_CONCURRENCY,
  JUDGE_SCORING_TIMEOUT_MS,
  SECOND_REVIEW_MAX_COUNT,
  SECOND_REVIEW_MIN_COUNT,
  resolveStageConcurrency,
} from "@/lib/search/config";
import {
  runWithConcurrency,
  sleep,
  withTimeout,
} from "@/lib/search/concurrency";
import {
  buildArbiterPrompt,
  buildJudgeScorePrompt,
  hasJudgeConflict,
  mergeJudgeResults,
  parseJudgeScoreResults,
  parseScoredAssessments,
} from "@/lib/search/scoring";
import type {
  BlockingSeverity,
  JudgeScoreResult,
  ScoredCandidateAssessment,
  SearchExecutionRuntime,
} from "@/lib/search/types";

export async function judgeScoreBatch(
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  batchIndexes: number[],
  totalPoolSize: number,
  judgeLabel: "Judge A" | "Judge B",
  helpers: {
    truncateForPrompt: (text: string, maxChars: number) => string;
    buildPromptSearchContext: (parsed: Record<string, unknown>) => string;
    getJudgeModel: () => string;
    logSearchEvent: (eventName: string, payload: Record<string, unknown>) => void;
    sanitizeCandidateSuitability: (value: unknown) => ScoredCandidateAssessment["suitability"] | null;
    normalizeScore: (value: unknown) => number;
    stripSpeculativeRelocation: (texts: string[]) => string[];
    normalizeStringArray: (value: unknown, maxItems: number) => string[];
    normalizeBlockingConstraints: (value: unknown) => string[];
    normalizeBlockingSeverity: (value: unknown) => JudgeScoreResult["blocking_severity"];
    normalizeAdvanceRecommendation: (value: unknown) => JudgeScoreResult["advance_recommendation"];
    normalizeEnumValue: <T extends string>(value: unknown, allowed: readonly T[], fallback: T) => T;
    deriveShortlistDecision: (
      advanceRecommendation: JudgeScoreResult["advance_recommendation"],
      blockingSeverity: JudgeScoreResult["blocking_severity"],
    ) => JudgeScoreResult["shortlist_decision"];
    normalizeNullableString: (value: unknown) => string | null;
    sanitizeConstraintVerdicts: (value: unknown) => JudgeScoreResult["constraint_verdicts"];
    normalizeExperienceYears: (value: unknown) => number | null;
  },
  context?: { searchId?: string; jobId?: string; userId?: string },
): Promise<JudgeScoreResult[]> {
  return judgeScoreBatchWithMode(
    runtime,
    parsed,
    jdText,
    profileTexts,
    batchIndexes,
    totalPoolSize,
    judgeLabel,
    "deep",
    helpers,
    context,
  );
}

async function judgeScoreBatchWithMode(
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  batchIndexes: number[],
  totalPoolSize: number,
  judgeLabel: "Judge A" | "Judge B",
  mode: "fast" | "deep",
  helpers: Parameters<typeof judgeScoreBatch>[7],
  context?: { searchId?: string; jobId?: string; userId?: string },
): Promise<JudgeScoreResult[]> {
  const profilesText = batchIndexes
    .map((idx) => helpers.truncateForPrompt(profileTexts[idx], 2800))
    .join("\n\n");
  const prompt = buildJudgeScorePrompt(
    parsed,
    jdText,
    profilesText,
    batchIndexes.length,
    judgeLabel,
    {
      truncateForPrompt: helpers.truncateForPrompt,
      buildPromptSearchContext: helpers.buildPromptSearchContext,
      expectedIndexes: batchIndexes,
      mode,
    },
  );
  const judgeModel = helpers.getJudgeModel();
  const maxAttempts = runtime.judgeMaxAttempts;
  const maxOutputTokens = Math.min(
    Math.max(
      mode === "fast" ? 600 : runtime.judgeMaxOutputTokens,
      (mode === "fast" ? 240 : runtime.judgeMaxOutputTokens) * batchIndexes.length,
    ),
    20000,
  );
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data: judgeResult, usage } = await withTimeout(
        (signal) => generateLlmJson<unknown>({
          model: judgeModel,
          prompt,
          maxOutputTokens,
          abortSignal: signal,
          timeoutMs: JUDGE_SCORING_TIMEOUT_MS,
          temperature: 0,
          jsonSchema: mode === "fast"
            ? buildFastJudgeScoreJsonSchema(batchIndexes.length)
            : buildJudgeScoreJsonSchema(batchIndexes.length),
          requireParameters: true,
          deepSeekThinking: mode === "fast" ? "disabled" : "enabled",
          deepSeekReasoningEffort: mode === "fast"
            ? undefined
            : resolveDeepSeekReasoningEffort(
                "SEARCH_JUDGE_REASONING_EFFORT",
                "high",
              ),
          usageEvent: {
            searchId: context?.searchId,
            jobId: context?.jobId,
            userId: context?.userId,
            stage: mode === "fast"
              ? "fast_judge"
              : judgeLabel === "Judge A" ? "deep_judge_a" : "deep_judge_b",
            batchSize: batchIndexes.length,
            candidateIndexes: batchIndexes,
            metadata: { judge: judgeLabel, mode },
          },
        }),
        JUDGE_SCORING_TIMEOUT_MS,
        `${judgeLabel} scoring (attempt ${attempt})`,
      );

      if (usage.cachedInputTokens > 0 || usage.cacheMissInputTokens > 0) {
        const measuredInputTokens =
          usage.cachedInputTokens + usage.cacheMissInputTokens;
        helpers.logSearchEvent("judge_scoring_cache_usage", {
          judge: judgeLabel,
          model: judgeModel,
          batch_size: batchIndexes.length,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          max_output_tokens: maxOutputTokens,
          cached_input_tokens: usage.cachedInputTokens,
          cache_miss_input_tokens: usage.cacheMissInputTokens,
          cache_hit_ratio:
            measuredInputTokens > 0
              ? usage.cachedInputTokens / measuredInputTokens
              : null,
          ...(context?.searchId && { search_id: context.searchId }),
          ...(context?.jobId && { job_id: context.jobId }),
          mode,
        });
      }

      const parsedResults = parseJudgeScoreResults(
        judgeResult,
        totalPoolSize,
        batchIndexes,
        {
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
      ).filter((assessment) => batchIndexes.includes(assessment.index));

      if (parsedResults.length > 0) return parsedResults;
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

      helpers.logSearchEvent("judge_scoring_attempt_failed", {
        judge: judgeLabel,
        mode,
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

export async function arbitrateCandidateScore(
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileText: string,
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
  totalPoolSize: number,
  helpers: {
    truncateForPrompt: (text: string, maxChars: number) => string;
    buildPromptSearchContext: (parsed: Record<string, unknown>) => string;
    buildCompanyProfileContext: (parsed: Record<string, unknown>) => string;
    getArbiterModel: () => string;
    logSearchEvent: (eventName: string, payload: Record<string, unknown>) => void;
    sanitizeCandidateSuitability: (value: unknown) => ScoredCandidateAssessment["suitability"] | null;
    normalizeStringArray: (value: unknown, maxItems: number) => string[];
    normalizeExperienceYears: (value: unknown) => number | null;
    normalizeNullableString: (value: unknown) => string | null;
    sortCandidateAssessments: (
      left: ScoredCandidateAssessment,
      right: ScoredCandidateAssessment,
    ) => number;
  },
  context?: { searchId?: string; jobId?: string; userId?: string },
): Promise<ScoredCandidateAssessment | null> {
  const prompt = buildArbiterPrompt(
    parsed,
    jdText,
    helpers.truncateForPrompt(profileText, 3000),
    judgeA,
    judgeB,
    {
      truncateForPrompt: helpers.truncateForPrompt,
      buildPromptSearchContext: helpers.buildPromptSearchContext,
      buildCompanyProfileContext: helpers.buildCompanyProfileContext,
    },
  );
  const maxAttempts = runtime.arbiterMaxAttempts;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data } = await withTimeout(
        (signal) => generateLlmJson<unknown>({
          model: helpers.getArbiterModel(),
          prompt,
          maxOutputTokens: runtime.arbiterMaxOutputTokens,
          abortSignal: signal,
          timeoutMs: ARBITER_SCORING_TIMEOUT_MS,
          temperature: 0,
          jsonSchema: ARBITER_SCORE_JSON_SCHEMA,
          deepSeekThinking: "enabled",
          deepSeekReasoningEffort: resolveDeepSeekReasoningEffort(
            "SEARCH_ARBITER_REASONING_EFFORT",
            "max",
          ),
          usageEvent: {
            searchId: context?.searchId,
            jobId: context?.jobId,
            userId: context?.userId,
            stage: "arbiter",
            batchSize: 1,
            candidateIndexes: [judgeA.index],
            metadata: {
              judge_a: judgeA,
              judge_b: judgeB,
              judge_delta: Math.max(
                Math.abs(judgeA.capability_score - judgeB.capability_score),
                Math.abs(judgeA.relevance_score - judgeB.relevance_score),
                Math.abs(judgeA.join_likelihood_score - judgeB.join_likelihood_score),
              ),
            },
          },
        }),
        ARBITER_SCORING_TIMEOUT_MS,
        `Arbiter scoring (attempt ${attempt})`,
      );

      const assessment = parseScoredAssessments(data, totalPoolSize, {
        sanitizeCandidateSuitability: helpers.sanitizeCandidateSuitability,
        normalizeStringArray: helpers.normalizeStringArray,
        normalizeExperienceYears: helpers.normalizeExperienceYears,
        normalizeNullableString: helpers.normalizeNullableString,
        sortCandidateAssessments: helpers.sortCandidateAssessments,
      })[0];
      if (!assessment) {
        throw new Error("Arbiter returned no valid assessment");
      }
      return {
        ...assessment,
        index: judgeA.index,
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
      helpers.logSearchEvent("arbiter_attempt_failed", {
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

export async function scoreSingleCandidate(
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  selectedIndex: number,
  totalPoolSize: number,
  helpers: {
    judgeScoreBatch: typeof judgeScoreBatch;
    arbitrateCandidateScore: typeof arbitrateCandidateScore;
    logSearchEvent: (eventName: string, payload: Record<string, unknown>) => void;
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
    deriveFitDecisionFromScore: (score: number) => ScoredCandidateAssessment["suitability"]["fit_decision"];
    judgeHelpers: Parameters<typeof judgeScoreBatch>[7];
    arbiterHelpers: Parameters<typeof arbitrateCandidateScore>[7];
  },
  context?: { searchId?: string; jobId?: string; userId?: string },
): Promise<ScoredCandidateAssessment | null> {
  if (runtime.judgeMode === "single") {
    try {
      const judgeResults = await helpers.judgeScoreBatch(
        runtime,
        parsed,
        jdText,
        profileTexts,
        [selectedIndex],
        totalPoolSize,
        "Judge A",
        helpers.judgeHelpers,
        context,
      );
      const judge = judgeResults[0];
      if (!judge) return null;
      return {
        ...mergeJudgeResults(judge, judge, {
          computeQualityScore: helpers.computeQualityScore,
          computeAdvanceScore: helpers.computeAdvanceScore,
          deriveAdvanceRecommendation: helpers.deriveAdvanceRecommendation,
          sanitizeCandidateSuitability: helpers.sanitizeCandidateSuitability,
          normalizeNullableString: helpers.normalizeNullableString,
        }),
        scoring_method: "single_judge_debug",
        judge_delta: 0,
        judge_conflict: false,
      };
    } catch (error) {
      helpers.logSearchEvent("single_judge_scoring_failed", {
        index: selectedIndex,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  const judgeBatch = [selectedIndex];
  const [judgeAResults, judgeBResults] = await Promise.allSettled([
    helpers.judgeScoreBatch(
      runtime,
      parsed,
      jdText,
      profileTexts,
      judgeBatch,
      totalPoolSize,
      "Judge A",
      helpers.judgeHelpers,
      context,
    ),
    helpers.judgeScoreBatch(
      runtime,
      parsed,
      jdText,
      profileTexts,
      judgeBatch,
      totalPoolSize,
      "Judge B",
      helpers.judgeHelpers,
      context,
    ),
  ]);

  const judgeA = judgeAResults.status === "fulfilled" ? judgeAResults.value[0] : null;
  const judgeB = judgeBResults.status === "fulfilled" ? judgeBResults.value[0] : null;

  if (judgeAResults.status === "rejected" || judgeBResults.status === "rejected") {
    helpers.logSearchEvent("dual_review_judge_failure", {
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
        computeQualityScore: helpers.computeQualityScore,
        computeAdvanceScore: helpers.computeAdvanceScore,
        deriveAdvanceRecommendation: helpers.deriveAdvanceRecommendation,
        sanitizeCandidateSuitability: helpers.sanitizeCandidateSuitability,
        normalizeNullableString: helpers.normalizeNullableString,
      }),
      judge_delta: 0,
    };
  }
  if (judgeB && !judgeA) {
    return {
      ...mergeJudgeResults(judgeB, judgeB, {
        computeQualityScore: helpers.computeQualityScore,
        computeAdvanceScore: helpers.computeAdvanceScore,
        deriveAdvanceRecommendation: helpers.deriveAdvanceRecommendation,
        sanitizeCandidateSuitability: helpers.sanitizeCandidateSuitability,
        normalizeNullableString: helpers.normalizeNullableString,
      }),
      judge_delta: 0,
    };
  }

  if (!judgeA || !judgeB) return null;
  if (!hasJudgeConflict(judgeA, judgeB, {
    computeQualityScore: helpers.computeQualityScore,
    deriveFitDecisionFromScore: helpers.deriveFitDecisionFromScore,
  })) {
    return {
      ...mergeJudgeResults(judgeA, judgeB, {
        computeQualityScore: helpers.computeQualityScore,
        computeAdvanceScore: helpers.computeAdvanceScore,
        deriveAdvanceRecommendation: helpers.deriveAdvanceRecommendation,
        sanitizeCandidateSuitability: helpers.sanitizeCandidateSuitability,
        normalizeNullableString: helpers.normalizeNullableString,
      }),
      judge_conflict: false,
    };
  }

  try {
    return await helpers.arbitrateCandidateScore(
      runtime,
      parsed,
      jdText,
      profileTexts[selectedIndex],
      judgeA,
      judgeB,
      totalPoolSize,
      helpers.arbiterHelpers,
      context,
    );
  } catch (error) {
    helpers.logSearchEvent("dual_review_arbiter_failure", {
      index: selectedIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ...mergeJudgeResults(judgeA, judgeB, {
        computeQualityScore: helpers.computeQualityScore,
        computeAdvanceScore: helpers.computeAdvanceScore,
        deriveAdvanceRecommendation: helpers.deriveAdvanceRecommendation,
        sanitizeCandidateSuitability: helpers.sanitizeCandidateSuitability,
        normalizeNullableString: helpers.normalizeNullableString,
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

function mapJudgeResultsByIndex(results: JudgeScoreResult[]) {
  const byIndex = new Map<number, JudgeScoreResult>();
  for (const result of results) {
    byIndex.set(result.index, result);
  }
  return byIndex;
}

function mergeSingleJudgeResult(
  judge: JudgeScoreResult,
  helpers: Parameters<typeof scoreSingleCandidate>[6],
): ScoredCandidateAssessment {
  return {
    ...mergeJudgeResults(judge, judge, {
      computeQualityScore: helpers.computeQualityScore,
      computeAdvanceScore: helpers.computeAdvanceScore,
      deriveAdvanceRecommendation: helpers.deriveAdvanceRecommendation,
      sanitizeCandidateSuitability: helpers.sanitizeCandidateSuitability,
      normalizeNullableString: helpers.normalizeNullableString,
    }),
    scoring_method: "single_judge_triage",
    judge_delta: 0,
    judge_conflict: false,
  };
}

function mergeDualJudgeResult(
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
  helpers: Parameters<typeof scoreSingleCandidate>[6],
): ScoredCandidateAssessment {
  return {
    ...mergeJudgeResults(judgeA, judgeB, {
      computeQualityScore: helpers.computeQualityScore,
      computeAdvanceScore: helpers.computeAdvanceScore,
      deriveAdvanceRecommendation: helpers.deriveAdvanceRecommendation,
      sanitizeCandidateSuitability: helpers.sanitizeCandidateSuitability,
      normalizeNullableString: helpers.normalizeNullableString,
    }),
    scoring_method: "selective_dual_review",
    judge_conflict: false,
  };
}

function buildFastJudgeFailureAssessment(index: number): ScoredCandidateAssessment {
  return {
    index,
    skills: [],
    experience_years: null,
    location: null,
    scoring_method: "fast_judge_triage",
    judge_delta: 0,
    judge_conflict: false,
    suitability: {
      fit_decision: "reject",
      actionability: "not_actionable",
      bucket: "do_not_show",
      match_score: 0,
      quality_score: 0,
      overall_score: 0,
      advance_score: 0,
      advance_recommendation: "reject",
      primary_risk: "Fast judge failed for this profile",
      first_contact_confidence: "low",
      subscription_trigger_score: 0,
      shortlist_decision: "no",
      shortlist_reason: "Profile could not be safely scored.",
      blocking_constraints: ["scoring failed"],
      blocking_severity: "hard",
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
      constraint_risks: ["Profile skipped after repeated scoring failure."],
      risk_flags: ["Profile skipped after repeated scoring failure."],
      why_this_candidate: [],
      why_not_higher: ["Profile skipped after repeated scoring failure."],
      evidence_quality: "low",
    },
  };
}

function shouldRequestSecondReview(assessment: ScoredCandidateAssessment) {
  const suitability = assessment.suitability;
  const breakdown = suitability.scoring_breakdown;

  if (suitability.blocking_severity === "hard") return false;

  const nearVisibleThreshold =
    suitability.quality_score >= 68 &&
    breakdown.relevance_score >= 60 &&
    suitability.advance_recommendation !== "reject";
  const strongButRisky =
    suitability.quality_score >= 82 &&
    (
      suitability.blocking_severity === "soft" ||
      suitability.evidence_quality !== "high" ||
      breakdown.join_likelihood_score < 45
    );
  const scoreContradiction =
    (
      breakdown.capability_score >= 85 &&
      breakdown.relevance_score < 65
    ) ||
    (
      breakdown.relevance_score >= 85 &&
      breakdown.capability_score < 70
    );
  const actionContradiction =
    (
      suitability.shortlist_decision === "yes" &&
      suitability.advance_recommendation === "reject"
    ) ||
    (
      suitability.bucket === "strong_now" &&
      suitability.first_contact_confidence !== "high"
    );

  return nearVisibleThreshold || strongButRisky || scoreContradiction || actionContradiction;
}

function selectDeepReviewIndexes(
  assessments: ScoredCandidateAssessment[],
  selectedIndexes: number[],
) {
  const maxCount = Math.min(
    Math.max(1, SECOND_REVIEW_MAX_COUNT),
    selectedIndexes.length,
  );
  const minCount = Math.min(
    Math.max(0, SECOND_REVIEW_MIN_COUNT),
    maxCount,
    selectedIndexes.length,
  );
  const byIndex = new Map(assessments.map((assessment) => [assessment.index, assessment]));
  const sorted = selectedIndexes
    .map((index) => byIndex.get(index))
    .filter((assessment): assessment is ScoredCandidateAssessment => Boolean(assessment))
    .sort((left, right) =>
      right.suitability.advance_score - left.suitability.advance_score ||
      right.suitability.quality_score - left.suitability.quality_score ||
      right.suitability.scoring_breakdown.relevance_score -
        left.suitability.scoring_breakdown.relevance_score,
    );
  const selected = new Set<number>();

  for (const assessment of sorted) {
    const suitability = assessment.suitability;
    const breakdown = suitability.scoring_breakdown;
    const shouldDeepReview =
      suitability.shortlist_decision === "yes" ||
      suitability.advance_recommendation === "advance" ||
      (suitability.quality_score >= 75 && breakdown.relevance_score >= 70);
    if (shouldDeepReview) selected.add(assessment.index);
    if (selected.size >= maxCount) break;
  }

  for (const assessment of sorted) {
    if (selected.size >= minCount) break;
    selected.add(assessment.index);
  }

  if (selected.size > maxCount) {
    return sorted
      .filter((assessment) => selected.has(assessment.index))
      .slice(0, maxCount)
      .map((assessment) => assessment.index);
  }

  return sorted
    .filter((assessment) => selected.has(assessment.index))
    .map((assessment) => assessment.index);
}

function shouldArbitrateActionConflict(
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
  helpers: Parameters<typeof scoreSingleCandidate>[6],
) {
  return hasJudgeConflict(judgeA, judgeB, {
    computeQualityScore: helpers.computeQualityScore,
    deriveFitDecisionFromScore: helpers.deriveFitDecisionFromScore,
  });
}

export async function scoreCandidateBatch(
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  selectedIndexes: number[],
  totalPoolSize: number,
  helpers: Parameters<typeof scoreSingleCandidate>[6],
  context?: { searchId?: string; jobId?: string; userId?: string },
): Promise<ScoredCandidateAssessment[]> {
  if (selectedIndexes.length === 0) return [];

  if (runtime.judgeMode === "single" && selectedIndexes.length === 1) {
    const single = await scoreSingleCandidate(
      runtime,
      parsed,
      jdText,
      profileTexts,
      selectedIndexes[0],
      totalPoolSize,
      helpers,
      context,
    );
    return single ? [single] : [];
  }

  if (runtime.judgeMode === "single") {
    try {
      const judgeResults = await helpers.judgeScoreBatch(
        runtime,
        parsed,
        jdText,
        profileTexts,
        selectedIndexes,
        totalPoolSize,
        "Judge A",
        helpers.judgeHelpers,
        context,
      );
      return judgeResults
        .map((judge) => ({
          ...mergeJudgeResults(judge, judge, {
            computeQualityScore: helpers.computeQualityScore,
            computeAdvanceScore: helpers.computeAdvanceScore,
            deriveAdvanceRecommendation: helpers.deriveAdvanceRecommendation,
            sanitizeCandidateSuitability: helpers.sanitizeCandidateSuitability,
            normalizeNullableString: helpers.normalizeNullableString,
          }),
          scoring_method: "single_judge_debug" as const,
          judge_delta: 0,
          judge_conflict: false,
        }))
        .sort((left, right) => left.index - right.index);
    } catch (error) {
      helpers.logSearchEvent("single_judge_batch_scoring_failed", {
        indexes: selectedIndexes,
        batch_size: selectedIndexes.length,
        error: error instanceof Error ? error.message : String(error),
        ...(context?.searchId && { search_id: context.searchId }),
        ...(context?.jobId && { job_id: context.jobId }),
      });
      return [];
    }
  }

  const judgeAResults = await helpers.judgeScoreBatch(
    runtime,
    parsed,
    jdText,
    profileTexts,
    selectedIndexes,
    totalPoolSize,
    "Judge A",
    helpers.judgeHelpers,
    context,
  ).catch((error) => {
    helpers.logSearchEvent("selective_review_primary_judge_failed", {
      indexes: selectedIndexes,
      batch_size: selectedIndexes.length,
      error: error instanceof Error ? error.message : String(error),
      ...(context?.searchId && { search_id: context.searchId }),
      ...(context?.jobId && { job_id: context.jobId }),
    });
    return [] as JudgeScoreResult[];
  });

  const judgeAByIndex = mapJudgeResultsByIndex(judgeAResults);
  const provisionalAssessments = Array.from(judgeAByIndex.values()).map((judge) =>
    mergeSingleJudgeResult(judge, helpers),
  );
  const secondReviewIndexes = provisionalAssessments
    .filter(shouldRequestSecondReview)
    .map((assessment) => assessment.index);

  helpers.logSearchEvent("selective_review_triage", {
    indexes: selectedIndexes,
    batch_size: selectedIndexes.length,
    primary_completed_count: provisionalAssessments.length,
    second_review_count: secondReviewIndexes.length,
    skipped_second_review_count: Math.max(provisionalAssessments.length - secondReviewIndexes.length, 0),
    ...(context?.searchId && { search_id: context.searchId }),
    ...(context?.jobId && { job_id: context.jobId }),
  });

  if (secondReviewIndexes.length === 0) {
    return provisionalAssessments.sort((left, right) => left.index - right.index);
  }

  const judgeBResults = await helpers.judgeScoreBatch(
    runtime,
    parsed,
    jdText,
    profileTexts,
    secondReviewIndexes,
    totalPoolSize,
    "Judge B",
    helpers.judgeHelpers,
    context,
  ).catch((error) => {
    helpers.logSearchEvent("selective_review_secondary_judge_failed", {
      indexes: secondReviewIndexes,
      batch_size: secondReviewIndexes.length,
      error: error instanceof Error ? error.message : String(error),
      ...(context?.searchId && { search_id: context.searchId }),
      ...(context?.jobId && { job_id: context.jobId }),
    });
    return [] as JudgeScoreResult[];
  });
  const judgeBByIndex = mapJudgeResultsByIndex(judgeBResults);
  const assessments = provisionalAssessments.filter(
    (assessment) => !secondReviewIndexes.includes(assessment.index),
  );
  const conflicts: Array<{
    index: number;
    judgeA: JudgeScoreResult;
    judgeB: JudgeScoreResult;
  }> = [];

  for (const selectedIndex of secondReviewIndexes) {
    const judgeA = judgeAByIndex.get(selectedIndex);
    const judgeB = judgeBByIndex.get(selectedIndex) ?? null;

    if (!judgeA) continue;
    if (!judgeB) {
      assessments.push(mergeSingleJudgeResult(judgeA, helpers));
      continue;
    }

    if (shouldArbitrateActionConflict(judgeA, judgeB, helpers)) {
      conflicts.push({ index: selectedIndex, judgeA, judgeB });
      continue;
    }

    assessments.push(mergeDualJudgeResult(judgeA, judgeB, helpers));
  }

  helpers.logSearchEvent("selective_review_resolution", {
    indexes: selectedIndexes,
    batch_size: selectedIndexes.length,
    primary_completed_count: provisionalAssessments.length,
    second_review_count: secondReviewIndexes.length,
    second_review_completed_count: judgeBResults.length,
    arbiter_count: conflicts.length,
    single_judge_final_count: assessments.filter(
      (assessment) => assessment.scoring_method === "single_judge_triage",
    ).length,
    dual_review_final_count: assessments.filter(
      (assessment) => assessment.scoring_method === "selective_dual_review",
    ).length,
    ...(context?.searchId && { search_id: context.searchId }),
    ...(context?.jobId && { job_id: context.jobId }),
  });

  const arbiterConcurrency = Math.min(2, conflicts.length);
  const arbitrated = await runWithConcurrency(
    conflicts,
    arbiterConcurrency,
    async ({ index, judgeA, judgeB }) => {
      try {
        return await helpers.arbitrateCandidateScore(
          runtime,
          parsed,
          jdText,
          profileTexts[index],
          judgeA,
          judgeB,
          totalPoolSize,
          helpers.arbiterHelpers,
          context,
        );
      } catch (error) {
        helpers.logSearchEvent("dual_review_arbiter_failure", {
          index,
          error: error instanceof Error ? error.message : String(error),
          ...(context?.searchId && { search_id: context.searchId }),
          ...(context?.jobId && { job_id: context.jobId }),
        });
        return {
          ...mergeJudgeResults(judgeA, judgeB, {
            computeQualityScore: helpers.computeQualityScore,
            computeAdvanceScore: helpers.computeAdvanceScore,
            deriveAdvanceRecommendation: helpers.deriveAdvanceRecommendation,
            sanitizeCandidateSuitability: helpers.sanitizeCandidateSuitability,
            normalizeNullableString: helpers.normalizeNullableString,
          }),
          scoring_method: "dual_review_auto" as const,
          judge_delta: Math.max(
            Math.abs(judgeA.capability_score - judgeB.capability_score),
            Math.abs(judgeA.relevance_score - judgeB.relevance_score),
            Math.abs(judgeA.join_likelihood_score - judgeB.join_likelihood_score),
          ),
          judge_conflict: true,
        };
      }
    },
  );

  return [...assessments, ...arbitrated.filter((entry): entry is ScoredCandidateAssessment => Boolean(entry))]
    .sort((left, right) => left.index - right.index);
}

async function scoreFastJudgeBatch(
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  selectedIndexes: number[],
  totalPoolSize: number,
  helpers: Parameters<typeof scoreSingleCandidate>[6],
  context?: { searchId?: string; jobId?: string; userId?: string },
): Promise<ScoredCandidateAssessment[]> {
  try {
    const judgeResults = await judgeScoreBatchWithMode(
      runtime,
      parsed,
      jdText,
      profileTexts,
      selectedIndexes,
      totalPoolSize,
      "Judge A",
      "fast",
      helpers.judgeHelpers,
      context,
    );
    return judgeResults.map((judge) => ({
      ...mergeSingleJudgeResult(judge, helpers),
      scoring_method: "fast_judge_triage" as const,
    }));
  } catch (error) {
    helpers.logSearchEvent("fast_judge_batch_scoring_failed", {
      indexes: selectedIndexes,
      batch_size: selectedIndexes.length,
      error: error instanceof Error ? error.message : String(error),
      ...(context?.searchId && { search_id: context.searchId }),
      ...(context?.jobId && { job_id: context.jobId }),
    });

    if (selectedIndexes.length > 1) {
      const splitAt = Math.ceil(selectedIndexes.length / 2);
      helpers.logSearchEvent("fast_judge_batch_split_retry", {
        indexes: selectedIndexes,
        batch_size: selectedIndexes.length,
        split_sizes: [splitAt, selectedIndexes.length - splitAt],
        ...(context?.searchId && { search_id: context.searchId }),
        ...(context?.jobId && { job_id: context.jobId }),
      });
      const retryBatches = await Promise.all([
        scoreFastJudgeBatch(
          runtime,
          parsed,
          jdText,
          profileTexts,
          selectedIndexes.slice(0, splitAt),
          totalPoolSize,
          helpers,
          context,
        ),
        scoreFastJudgeBatch(
          runtime,
          parsed,
          jdText,
          profileTexts,
          selectedIndexes.slice(splitAt),
          totalPoolSize,
          helpers,
          context,
        ),
      ]);
      return retryBatches.flat();
    }

    return selectedIndexes.length === 1
      ? [buildFastJudgeFailureAssessment(selectedIndexes[0])]
      : [];
  }
}

function chunkIndexes(indexes: number[], batchSize: number) {
  const chunks: number[][] = [];
  for (let index = 0; index < indexes.length; index += batchSize) {
    chunks.push(indexes.slice(index, index + batchSize));
  }
  return chunks;
}

export async function deepScoreSelectedProfiles(
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  selectedIndexes: number[],
  totalPoolSize: number,
  helpers: {
    scoreFastCandidateBatch?: typeof scoreFastJudgeBatch;
    scoreCandidateBatch: typeof scoreCandidateBatch;
    sortCandidateAssessments: (
      left: ScoredCandidateAssessment,
      right: ScoredCandidateAssessment,
    ) => number;
    scoringHelpers: Parameters<typeof scoreSingleCandidate>[6];
  },
  options?: {
    onCandidateScored?: (assessment: ScoredCandidateAssessment, completedCount: number) => void | Promise<void>;
    onScoringStats?: (stats: {
      fastJudgeCount: number;
      deepJudgeCount: number;
      arbiterCount: number;
      fastJudgeWallTimeMs: number;
      deepJudgeWallTimeMs: number;
      llmWallTimeMs: number;
    }) => void | Promise<void>;
    searchId?: string;
    jobId?: string;
    userId?: string;
  },
): Promise<ScoredCandidateAssessment[]> {
  if (!selectedIndexes.length) return [];

  const scoreBatch = async (batchIndexes: number[]) => {
    return helpers.scoreCandidateBatch(
      runtime,
      parsed,
      jdText,
      profileTexts,
      batchIndexes,
      totalPoolSize,
      helpers.scoringHelpers,
      { searchId: options?.searchId, jobId: options?.jobId, userId: options?.userId },
    );
  };

  const llmStartMs = Date.now();
  const fastJudgeStartMs = Date.now();
  const fastBatchSize = Math.min(
    Math.max(1, FAST_JUDGE_BATCH_SIZE),
    selectedIndexes.length,
  );
  const fastBatches = chunkIndexes(selectedIndexes, fastBatchSize);
  const fastWorkerCount = resolveStageConcurrency(
    FAST_JUDGE_CONCURRENCY,
    fastBatches.length,
  );
  const fastAssessmentBatches = await runWithConcurrency(
    fastBatches,
    fastWorkerCount,
    (batchIndexes) => (helpers.scoreFastCandidateBatch ?? scoreFastJudgeBatch)(
      runtime,
      parsed,
      jdText,
      profileTexts,
      batchIndexes,
      totalPoolSize,
      helpers.scoringHelpers,
      { searchId: options?.searchId, jobId: options?.jobId, userId: options?.userId },
    ),
  );
  const fastAssessments = fastAssessmentBatches
    .flat()
    .sort(helpers.sortCandidateAssessments);
  const fastJudgeWallTimeMs = Date.now() - fastJudgeStartMs;
  const deepReviewIndexes = selectDeepReviewIndexes(fastAssessments, selectedIndexes);
  const fastAssessmentByIndex = new Map(
    fastAssessments.map((assessment) => [assessment.index, assessment]),
  );
  let deepJudgeWallTimeMs = 0;
  let deepAssessments: ScoredCandidateAssessment[] = [];

  helpers.scoringHelpers.logSearchEvent?.("fast_judge_triage_completed", {
    selected_count: selectedIndexes.length,
    fast_completed_count: fastAssessments.length,
    deep_review_count: deepReviewIndexes.length,
    fast_batch_size: fastBatchSize,
    fast_concurrency: fastWorkerCount,
    fast_judge_wall_time_ms: fastJudgeWallTimeMs,
    ...(options?.searchId && { search_id: options.searchId }),
    ...(options?.jobId && { job_id: options.jobId }),
  });

  const batchSize = Math.min(
    Math.max(1, DEEP_SCORING_BATCH_SIZE),
    Math.max(1, deepReviewIndexes.length),
  );
  const batches = chunkIndexes(deepReviewIndexes, batchSize);
  const primerBatchCount = Math.min(
    Math.max(0, DEEP_CACHE_PRIMER_COUNT),
    batches.length,
  );
  const primerBatches = batches.slice(0, primerBatchCount);
  const remainingBatches = batches.slice(primerBatchCount);
  const deepJudgeStartMs = Date.now();

  for (const batch of primerBatches) {
    deepAssessments.push(...await scoreBatch(batch));
  }

  const workerCount = Math.min(DEEP_REVIEW_CONCURRENCY, remainingBatches.length);
  const remainingAssessmentBatches = await runWithConcurrency(
    remainingBatches,
    workerCount,
    scoreBatch,
  );
  deepAssessments = [...deepAssessments, ...remainingAssessmentBatches.flat()];
  deepJudgeWallTimeMs = Date.now() - deepJudgeStartMs;

  const finalByIndex = new Map(fastAssessmentByIndex);
  for (const assessment of deepAssessments) {
    finalByIndex.set(assessment.index, assessment);
  }
  const finalAssessments = selectedIndexes
    .map((index) => finalByIndex.get(index))
    .filter((assessment): assessment is ScoredCandidateAssessment => Boolean(assessment))
    .sort(helpers.sortCandidateAssessments);

  let completedCount = 0;
  for (const assessment of finalAssessments) {
    completedCount += 1;
    try {
      await options?.onCandidateScored?.(assessment, completedCount);
    } catch {
      // non-blocking
    }
  }

  await options?.onScoringStats?.({
    fastJudgeCount: fastAssessments.length,
    deepJudgeCount: deepReviewIndexes.length,
    arbiterCount: deepAssessments.filter(
      (assessment) => assessment.scoring_method === "dual_review_arbitrated",
    ).length,
    fastJudgeWallTimeMs,
    deepJudgeWallTimeMs,
    llmWallTimeMs: Date.now() - llmStartMs,
  });

  return finalAssessments;
}
