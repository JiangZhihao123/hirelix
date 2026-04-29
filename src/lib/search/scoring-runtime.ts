import {
  generateLlmJson,
  resolveDeepSeekReasoningEffort,
} from "@/lib/llm-client";
import {
  ARBITER_SCORE_JSON_SCHEMA,
  buildJudgeScoreJsonSchema,
} from "@/lib/llm-schemas";
import {
  DEEP_SCORING_BATCH_SIZE,
  DEEP_CACHE_PRIMER_COUNT,
  ARBITER_SCORING_TIMEOUT_MS,
  DEEP_REVIEW_CONCURRENCY,
  JUDGE_SCORING_TIMEOUT_MS,
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
  context?: { searchId?: string; jobId?: string },
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
    },
  );
  const judgeModel = helpers.getJudgeModel();
  const maxAttempts = runtime.judgeMaxAttempts;
  const maxOutputTokens = Math.min(
    Math.max(runtime.judgeMaxOutputTokens, runtime.judgeMaxOutputTokens * batchIndexes.length),
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
          jsonSchema: buildJudgeScoreJsonSchema(batchIndexes.length),
          requireParameters: true,
          deepSeekThinking: "enabled",
          deepSeekReasoningEffort: resolveDeepSeekReasoningEffort(
            "SEARCH_JUDGE_REASONING_EFFORT",
            "high",
          ),
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
  context?: { searchId?: string; jobId?: string },
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

function shouldRequestSecondReview(assessment: ScoredCandidateAssessment) {
  const suitability = assessment.suitability;
  const breakdown = suitability.scoring_breakdown;

  if (suitability.blocking_severity === "hard") return false;
  if (suitability.shortlist_decision === "yes") return true;
  if (suitability.bucket !== "do_not_show") return true;
  if (suitability.advance_recommendation !== "reject") return true;

  const highPotentialTechnicalFit =
    suitability.quality_score >= 72 ||
    (breakdown.capability_score >= 75 && breakdown.relevance_score >= 55) ||
    (breakdown.relevance_score >= 70 && breakdown.capability_score >= 65);

  const borderlineFit =
    suitability.quality_score >= 62 &&
    breakdown.relevance_score >= 55 &&
    suitability.constraint_verdicts.must_have_coverage !== "weak";

  return highPotentialTechnicalFit || borderlineFit;
}

function isActionableAssessment(assessment: ScoredCandidateAssessment) {
  return (
    assessment.suitability.bucket !== "do_not_show" ||
    assessment.suitability.shortlist_decision === "yes" ||
    assessment.suitability.advance_recommendation !== "reject"
  );
}

function shouldArbitrateActionConflict(
  judgeA: JudgeScoreResult,
  judgeB: JudgeScoreResult,
  helpers: Parameters<typeof scoreSingleCandidate>[6],
) {
  const assessmentA = mergeSingleJudgeResult(judgeA, helpers);
  const assessmentB = mergeSingleJudgeResult(judgeB, helpers);
  const verdictA = assessmentA.suitability.constraint_verdicts;
  const verdictB = assessmentB.suitability.constraint_verdicts;

  if (assessmentA.suitability.shortlist_decision !== assessmentB.suitability.shortlist_decision) {
    return true;
  }
  if (isActionableAssessment(assessmentA) !== isActionableAssessment(assessmentB)) {
    return true;
  }
  if (
    assessmentA.suitability.advance_recommendation === "reject" !==
    (assessmentB.suitability.advance_recommendation === "reject")
  ) {
    return true;
  }
  if (
    assessmentA.suitability.blocking_severity === "hard" !==
    (assessmentB.suitability.blocking_severity === "hard")
  ) {
    return true;
  }

  const mustHaveA = verdictA.must_have_coverage;
  const mustHaveB = verdictB.must_have_coverage;
  if ((mustHaveA === "weak") !== (mustHaveB === "weak")) {
    return true;
  }

  return false;
}

export async function scoreCandidateBatch(
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  selectedIndexes: number[],
  totalPoolSize: number,
  helpers: Parameters<typeof scoreSingleCandidate>[6],
  context?: { searchId?: string; jobId?: string },
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
    scoreCandidateBatch: typeof scoreCandidateBatch;
    sortCandidateAssessments: (
      left: ScoredCandidateAssessment,
      right: ScoredCandidateAssessment,
    ) => number;
    scoringHelpers: Parameters<typeof scoreSingleCandidate>[6];
  },
  options?: {
    onCandidateScored?: (assessment: ScoredCandidateAssessment, completedCount: number) => void | Promise<void>;
    searchId?: string;
    jobId?: string;
  },
): Promise<ScoredCandidateAssessment[]> {
  if (!selectedIndexes.length) return [];

  let completedCount = 0;
  const scoreBatch = async (batchIndexes: number[]) => {
    const results = await helpers.scoreCandidateBatch(
      runtime,
      parsed,
      jdText,
      profileTexts,
      batchIndexes,
      totalPoolSize,
      helpers.scoringHelpers,
      { searchId: options?.searchId, jobId: options?.jobId },
    );
    for (const result of results) {
      completedCount += 1;
      try {
        await options?.onCandidateScored?.(result, completedCount);
      } catch {
        // non-blocking
      }
    }
    return results;
  };

  const batchSize = Math.min(
    Math.max(1, DEEP_SCORING_BATCH_SIZE),
    selectedIndexes.length,
  );
  const batches = chunkIndexes(selectedIndexes, batchSize);
  const primerBatchCount = Math.min(
    Math.max(1, DEEP_CACHE_PRIMER_COUNT),
    batches.length,
  );
  const primerBatches = batches.slice(0, primerBatchCount);
  const remainingBatches = batches.slice(primerBatchCount);
  const primerAssessments: ScoredCandidateAssessment[] = [];

  for (const batch of primerBatches) {
    primerAssessments.push(...await scoreBatch(batch));
  }

  const workerCount = Math.min(DEEP_REVIEW_CONCURRENCY, remainingBatches.length);
  const remainingAssessmentBatches = await runWithConcurrency(
    remainingBatches,
    workerCount,
    scoreBatch,
  );

  return [...primerAssessments, ...remainingAssessmentBatches.flat()]
    .sort(helpers.sortCandidateAssessments);
}
