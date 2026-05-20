import assert from "node:assert/strict";
import test from "node:test";

import {
  deepScoreSelectedProfiles,
  scoreCandidateBatch,
} from "@/lib/search/scoring-runtime";
import type {
  BlockingSeverity,
  JudgeScoreResult,
  ScoredCandidateAssessment,
} from "@/lib/search/types";

function assessmentForIndex(index: number): ScoredCandidateAssessment {
  return {
    index,
    skills: [],
    experience_years: null,
    location: null,
    suitability: {
      fit_decision: "viable_fit",
      actionability: "needs_review",
      bucket: "consider_next",
      match_score: 70,
      quality_score: 75,
      overall_score: 70,
      advance_score: 70,
      advance_recommendation: "hold",
      primary_risk: null,
      first_contact_confidence: "medium",
      subscription_trigger_score: 70,
      shortlist_decision: "yes",
      shortlist_reason: null,
      blocking_constraints: [],
      blocking_severity: "none",
      scoring_breakdown: {
        capability_score: 75,
        relevance_score: 75,
        join_likelihood_score: 50,
        join_likelihood_reasons: [],
        quality_score: 75,
        overall_score: 70,
        advance_score: 70,
      },
      constraint_verdicts: {
        location_fit: "unknown",
        work_model_fit: "unclear",
        must_have_coverage: "partial",
      },
      constraint_risks: [],
      risk_flags: [],
      why_this_candidate: [],
      why_not_higher: [],
      evidence_quality: "medium",
    },
  };
}

test("deepScoreSelectedProfiles batches judge scoring instead of scoring one candidate per call", async () => {
  const batches: number[][] = [];
  const fastBatches: number[][] = [];
  const completed: number[] = [];
  const selectedIndexes = Array.from({ length: 25 }, (_, index) => index);
  const mockFastCandidateBatch = async (
    _runtime: Parameters<typeof deepScoreSelectedProfiles>[0],
    _parsed: Record<string, unknown>,
    _jdText: string,
    _profiles: string[],
    batchIndexes: number[],
  ) => {
    fastBatches.push([...batchIndexes]);
    return batchIndexes.map(assessmentForIndex);
  };
  const mockScoreCandidateBatch: typeof scoreCandidateBatch = async (
    _runtime,
    _parsed,
    _jdText,
    _profiles,
    batchIndexes,
  ) => {
    batches.push([...batchIndexes]);
    return batchIndexes.map(assessmentForIndex);
  };

  const assessments = await deepScoreSelectedProfiles(
    {
      lightPrescreenMaxOutputTokens: 200,
      judgeMaxOutputTokens: 2400,
      arbiterMaxOutputTokens: 4000,
      outreachMaxOutputTokens: 700,
      judgeMaxAttempts: 1,
      arbiterMaxAttempts: 1,
      judgeMode: "dual",
    },
    {},
    "JD",
    selectedIndexes.map((index) => `[${index}] Candidate ${index}`),
    selectedIndexes,
    selectedIndexes.length,
    {
      scoreFastCandidateBatch: mockFastCandidateBatch as never,
      scoreCandidateBatch: mockScoreCandidateBatch,
      sortCandidateAssessments: (left, right) => left.index - right.index,
      scoringHelpers: {} as never,
    },
    {
      onCandidateScored: async (assessment) => {
        completed.push(assessment.index);
      },
    },
  );

  assert.deepEqual(fastBatches, [
    Array.from({ length: 20 }, (_, index) => index),
    [20, 21, 22, 23, 24],
  ]);
  assert.deepEqual(batches, [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24],
  ]);
  assert.equal(assessments.length, 25);
  assert.equal(completed.length, 25);
});

function judgeResult(
  index: number,
  overrides: Partial<JudgeScoreResult> = {},
): JudgeScoreResult {
  return {
    index,
    capability_score: 40,
    relevance_score: 35,
    join_likelihood_score: 30,
    join_likelihood_reasons: [],
    short_reasons: [],
    risk_flags: [],
    blocking_constraints: [],
    blocking_severity: "none",
    advance_recommendation: "reject",
    shortlist_decision: "no",
    shortlist_reason: null,
    constraint_verdicts: {
      location_fit: "unknown",
      work_model_fit: "unclear",
      must_have_coverage: "weak",
    },
    evidence_quality: "medium",
    skills: [],
    experience_years: null,
    location: null,
    why_reachable_now: null,
    ...overrides,
  };
}

function buildScoringHelpers(params: {
  calls: Array<{ judge: string; indexes: number[] }>;
  arbiters: number[];
  events: string[];
}): Parameters<typeof scoreCandidateBatch>[6] {
  return {
    judgeScoreBatch: async (_runtime, _parsed, _jdText, _profileTexts, indexes, _totalPoolSize, judgeLabel) => {
      params.calls.push({ judge: judgeLabel, indexes: [...indexes] });
      if (judgeLabel === "Judge A") {
        return indexes.map((index) => {
          if (index === 1) {
            return judgeResult(index, {
              capability_score: 86,
              relevance_score: 82,
              join_likelihood_score: 38,
              advance_recommendation: "advance",
              shortlist_decision: "yes",
              constraint_verdicts: {
                location_fit: "nearby",
                work_model_fit: "yes",
                must_have_coverage: "strong",
              },
            });
          }
          if (index === 2) {
            return judgeResult(index, {
              capability_score: 72,
              relevance_score: 64,
              join_likelihood_score: 45,
              advance_recommendation: "hold",
              shortlist_decision: "yes",
              constraint_verdicts: {
                location_fit: "unknown",
                work_model_fit: "unclear",
                must_have_coverage: "partial",
              },
            });
          }
          return judgeResult(index);
        });
      }

      return indexes.map((index) => {
        if (index === 2) {
          return judgeResult(index, {
            capability_score: 64,
            relevance_score: 50,
            join_likelihood_score: 28,
            advance_recommendation: "reject",
            shortlist_decision: "no",
            constraint_verdicts: {
              location_fit: "unknown",
              work_model_fit: "unclear",
              must_have_coverage: "weak",
            },
          });
        }
        return judgeResult(index, {
          capability_score: 84,
          relevance_score: 82,
          join_likelihood_score: 52,
          advance_recommendation: "advance",
          shortlist_decision: "yes",
          constraint_verdicts: {
            location_fit: "nearby",
            work_model_fit: "yes",
            must_have_coverage: "strong",
          },
        });
      });
    },
    arbitrateCandidateScore: async (_runtime, _parsed, _jdText, _profileText, _judgeA) => {
      params.arbiters.push(_judgeA.index);
      return {
        ...assessmentForIndex(_judgeA.index),
        scoring_method: "dual_review_arbitrated",
        judge_conflict: true,
        judge_delta: 18,
      };
    },
    logSearchEvent: (eventName) => {
      params.events.push(eventName);
    },
    computeQualityScore: (capabilityScore, relevanceScore) =>
      Math.round((capabilityScore + relevanceScore) / 2),
    computeAdvanceScore: (capabilityScore, relevanceScore, joinLikelihoodScore, blockingSeverity) => {
      if (blockingSeverity === "hard") return 0;
      return Math.round((capabilityScore + relevanceScore + joinLikelihoodScore) / 3);
    },
    deriveAdvanceRecommendation: (advanceScore, blockingSeverity) => {
      if (blockingSeverity === "hard" || advanceScore < 50) return "reject";
      return advanceScore >= 70 ? "advance" : "hold";
    },
    sanitizeCandidateSuitability: (value) => {
      const item = value as Record<string, unknown>;
      const capability = Number(item.capability_score ?? 0);
      const relevance = Number(item.relevance_score ?? 0);
      const join = Number(item.join_likelihood_score ?? 0);
      const quality = Number(item.quality_score ?? Math.round((capability + relevance) / 2));
      const advance = Number(item.advance_score ?? Math.round((capability + relevance + join) / 3));
      const blockingSeverity = (item.blocking_severity || "none") as BlockingSeverity;
      const advanceRecommendation = (
        item.advance_recommendation ||
        (advance >= 70 ? "advance" : advance >= 50 ? "hold" : "reject")
      ) as "advance" | "hold" | "reject";
      const constraintVerdicts = item.constraint_verdicts as ScoredCandidateAssessment["suitability"]["constraint_verdicts"];
      const bucket =
        blockingSeverity === "hard" ||
        advanceRecommendation === "reject" ||
        constraintVerdicts?.must_have_coverage === "weak"
          ? "do_not_show"
          : quality >= 80 && advance >= 65
            ? "strong_now"
            : "consider_next";

      return {
        fit_decision: quality >= 80 ? "strong_fit" : quality >= 60 ? "viable_fit" : "reject",
        actionability: bucket === "do_not_show" ? "not_actionable" : "ready_to_act",
        bucket,
        match_score: advance,
        quality_score: quality,
        overall_score: advance,
        advance_score: advance,
        advance_recommendation: advanceRecommendation,
        primary_risk: null,
        first_contact_confidence: "medium",
        subscription_trigger_score: advance,
        shortlist_decision: (item.shortlist_decision || "no") as "yes" | "no",
        shortlist_reason: null,
        blocking_constraints: [],
        blocking_severity: blockingSeverity,
        scoring_breakdown: {
          capability_score: capability,
          relevance_score: relevance,
          join_likelihood_score: join,
          join_likelihood_reasons: [],
          quality_score: quality,
          overall_score: advance,
          advance_score: advance,
        },
        constraint_verdicts: constraintVerdicts || {
          location_fit: "unknown",
          work_model_fit: "unclear",
          must_have_coverage: "unknown",
        },
        constraint_risks: [],
        risk_flags: [],
        why_this_candidate: [],
        why_not_higher: [],
        evidence_quality: "medium",
      };
    },
    normalizeNullableString: (value) => typeof value === "string" ? value : null,
    deriveFitDecisionFromScore: (score) => score >= 80 ? "strong_fit" : score >= 60 ? "viable_fit" : "reject",
    judgeHelpers: {} as never,
    arbiterHelpers: {} as never,
  };
}

test("scoreCandidateBatch uses selective second review and merges non-hard conflicts without synchronous arbiter", async () => {
  const calls: Array<{ judge: string; indexes: number[] }> = [];
  const arbiters: number[] = [];
  const events: string[] = [];

  const results = await scoreCandidateBatch(
    {
      lightPrescreenMaxOutputTokens: 200,
      judgeMaxOutputTokens: 2400,
      arbiterMaxOutputTokens: 4000,
      outreachMaxOutputTokens: 700,
      judgeMaxAttempts: 1,
      arbiterMaxAttempts: 1,
      judgeMode: "dual",
    },
    {},
    "JD",
    ["[0] Weak", "[1] Strong", "[2] Borderline"],
    [0, 1, 2],
    3,
    buildScoringHelpers({ calls, arbiters, events }),
  );

  assert.deepEqual(calls, [
    { judge: "Judge A", indexes: [0, 1, 2] },
    { judge: "Judge B", indexes: [1, 2] },
  ]);
  assert.deepEqual(arbiters, []);
  assert.equal(results.find((result) => result.index === 0)?.scoring_method, "single_judge_triage");
  assert.equal(results.find((result) => result.index === 1)?.scoring_method, "selective_dual_review");
  assert.equal(results.find((result) => result.index === 2)?.scoring_method, "selective_dual_review");
  assert.ok(events.includes("selective_review_triage"));
  assert.ok(events.includes("selective_review_resolution"));
});

test("scoreCandidateBatch skips second review for clear non-borderline holds", async () => {
  const calls: Array<{ judge: string; indexes: number[] }> = [];
  const arbiters: number[] = [];
  const events: string[] = [];
  const helpers = buildScoringHelpers({ calls, arbiters, events });

  helpers.judgeScoreBatch = async (_runtime, _parsed, _jdText, _profileTexts, indexes, _totalPoolSize, judgeLabel) => {
    calls.push({ judge: judgeLabel, indexes: [...indexes] });
    return indexes.map((index) => {
      if (index === 1) {
        return judgeResult(index, {
          capability_score: 66,
          relevance_score: 58,
          join_likelihood_score: 46,
          advance_recommendation: "hold",
          shortlist_decision: "yes",
          constraint_verdicts: {
            location_fit: "unknown",
            work_model_fit: "unclear",
            must_have_coverage: "partial",
          },
        });
      }
      return judgeResult(index);
    });
  };

  const results = await scoreCandidateBatch(
    {
      lightPrescreenMaxOutputTokens: 200,
      judgeMaxOutputTokens: 2400,
      arbiterMaxOutputTokens: 4000,
      outreachMaxOutputTokens: 700,
      judgeMaxAttempts: 1,
      arbiterMaxAttempts: 1,
      judgeMode: "dual",
    },
    {},
    "JD",
    ["[0] Weak", "[1] Hold"],
    [0, 1],
    2,
    helpers,
  );

  assert.deepEqual(calls, [
    { judge: "Judge A", indexes: [0, 1] },
  ]);
  assert.equal(results.find((result) => result.index === 1)?.scoring_method, "single_judge_triage");
});

test("scoreCandidateBatch fails when primary judge scoring fails", async () => {
  const calls: Array<{ judge: string; indexes: number[] }> = [];
  const events: string[] = [];
  const helpers = buildScoringHelpers({ calls, arbiters: [], events });
  helpers.judgeScoreBatch = async (_runtime, _parsed, _jdText, _profileTexts, indexes, _totalPoolSize, judgeLabel) => {
    calls.push({ judge: judgeLabel, indexes: [...indexes] });
    throw new Error("judge provider unavailable");
  };

  await assert.rejects(
    scoreCandidateBatch(
      {
        lightPrescreenMaxOutputTokens: 200,
        judgeMaxOutputTokens: 2400,
        arbiterMaxOutputTokens: 4000,
        outreachMaxOutputTokens: 700,
        judgeMaxAttempts: 1,
        arbiterMaxAttempts: 1,
        judgeMode: "dual",
      },
      {},
      "JD",
      ["[0] Candidate"],
      [0],
      1,
      helpers,
    ),
    /judge provider unavailable/,
  );
  assert.deepEqual(calls, [{ judge: "Judge A", indexes: [0] }]);
  assert.ok(events.includes("selective_review_primary_judge_failed"));
});

test("scoreCandidateBatch fails when secondary judge omits a requested second-review candidate", async () => {
  const calls: Array<{ judge: string; indexes: number[] }> = [];
  const helpers = buildScoringHelpers({ calls, arbiters: [], events: [] });
  helpers.judgeScoreBatch = async (_runtime, _parsed, _jdText, _profileTexts, indexes, _totalPoolSize, judgeLabel) => {
    calls.push({ judge: judgeLabel, indexes: [...indexes] });
    if (judgeLabel === "Judge B") return [];
    return indexes.map((index) => judgeResult(index, {
      capability_score: 86,
      relevance_score: 82,
      join_likelihood_score: 38,
      advance_recommendation: "advance",
      shortlist_decision: "yes",
      constraint_verdicts: {
        location_fit: "nearby",
        work_model_fit: "yes",
        must_have_coverage: "strong",
      },
    }));
  };

  await assert.rejects(
    scoreCandidateBatch(
      {
        lightPrescreenMaxOutputTokens: 200,
        judgeMaxOutputTokens: 2400,
        arbiterMaxOutputTokens: 4000,
        outreachMaxOutputTokens: 700,
        judgeMaxAttempts: 1,
        arbiterMaxAttempts: 1,
        judgeMode: "dual",
      },
      {},
      "JD",
      ["[0] Candidate"],
      [0],
      1,
      helpers,
    ),
    /Secondary judge did not return candidate 0/,
  );
  assert.deepEqual(calls, [
    { judge: "Judge A", indexes: [0] },
    { judge: "Judge B", indexes: [0] },
  ]);
});

test("scoreCandidateBatch fails when arbiter cannot resolve a real judge conflict", async () => {
  const calls: Array<{ judge: string; indexes: number[] }> = [];
  const arbiters: number[] = [];
  const helpers = buildScoringHelpers({ calls, arbiters, events: [] });
  helpers.judgeScoreBatch = async (_runtime, _parsed, _jdText, _profileTexts, indexes, _totalPoolSize, judgeLabel) => {
    calls.push({ judge: judgeLabel, indexes: [...indexes] });
    return indexes.map((index) => judgeResult(index, judgeLabel === "Judge A"
      ? {
        capability_score: 90,
        relevance_score: 88,
        join_likelihood_score: 76,
        advance_recommendation: "advance",
        shortlist_decision: "yes",
        constraint_verdicts: {
          location_fit: "local",
          work_model_fit: "yes",
          must_have_coverage: "strong",
        },
      }
      : {
        capability_score: 40,
        relevance_score: 34,
        join_likelihood_score: 20,
        advance_recommendation: "reject",
        shortlist_decision: "no",
        blocking_constraints: ["hard location mismatch"],
        blocking_severity: "hard",
        constraint_verdicts: {
          location_fit: "non_local",
          work_model_fit: "no",
          must_have_coverage: "weak",
        },
      }));
  };
  helpers.arbitrateCandidateScore = async (_runtime, _parsed, _jdText, _profileText, judgeA) => {
    arbiters.push(judgeA.index);
    throw new Error("arbiter unavailable");
  };

  await assert.rejects(
    scoreCandidateBatch(
      {
        lightPrescreenMaxOutputTokens: 200,
        judgeMaxOutputTokens: 2400,
        arbiterMaxOutputTokens: 4000,
        outreachMaxOutputTokens: 700,
        judgeMaxAttempts: 1,
        arbiterMaxAttempts: 1,
        judgeMode: "dual",
      },
      {},
      "JD",
      ["[0] Candidate"],
      [0],
      1,
      helpers,
    ),
    /arbiter unavailable/,
  );
  assert.deepEqual(arbiters, [0]);
});
