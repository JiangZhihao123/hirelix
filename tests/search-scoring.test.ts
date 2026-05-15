import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArbiterPrompt,
  buildJudgeScorePrompt,
  hasJudgeConflict,
  parseJudgeScoreResults,
} from "@/lib/search/scoring";
import type { JudgeScoreResult } from "@/lib/search/types";

function baseJudgeItem(index: number): JudgeScoreResult {
  return {
    index,
    capability_score: 80,
    relevance_score: 70,
    join_likelihood_score: 60,
    join_likelihood_reasons: ["Local and plausible"],
    constraint_verdicts: {
      location_fit: "local",
      work_model_fit: "yes",
      must_have_coverage: "partial",
    },
    blocking_constraints: [],
    blocking_severity: "none",
    advance_recommendation: "advance",
    shortlist_decision: "yes",
    shortlist_reason: "Strong enough for recruiter review.",
    short_reasons: ["Backend infrastructure"],
    risk_flags: [],
    evidence_quality: "medium",
    skills: ["distributed systems"],
    experience_years: 8,
    location: "San Francisco Bay Area",
    why_reachable_now: null,
  };
}

const parseOptions = {
  sanitizeCandidateSuitability: () => ({
    fit_decision: "viable_fit" as const,
    actionability: "ready_to_act" as const,
    bucket: "strong_now" as const,
    match_score: 80,
    quality_score: 75,
    overall_score: 80,
    advance_score: 80,
    advance_recommendation: "advance" as const,
    primary_risk: null,
    first_contact_confidence: "medium" as const,
    subscription_trigger_score: 80,
    shortlist_decision: "yes" as const,
    shortlist_reason: null,
    blocking_constraints: [],
    blocking_severity: "none" as const,
    scoring_breakdown: {
      capability_score: 80,
      relevance_score: 70,
      join_likelihood_score: 60,
      join_likelihood_reasons: [],
      quality_score: 75,
      overall_score: 80,
      advance_score: 80,
    },
    constraint_verdicts: {
      location_fit: "local" as const,
      work_model_fit: "yes" as const,
      must_have_coverage: "partial" as const,
    },
    constraint_risks: [],
    risk_flags: [],
    why_this_candidate: [],
    why_not_higher: [],
    evidence_quality: "medium" as const,
  }),
  normalizeScore: (value: unknown) => Number(value) || 0,
  stripSpeculativeRelocation: (texts: string[]) => texts,
  normalizeStringArray: (value: unknown) => Array.isArray(value) ? value.map(String) : [],
  normalizeBlockingConstraints: (value: unknown) => Array.isArray(value) ? value.map(String) : [],
  normalizeBlockingSeverity: (value: unknown) =>
    value === "hard" || value === "soft" || value === "none" ? value : "none",
  normalizeAdvanceRecommendation: (value: unknown) =>
    value === "advance" || value === "hold" || value === "reject" ? value : "hold",
  normalizeEnumValue: <T extends string>(value: unknown, allowed: readonly T[], fallback: T) =>
    allowed.includes(value as T) ? value as T : fallback,
  deriveShortlistDecision: () => "yes" as const,
  normalizeNullableString: (value: unknown) => value == null ? null : String(value),
  sanitizeConstraintVerdicts: () => ({
    location_fit: "local" as const,
    work_model_fit: "yes" as const,
    must_have_coverage: "partial" as const,
  }),
  normalizeExperienceYears: (value: unknown) => typeof value === "number" ? value : null,
};

test("judge prompt tells batch scoring to use global profile header indexes", () => {
  const prompt = buildJudgeScorePrompt(
    {},
    "Senior backend search engineer",
    "[70] Candidate A\n[71] Candidate B",
    2,
    "Judge A",
    {
      truncateForPrompt: (text) => text,
      buildPromptSearchContext: () => "Search context",
      expectedIndexes: [70, 71],
    },
  );

  assert.match(prompt, /Use the exact candidate index shown in each profile header/);
  assert.match(prompt, /never "index": 0/);
  assert.match(prompt, /Allowed index values for this batch: 70, 71/);
  assert.ok(
    prompt.indexOf("## Task") < prompt.indexOf("## Candidate Profiles"),
    "stable scoring instructions should precede dynamic candidate profiles for cache reuse",
  );
});

test("judge prompt treats eligible remote candidates as work-model fit", () => {
  const prompt = buildJudgeScorePrompt(
    {},
    "US remote senior backend role",
    "[4] Candidate A\nLocation: United States\nBackend engineer",
    1,
    "Judge A",
    {
      truncateForPrompt: (text) => text,
      buildPromptSearchContext: () => "Work Model: remote\nTarget Location: US",
      expectedIndexes: [4],
    },
  );

  assert.match(prompt, /For remote roles with an eligible country or region/);
  assert.match(prompt, /work_model_fit=yes when the profile location is eligible/);
  assert.match(prompt, /eligible country\/location plus no explicit conflict is not work-model uncertainty/);
});

test("judge prompt marks IC versus management profiles as mismatches", () => {
  const prompt = buildJudgeScorePrompt(
    {},
    "Senior backend IC role",
    "[8] Candidate A\nSenior Engineering Manager",
    1,
    "Judge A",
    {
      truncateForPrompt: (text) => text,
      buildPromptSearchContext: () => "Title: Senior Backend Engineer\nFunction: Backend IC",
      expectedIndexes: [8],
    },
  );

  assert.match(prompt, /For IC engineering roles/);
  assert.match(prompt, /people-management, program-management, director, or executive profiles/);
  assert.match(prompt, /Mark shortlist_decision=no/);
});

test("parseJudgeScoreResults maps batch-relative indexes to expected global indexes", () => {
  const parsed = parseJudgeScoreResults(
    [baseJudgeItem(0), baseJudgeItem(1)],
    100,
    [70, 71],
    parseOptions,
  );

  assert.deepEqual(parsed.map((item) => item.index), [70, 71]);
});

test("arbiter prompt pins the final assessment to the candidate global index", () => {
  const prompt = buildArbiterPrompt(
    {},
    "Senior backend search engineer",
    "[87] Candidate",
    baseJudgeItem(87),
    baseJudgeItem(87),
    {
      truncateForPrompt: (text) => text,
      buildPromptSearchContext: () => "Search context",
      buildCompanyProfileContext: () => "Company context",
    },
  );

  assert.match(prompt, /The assessment "index" must be 87/);
  assert.match(prompt, /"index": 87/);
});

test("hasJudgeConflict ignores ordinary score spread when action agrees", () => {
  const judgeA = baseJudgeItem(12);
  const judgeB = {
    ...baseJudgeItem(12),
    capability_score: 90,
    relevance_score: 82,
    join_likelihood_score: 45,
  };

  assert.equal(
    hasJudgeConflict(judgeA, judgeB, {
      computeQualityScore: (capability, relevance) => Math.round((capability + relevance) / 2),
      deriveFitDecisionFromScore: (score) => score >= 80 ? "strong_fit" : score >= 60 ? "viable_fit" : "reject",
    }),
    false,
  );
});

test("hasJudgeConflict lets low-leverage hold versus reject merge without Pro arbitration", () => {
  const judgeA = {
    ...baseJudgeItem(12),
    capability_score: 62,
    relevance_score: 50,
    join_likelihood_score: 40,
    advance_recommendation: "hold" as const,
    shortlist_decision: "no" as const,
  };
  const judgeB = {
    ...baseJudgeItem(12),
    capability_score: 55,
    relevance_score: 42,
    join_likelihood_score: 35,
    advance_recommendation: "reject" as const,
    shortlist_decision: "no" as const,
  };

  assert.equal(
    hasJudgeConflict(judgeA, judgeB, {
      computeQualityScore: (capability, relevance) => Math.round((capability + relevance) / 2),
      deriveFitDecisionFromScore: (score) => score >= 80 ? "strong_fit" : score >= 60 ? "viable_fit" : "reject",
    }),
    false,
  );
});

test("hasJudgeConflict lets terminal action conflict merge when there is no hard blocker", () => {
  const judgeA = baseJudgeItem(12);
  const judgeB = {
    ...baseJudgeItem(12),
    advance_recommendation: "reject" as const,
    shortlist_decision: "no" as const,
  };

  assert.equal(
    hasJudgeConflict(judgeA, judgeB, {
      computeQualityScore: (capability, relevance) => Math.round((capability + relevance) / 2),
      deriveFitDecisionFromScore: (score) => score >= 80 ? "strong_fit" : score >= 60 ? "viable_fit" : "reject",
    }),
    false,
  );
});

test("hasJudgeConflict catches high-quality hard blocker conflict", () => {
  const previous = process.env.SEARCH_SYNC_ARBITER_ENABLED;
  process.env.SEARCH_SYNC_ARBITER_ENABLED = "true";
  const judgeA = {
    ...baseJudgeItem(12),
    capability_score: 90,
    relevance_score: 84,
  };
  const judgeB = {
    ...baseJudgeItem(12),
    capability_score: 88,
    relevance_score: 82,
    blocking_severity: "hard" as const,
  };

  try {
    assert.equal(
      hasJudgeConflict(judgeA, judgeB, {
        computeQualityScore: (capability, relevance) => Math.round((capability + relevance) / 2),
        deriveFitDecisionFromScore: (score) => score >= 80 ? "strong_fit" : score >= 60 ? "viable_fit" : "reject",
      }),
      true,
    );
  } finally {
    if (previous == null) {
      delete process.env.SEARCH_SYNC_ARBITER_ENABLED;
    } else {
      process.env.SEARCH_SYNC_ARBITER_ENABLED = previous;
    }
  }
});
