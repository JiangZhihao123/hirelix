import assert from "node:assert/strict";
import test from "node:test";

import {
  deepScoreSelectedProfiles,
  scoreCandidateBatch,
} from "@/lib/search/scoring-runtime";
import type { ScoredCandidateAssessment } from "@/lib/search/types";

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
  const completed: number[] = [];
  const selectedIndexes = Array.from({ length: 25 }, (_, index) => index);
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

  assert.deepEqual(batches, [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24],
  ]);
  assert.equal(assessments.length, 25);
  assert.equal(completed.length, 25);
});
