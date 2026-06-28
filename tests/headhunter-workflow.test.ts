import assert from "node:assert/strict";
import test from "node:test";

import {
  computeFilterHash,
  type BrightDataFilterRule,
  type BrightDataDatasetFilterRequest,
} from "@/lib/brightdata";
import {
  JD_SEARCH_INTENT_JSON_SCHEMA,
  LANE_AUDITOR_JSON_SCHEMA,
} from "@/lib/llm-schemas";
import {
  HEADHUNTER_LANE_AUDITOR_PROMPT,
  JD_SEARCH_INTENT_PROMPT,
} from "@/lib/prompts";
import { buildJudgeScorePrompt } from "@/lib/search/scoring";
import {
  buildBrightDataRecallFilterForLane,
  buildBrightDataRecallFilters,
} from "@/lib/search/recall";
import {
  buildRecallLocationFilter,
  buildStandardSkillFilter,
  isPlaceholderTitle,
  normalizeRecallMetadata,
  normalizeRecallSpec,
  sanitizeHiringBrief,
} from "@/lib/search-jobs";
import {
  buildLaneAuditUserPrompt,
  normalizeLaneAuditResult,
} from "@/lib/search/lane-auditor";
import type { SearchExecutionProfile } from "@/lib/search-execution";

process.env.BRIGHTDATA_DATASET_ID = process.env.BRIGHTDATA_DATASET_ID || "test_dataset";

const freeExecutionProfile: SearchExecutionProfile = {
  name: "bright_free_preview",
  mode: "production",
  filterLimit: 150,
  hiddenGemLimit: 50,
  companyTargetLimit: 50,
  deliveryReferenceCount: 250,
  highlightCount: 3,
  minVisibleQualityScore: 0,
  strongNowQualityScore: 72,
  lowCostMode: false,
  singleJudgeMode: false,
};

function flattenRules(rule: BrightDataFilterRule): BrightDataFilterRule[] {
  if ("filters" in rule) {
    return [rule, ...rule.filters.flatMap(flattenRules)];
  }
  return [rule];
}

function leafValues(rule: BrightDataFilterRule) {
  return flattenRules(rule)
    .filter((item): item is Extract<BrightDataFilterRule, { name: string }> => "name" in item)
    .map((item) => String(item.value).toLowerCase());
}

function groupLeafValues(rule: BrightDataFilterRule) {
  return "filters" in rule
    ? rule.filters.map((child) => leafValues(child))
    : [];
}

function assertRootAndContainsSeparateTitleAndEvidence(
  request: BrightDataDatasetFilterRequest,
  expectedTitle: string,
  expectedEvidence: string,
) {
  const root = request.filter;
  assert.ok("filters" in root);
  assert.equal(root.operator, "and");
  const childValues = groupLeafValues(root);
  assert.ok(
    childValues.some((values) => values.includes(expectedTitle)),
    `expected root AND child to contain title ${expectedTitle}`,
  );
  assert.ok(
    childValues.some((values) => values.includes(expectedEvidence)),
    `expected root AND child to contain evidence ${expectedEvidence}`,
  );
}

const parsed = {
  title: "Senior Backend Engineer",
  hiring_brief: {
    role_core: {
      title: "Senior Backend Engineer",
      seniority: "Senior",
      function_focus: "Backend platform ownership for payments APIs",
      required_skills: ["Go", "PostgreSQL", "distributed systems"],
      nice_to_have_skills: ["Kafka"],
    },
    work_model: "remote",
    location_scope: "US",
    location_flexibility: "flexible",
    relocation_allowed: "unknown",
    must_have_constraints: [],
    soft_constraints: [],
    company_stage_expectation: "growth",
    constraint_reasoning: "US remote candidates are eligible.",
  },
  headhunter_brief: {
    role_mission: "Find backend engineers who own reliable payments APIs.",
    ideal_candidate_backgrounds: ["Backend platform engineers at API-heavy fintech companies"],
    allowed_adjacent_profiles: ["Infrastructure engineers with product API ownership"],
    misleading_profile_patterns: ["Manager-only profiles", "Data/DevOps-only profiles"],
    equivalent_evidence: ["Ledger, billing, or transaction systems can substitute for payments wording"],
    verification_risks: ["Confirm hands-on backend ownership"],
  },
  recall_spec: {
    countries: ["US"],
    title_variants: ["Senior Backend Engineer", "Staff Backend Engineer", "Senior Software Engineer"],
    core_skill_terms: ["Go", "PostgreSQL", "distributed systems", "API", "payments"],
    differentiating_skill_terms: ["payments", "ledger", "billing"],
    baseline_skill_terms: ["Go", "PostgreSQL", "API"],
    domain_terms: ["fintech"],
    location_terms: [],
    strict_location_terms: [],
    nearby_location_terms: [],
    must_have_signals: ["payments APIs", "distributed systems"],
    avoid_profiles: ["manager only", "frontend only"],
    geo_strategy: "US remote",
    recall_confidence: "high",
    role_breadth: "balanced",
    lateral_title_variants: ["Platform Engineer", "Infrastructure Engineer"],
    target_companies: ["Stripe", "Block", "Adyen"],
    sourcing_lanes: [
      {
        name: "direct backend payments",
        strategy: "title",
        lane_kind: "primary_exact",
        target_persona: "Backend engineers with payments API ownership",
        non_negotiables: ["backend engineering", "payments or equivalent transaction systems"],
        relaxed_evidence: ["ledger or billing systems"],
        exclusion_patterns: ["manager only"],
        initial_budget: 35,
        max_budget: 150,
        title_terms: ["Senior Backend Engineer", "Staff Backend Engineer"],
        skill_terms: ["payments", "distributed systems"],
        company_terms: [],
        avoid_terms: ["manager only"],
        budget_weight: 1,
      },
      {
        name: "same family backend",
        strategy: "skill",
        lane_kind: "primary_relaxed",
        target_persona: "Backend engineers with equivalent transaction systems",
        non_negotiables: ["backend engineering"],
        relaxed_evidence: ["ledger or billing systems"],
        exclusion_patterns: ["frontend only"],
        initial_budget: 15,
        max_budget: 80,
        title_terms: ["Senior Software Engineer"],
        skill_terms: ["ledger", "billing", "API"],
        company_terms: [],
        avoid_terms: ["frontend only"],
        budget_weight: 1,
      },
    ],
    recall_strategy: "multi_round",
  },
};

test("JD parse schema and prompt require headhunter brief and lane contracts", () => {
  assert.ok(JD_SEARCH_INTENT_JSON_SCHEMA.schema);
  const required = JD_SEARCH_INTENT_JSON_SCHEMA.schema.required as string[];
  assert.ok(required.includes("headhunter_brief"));
  assert.ok(required.includes("sourcing_plan"));
  assert.match(JD_SEARCH_INTENT_PROMPT, /Headhunter brief/);
  assert.match(JD_SEARCH_INTENT_PROMPT, /primary_exact/);
  assert.match(JD_SEARCH_INTENT_PROMPT, /target_company_engineering/);
});

test("headhunter recall strategy compiles free search into a 35 plus 15 probe", () => {
  const previous = process.env.SEARCH_RECALL_STRATEGY;
  process.env.SEARCH_RECALL_STRATEGY = "headhunter_v1";
  try {
    const rounds = buildBrightDataRecallFilters(parsed, 5, freeExecutionProfile, {
      normalizeRecallSpec,
      sanitizeHiringBrief,
      buildStandardSkillFilter,
      buildRecallLocationFilter,
      isPlaceholderTitle,
      hiddenGemLimit: 50,
      companyTargetLimit: 50,
    });

    assert.deepEqual(rounds.map((round) => round.round), ["standard", "primary_relaxed"]);
    assert.deepEqual(rounds.map((round) => round.request.recordsLimit), [35, 15]);
    assert.equal(rounds.reduce((sum, round) => sum + round.request.recordsLimit, 0), 50);
    assert.ok(!rounds.some((round) => round.round === "hidden_gem" || round.round === "company_target"));
    assert.equal(rounds[0]?.diagnostics.persona?.label, "Primary exact headhunter lane");
    assert.notEqual(
      computeFilterHash(rounds[0].request),
      computeFilterHash(rounds[1].request),
      "primary_exact and primary_relaxed must not compile to the same Bright filter",
    );

    const standardValues = leafValues(rounds[0].request.filter);
    assertRootAndContainsSeparateTitleAndEvidence(rounds[0].request, "senior backend engineer", "payments");
    assert.ok(standardValues.includes("staff backend engineer"));
    assert.ok(!standardValues.includes("backend engineers with payments api ownership"));
    assert.ok(!standardValues.includes("senior platform engineer"));
    assert.ok(!standardValues.includes("staff platform engineer"));
    assert.ok(!standardValues.includes("data pipeline"));
    assert.ok(!standardValues.includes("pipeline"));

    const relaxedValues = leafValues(rounds[1].request.filter);
    assertRootAndContainsSeparateTitleAndEvidence(rounds[1].request, "senior software engineer", "ledger");
    assert.ok(!relaxedValues.includes("senior backend engineer"));
    assert.ok(relaxedValues.includes("backend engineering"));
    assert.ok(relaxedValues.includes("api"));
    assert.ok(!relaxedValues.includes("backend engineers with equivalent transaction systems"));
    assert.ok(!relaxedValues.includes("senior platform engineer"));
  } finally {
    if (previous == null) {
      delete process.env.SEARCH_RECALL_STRATEGY;
    } else {
      process.env.SEARCH_RECALL_STRATEGY = previous;
    }
  }
});

test("adaptive headhunter lane compiler keeps non-company revisions title AND evidence gated", () => {
  const revisedLane = {
    name: "revised payments backend",
    strategy: "title" as const,
    lane_kind: "primary_exact" as const,
    target_persona: "Senior backend engineers with explicit payments API ownership",
    non_negotiables: ["backend engineering", "payments", "PostgreSQL"],
    relaxed_evidence: ["ledger", "billing"],
    exclusion_patterns: ["data platform"],
    initial_budget: 25,
    max_budget: 80,
    title_terms: ["Senior Backend Engineer", "Staff Backend Engineer"],
    skill_terms: ["payments", "PostgreSQL", "API"],
    company_terms: [],
    avoid_terms: ["data platform"],
    budget_weight: 1,
  };

  const request = buildBrightDataRecallFilterForLane(parsed, revisedLane, 25, {
    normalizeRecallSpec,
    sanitizeHiringBrief,
    buildStandardSkillFilter,
    buildRecallLocationFilter,
    isPlaceholderTitle,
  });
  assert.ok(request);
  assert.equal(request.recordsLimit, 25);
  assertRootAndContainsSeparateTitleAndEvidence(request, "senior backend engineer", "payments");
  const root = request.filter;
  assert.ok("filters" in root);
  assert.equal(root.operator, "and");
  assert.ok(
    !flattenRules(root).some((rule) =>
      "filters" in rule &&
      rule.operator === "or" &&
      leafValues(rule).includes("senior backend engineer") &&
      leafValues(rule).includes("payments")
    ),
    "adaptive revision must not compile title OR evidence as one loose branch",
  );
});

test("lane auditor schema and normalizer keep decisions inside allowed enums", () => {
  assert.match(HEADHUNTER_LANE_AUDITOR_PROMPT, /Do not use keyword hit-counts as candidate-quality rules/);
  assert.ok(LANE_AUDITOR_JSON_SCHEMA.schema);
  const decisionEnum = (LANE_AUDITOR_JSON_SCHEMA.schema.properties as Record<string, { enum?: string[] }>).decision.enum;
  assert.deepEqual(decisionEnum, ["expand", "revise", "stop", "escalate_adjacent"]);

  const result = normalizeLaneAuditResult({
    decision: "spend_everything",
    quality_grade: "Z",
    why_this_lane_is_working: "Some backend profiles are relevant.",
    wrong_profile_patterns: ["manager only"],
    next_lane_revision: {
      lane_kind: "exploration",
      initial_budget: 500,
      max_budget: 500,
    },
  });
  assert.equal(result.decision, "revise");
  assert.equal(result.quality_grade, "C");
  assert.equal(result.next_lane_revision.lane_kind, "exploration");
});

test("recall metadata normalizer preserves lane audit details", () => {
  const metadata = normalizeRecallMetadata({
    provider: "brightdata_dataset",
    snapshot_id: "snap_123",
    recall_strategy_mode: "headhunter_v1",
    recall_iterations: [
      {
        iteration: 1,
        lane: "standard",
        lane_kind: "primary_exact",
        budget: 35,
        snapshot_id: "snap_123",
        filter_hash: "filter_123",
        audit: {
          decision: "stop",
          quality_grade: "D",
          summary: "Wrong lane.",
          why_this_lane_is_working: "",
          why_this_lane_is_wrong: "Returned manager-only profiles.",
          wrong_profile_patterns: ["manager only"],
          next_lane_revision: {
            name: "hands-on backend lane",
            lane_kind: "primary_exact",
            target_persona: "Hands-on backend engineers",
            non_negotiables: ["backend engineering"],
            relaxed_evidence: ["billing systems"],
            exclusion_patterns: ["manager only"],
            initial_budget: 25,
            max_budget: 80,
          },
          audited_at: "2026-06-27T08:00:00.000Z",
          sample_count: 12,
        },
        continue_expansion: false,
      },
    ],
  });

  const audit = metadata?.recall_iterations?.[0]?.audit;
  assert.equal(audit?.decision, "stop");
  assert.equal(audit?.quality_grade, "D");
  assert.deepEqual(audit?.wrong_profile_patterns, ["manager only"]);
  assert.equal(audit?.next_lane_revision?.target_persona, "Hands-on backend engineers");
  assert.equal(audit?.sample_count, 12);
  assert.equal(metadata?.recall_iterations?.[0]?.filter_hash, "filter_123");
});

test("lane audit prompt includes JD, brief, lane contract, sample, and judge summary", () => {
  const prompt = buildLaneAuditUserPrompt({
    jdText: "We need a Senior Backend Engineer for payments APIs.",
    headhunterBrief: parsed.headhunter_brief,
    lane: normalizeRecallSpec(parsed.recall_spec, 5).sourcing_lanes[0],
    profileSample: "[0] Senior Backend Engineer at Stripe",
    judgeSummary: "1 strong, 2 weak, manager-only pattern observed",
  });
  assert.match(prompt, /Original JD/);
  assert.match(prompt, /Headhunter Brief/);
  assert.match(prompt, /Lane Contract/);
  assert.match(prompt, /Profile Sample/);
  assert.match(prompt, /Judge Result Summary/);
});

test("judge prompt uses headhunter brief and human-equivalence rules", () => {
  const prompt = buildJudgeScorePrompt(
    parsed,
    "We need a Senior Backend Engineer for payments APIs.",
    "[0] Jane Doe\nSenior Backend Engineer at Stripe\nBuilt billing and ledger APIs.",
    1,
    "Judge A",
    {
      truncateForPrompt: (text) => text,
      buildPromptSearchContext: () => "Search context",
      expectedIndexes: [0],
    },
  );

  assert.match(prompt, /## Headhunter Brief/);
  assert.match(prompt, /Equivalent Evidence: Ledger, billing, or transaction systems/);
  assert.match(prompt, /Judge like a human technical headhunter/);
  assert.match(prompt, /Do not reject solely because one literal keyword is absent/);
  assert.match(prompt, /Structured fields are diagnostic context, not keyword gates/);
});
