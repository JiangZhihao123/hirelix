import { generateOpenRouterJson } from "@/lib/openrouter";
import {
  ARBITER_SCORE_JSON_SCHEMA,
  buildJudgeScoreJsonSchema,
} from "@/lib/openrouter-schemas";
import {
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
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data: judgeResult, usage } = await withTimeout(
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

      if (usage.cachedInputTokens > 0 || usage.cacheMissInputTokens > 0) {
        const measuredInputTokens =
          usage.cachedInputTokens + usage.cacheMissInputTokens;
        helpers.logSearchEvent("judge_scoring_cache_usage", {
          judge: judgeLabel,
          model: judgeModel,
          batch_size: batchIndexes.length,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
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
        (signal) => generateOpenRouterJson<unknown>({
          model: helpers.getArbiterModel(),
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

export async function deepScoreSelectedProfiles(
  runtime: SearchExecutionRuntime,
  parsed: Record<string, unknown>,
  jdText: string,
  profileTexts: string[],
  selectedIndexes: number[],
  totalPoolSize: number,
  helpers: {
    scoreSingleCandidate: typeof scoreSingleCandidate;
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
  const scoreIndex = async (selectedIndex: number) => {
    const result = await helpers.scoreSingleCandidate(
      runtime,
      parsed,
      jdText,
      profileTexts,
      selectedIndex,
      totalPoolSize,
      helpers.scoringHelpers,
      { searchId: options?.searchId, jobId: options?.jobId },
    );
    if (result) {
      completedCount += 1;
      try {
        await options?.onCandidateScored?.(result, completedCount);
      } catch {
        // non-blocking
      }
    }
    return result;
  };

  const primerCount = Math.min(DEEP_CACHE_PRIMER_COUNT, selectedIndexes.length);
  const primerIndexes = selectedIndexes.slice(0, primerCount);
  const remainingIndexes = selectedIndexes.slice(primerCount);
  const primerAssessments: Array<ScoredCandidateAssessment | null> = [];

  for (const selectedIndex of primerIndexes) {
    primerAssessments.push(await scoreIndex(selectedIndex));
  }

  const workerCount = Math.min(DEEP_REVIEW_CONCURRENCY, remainingIndexes.length);
  const remainingAssessments = await runWithConcurrency(
    remainingIndexes,
    workerCount,
    scoreIndex,
  );

  return [...primerAssessments, ...remainingAssessments]
    .filter((assessment): assessment is ScoredCandidateAssessment => Boolean(assessment))
    .sort(helpers.sortCandidateAssessments);
}
