import assert from "node:assert/strict";
import test from "node:test";

import {
  computeAdvanceScore,
  deriveExcludedReason,
  shouldDisplayCandidate,
} from "@/lib/search-jobs";
import { mergeJudgeResults } from "@/lib/search/scoring";
import type {
  BlockingSeverity,
  ScoredCandidateAssessment,
} from "@/lib/search/types";

// The shortlist gate defends passive-sourcing recall: a technically strong
// candidate with low Reachability should still surface, because that is
// exactly the person recruiters pay us to find.

function assessment(partial: {
  capability: number;
  relevance: number;
  joinLikelihood: number;
  quality?: number;
  advance?: number;
  bucket?: ScoredCandidateAssessment["suitability"]["bucket"];
  blocking?: BlockingSeverity;
  mustHaveCoverage?: ScoredCandidateAssessment["suitability"]["constraint_verdicts"]["must_have_coverage"];
  locationFit?: ScoredCandidateAssessment["suitability"]["constraint_verdicts"]["location_fit"];
  workModelFit?: ScoredCandidateAssessment["suitability"]["constraint_verdicts"]["work_model_fit"];
  shortlistDecision?: "yes" | "no";
  evidenceQuality?: "high" | "medium" | "low";
  whyThisCandidate?: string[];
}): ScoredCandidateAssessment {
  const quality =
    partial.quality ?? Math.round((partial.capability + partial.relevance) / 2);
  const advance =
    partial.advance ??
    computeAdvanceScore(
      partial.capability,
      partial.relevance,
      partial.joinLikelihood,
      partial.blocking ?? "none",
    );
  return {
    index: 0,
    skills: [],
    experience_years: null,
    location: null,
    suitability: {
      fit_decision: "viable_fit",
      actionability: "needs_review",
      bucket: partial.bucket ?? "consider_next",
      match_score: advance,
      quality_score: quality,
      overall_score: advance,
      advance_score: advance,
      advance_recommendation: "hold",
      primary_risk: null,
      first_contact_confidence: "medium",
      subscription_trigger_score: quality,
      shortlist_decision: partial.shortlistDecision ?? "yes",
      shortlist_reason: null,
      blocking_constraints: [],
      blocking_severity: partial.blocking ?? "none",
      scoring_breakdown: {
        capability_score: partial.capability,
        relevance_score: partial.relevance,
        join_likelihood_score: partial.joinLikelihood,
        join_likelihood_reasons: [],
        quality_score: quality,
        overall_score: advance,
        advance_score: advance,
      },
      constraint_verdicts: {
        location_fit: partial.locationFit ?? "local",
        work_model_fit: partial.workModelFit ?? "yes",
        must_have_coverage: partial.mustHaveCoverage ?? "strong",
      },
      constraint_risks: [],
      risk_flags: [],
      why_this_candidate: partial.whyThisCandidate ?? ["strong python depth"],
      why_not_higher: [],
      evidence_quality: partial.evidenceQuality ?? "medium",
    },
  };
}

test("computeAdvanceScore weights Reachability at 20%, not 30%", () => {
  // capability 80, relevance 80, join 20 -> 80*0.35 + 80*0.45 + 20*0.2 = 68
  assert.equal(computeAdvanceScore(80, 80, 20, "none"), 68);

  // Identical caps/rel, higher join only lifts advance by the 20% slice
  const lowReach = computeAdvanceScore(80, 80, 20, "none");
  const highReach = computeAdvanceScore(80, 80, 80, "none");
  assert.equal(highReach - lowReach, 12); // (80-20)*0.2 = 12
});

test("shouldDisplayCandidate: technically strong + low Reachability still passes", () => {
  // Happily-employed senior engineer: cap=78, rel=75, join=15.
  // Under old 0.3/0.4/0.3 weights with soft penalty this used to bucket as
  // do_not_show and fail every gate; under new rules they qualify via
  // technicalWatchlistFit or strongTechnicalFit.
  const a = assessment({
    capability: 78,
    relevance: 75,
    joinLikelihood: 15,
    mustHaveCoverage: "strong",
    bucket: "consider_next",
  });
  assert.equal(shouldDisplayCandidate(a), true);
});

test("shouldDisplayCandidate: technicalWatchlistFit escape hatch requires clear strong evidence", () => {
  // Happily-employed mid-senior: join_likelihood ~25 is typical for this group.
  // Under the old 82/80 gate this was filtered; under the new 72/68 gate the
  // escape hatch fires only when must-have and location evidence are clear.
  const a = assessment({
    capability: 72,
    relevance: 68,
    joinLikelihood: 25,
    quality: 72,
    mustHaveCoverage: "strong",
  });
  assert.equal(shouldDisplayCandidate(a), true);
});

test("shouldDisplayCandidate: unknown location no longer enters recruiter-visible shortlist", () => {
  const a = assessment({
    capability: 90,
    relevance: 88,
    joinLikelihood: 70,
    quality: 89,
    mustHaveCoverage: "strong",
    locationFit: "unknown",
  });
  assert.equal(shouldDisplayCandidate(a), false);
});

test("shouldDisplayCandidate: partial must-have needs strong enough evidence", () => {
  const weakPartial = assessment({
    capability: 72,
    relevance: 70,
    joinLikelihood: 70,
    quality: 71,
    mustHaveCoverage: "partial",
  });
  assert.equal(shouldDisplayCandidate(weakPartial), false);

  const strongPartial = assessment({
    capability: 78,
    relevance: 76,
    joinLikelihood: 55,
    quality: 78,
    mustHaveCoverage: "partial",
  });
  assert.equal(shouldDisplayCandidate(strongPartial), true);
});

test("shouldDisplayCandidate: explicitly unreachable candidate (join < ~15) is still filtered", () => {
  // Sanity check: we did not accidentally let "will not respond" candidates
  // through. An LLM rating join_likelihood=10 signals explicit disinterest,
  // and the match_score floor catches them even with relaxed weights.
  const a = assessment({
    capability: 72,
    relevance: 68,
    joinLikelihood: 10,
    quality: 72,
    mustHaveCoverage: "partial",
  });
  assert.equal(shouldDisplayCandidate(a), false);
});

test("shouldDisplayCandidate: weak must-have coverage still blocks even if technically strong", () => {
  const a = assessment({
    capability: 80,
    relevance: 80,
    joinLikelihood: 60,
    quality: 80,
    mustHaveCoverage: "weak",
    bucket: "do_not_show", // weak must-have pushes bucket in real flow
  });
  assert.equal(shouldDisplayCandidate(a), false);
});

test("shouldDisplayCandidate: hard blocker always filters out", () => {
  const a = assessment({
    capability: 90,
    relevance: 90,
    joinLikelihood: 80,
    blocking: "hard",
    bucket: "do_not_show",
  });
  assert.equal(shouldDisplayCandidate(a), false);
});

test("shouldDisplayCandidate: capability below floor blocks regardless of other scores", () => {
  const a = assessment({
    capability: 60, // below SHORTLIST_CAPABILITY_MIN (70)
    relevance: 85,
    joinLikelihood: 70,
    quality: 72,
  });
  assert.equal(shouldDisplayCandidate(a), false);
});

test("shouldDisplayCandidate: clear IC versus manager mismatch blocks technical escape hatches", () => {
  const a = assessment({
    capability: 83,
    relevance: 73,
    joinLikelihood: 90,
    quality: 78,
    mustHaveCoverage: "partial",
    bucket: "consider_next",
    whyThisCandidate: ["PostgreSQL and backend stack"],
  });
  a.suitability.shortlist_decision = "no";
  a.suitability.primary_risk = "Role seniority mismatch";
  a.suitability.blocking_constraints = ["Seeking executive/management roles"];
  a.suitability.risk_flags = ["Role seniority mismatch"];
  a.suitability.why_not_higher = ["Leadership focus"];

  assert.equal(shouldDisplayCandidate(a), false);
});

test("deriveExcludedReason: only labels response_risk when join_likelihood < 35", () => {
  const borderline = assessment({
    capability: 72,
    relevance: 60,
    joinLikelihood: 40, // previously labeled response_risk at <55 threshold
    quality: 66,
    bucket: "do_not_show",
  });
  // With join=40, no stack/title/evidence issues -> falls through to multiple_risks
  assert.equal(deriveExcludedReason(borderline), "multiple_risks");

  const trulyUnreachable = assessment({
    capability: 72,
    relevance: 60,
    joinLikelihood: 20,
    quality: 66,
    bucket: "do_not_show",
  });
  assert.equal(deriveExcludedReason(trulyUnreachable), "response_risk");
});

test("mergeJudgeResults keeps the more conservative structured verdicts", () => {
  const baseJudge = {
    index: 0,
    capability_score: 88,
    relevance_score: 86,
    join_likelihood_score: 55,
    join_likelihood_reasons: [],
    short_reasons: ["strong backend"],
    risk_flags: [],
    blocking_constraints: [],
    blocking_severity: "none" as const,
    advance_recommendation: "advance" as const,
    shortlist_decision: "yes" as const,
    shortlist_reason: null,
    constraint_verdicts: {
      location_fit: "local" as const,
      work_model_fit: "yes" as const,
      must_have_coverage: "strong" as const,
    },
    evidence_quality: "high" as const,
    skills: [],
    experience_years: null,
    location: null,
    why_reachable_now: null,
  };

  const merged = mergeJudgeResults(
    baseJudge,
    {
      ...baseJudge,
      evidence_quality: "medium",
      constraint_verdicts: {
        location_fit: "unknown",
        work_model_fit: "unclear",
        must_have_coverage: "partial",
      },
      risk_flags: ["PostgreSQL unconfirmed"],
    },
    {
      computeQualityScore: (capabilityScore, relevanceScore) =>
        Math.round((capabilityScore + relevanceScore) / 2),
      computeAdvanceScore,
      deriveAdvanceRecommendation: (advanceScore, blockingSeverity) => {
        if (blockingSeverity === "hard") return "reject";
        return advanceScore >= 72 ? "advance" : advanceScore >= 45 ? "hold" : "reject";
      },
      sanitizeCandidateSuitability: (value) => {
        const item = value as {
          capability_score: number;
          relevance_score: number;
          join_likelihood_score: number;
          constraint_verdicts: ScoredCandidateAssessment["suitability"]["constraint_verdicts"];
          evidence_quality: "high" | "medium" | "low";
        };
        const suitability = assessment({
          capability: item.capability_score,
          relevance: item.relevance_score,
          joinLikelihood: item.join_likelihood_score,
          mustHaveCoverage: item.constraint_verdicts.must_have_coverage,
          evidenceQuality: item.evidence_quality,
        }).suitability;
        return {
          ...suitability,
          constraint_verdicts: item.constraint_verdicts,
        };
      },
      normalizeNullableString: (value) => (typeof value === "string" ? value : null),
    },
  );

  assert.equal(merged.suitability.constraint_verdicts.location_fit, "unknown");
  assert.equal(merged.suitability.constraint_verdicts.work_model_fit, "unclear");
  assert.equal(merged.suitability.constraint_verdicts.must_have_coverage, "partial");
  assert.equal(merged.suitability.evidence_quality, "medium");
});
