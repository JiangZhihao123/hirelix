import assert from "node:assert/strict";
import test from "node:test";

import type { BrightDataFilterRule } from "@/lib/brightdata";
import { chunkBrightDataFilter } from "@/lib/brightdata";
import {
  buildBrightDataRecallFilters,
  sanitizeRecallSignalTerms,
} from "@/lib/search/recall";
import type { HiringBrief, RecallSpec } from "@/lib/search/types";
import { normalizeRecallSpec } from "@/lib/search-jobs";
import type { SearchExecutionProfile } from "@/lib/search-execution";

process.env.BRIGHTDATA_DATASET_ID = process.env.BRIGHTDATA_DATASET_ID || "test_dataset";

const executionProfile: SearchExecutionProfile = {
  name: "bright_test_full",
  mode: "test",
  filterLimit: 50,
  hiddenGemLimit: 25,
  companyTargetLimit: 25,
  finalResultCap: 20,
  highlightCount: 5,
  minVisibleQualityScore: 0,
  strongNowQualityScore: 72,
  lowCostMode: false,
  singleJudgeMode: false,
};

const recallSpec: RecallSpec = {
  countries: ["US"],
  title_variants: [
    "Senior Software Engineer",
    "Staff Search Engineer",
    "Staff Backend Engineer",
  ],
  core_skill_terms: [
    "Python",
    "Go",
    "Java",
    "Rust",
    "Kubernetes",
    "distributed systems",
    "search",
    "indexing",
    "data pipelines",
  ],
  differentiating_skill_terms: [
    "search infrastructure",
    "information retrieval",
    "ranking",
    "vector search",
  ],
  baseline_skill_terms: ["Python", "Kubernetes", "distributed systems"],
  domain_terms: ["AI", "search"],
  location_terms: ["san francisco", "new york city", "seattle"],
  strict_location_terms: ["san francisco", "new york city", "seattle"],
  nearby_location_terms: ["oakland", "bellevue", "brooklyn"],
  must_have_signals: ["search", "indexing", "us-based", "in sf nyc or seattle"],
  avoid_profiles: ["frontend", "mobile"],
  geo_strategy: "US search platform engineering hubs",
  recall_confidence: "high",
  role_breadth: "balanced",
  lateral_title_variants: [
    "Platform Engineer",
    "Infrastructure Engineer",
    "Data Engineer",
  ],
  target_companies: [
    "Google",
    "Meta",
    "Amazon",
    "Microsoft",
    "Elastic",
    "Algolia",
    "Databricks",
    "Snowflake",
  ],
  recall_strategy: "multi_round",
  record_limit: 50,
};

const hiringBrief: HiringBrief = {
  role_core: {
    title: "Senior Software Engineer",
    seniority: "Senior",
    function_focus: "Search platform engineering",
    required_skills: ["Kubernetes", "distributed systems", "search"],
    nice_to_have_skills: ["ranking", "vector search"],
  },
  work_model: "hybrid",
  location_scope: "San Francisco, New York City, or Seattle",
  location_flexibility: "moderate",
  relocation_allowed: "yes",
  must_have_constraints: ["US-based"],
  soft_constraints: ["SF, NYC, or Seattle preferred"],
  company_stage_expectation: "growth",
  screening_intent: null,
  candidate_count_strategy: "focused_shortlist",
  constraint_reasoning: null,
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

function maxGroupDepth(rule: BrightDataFilterRule): number {
  if (!("filters" in rule)) return 0;
  return 1 + rule.filters.reduce((max, child) => Math.max(max, maxGroupDepth(child)), 0);
}

test("sanitizeRecallSignalTerms removes non-searchable location and eligibility phrases", () => {
  assert.deepEqual(
    sanitizeRecallSignalTerms(["search", "us-based", "in sf nyc or seattle", "Kubernetes"]),
    ["search", "kubernetes"],
  );
});

test("normalizeRecallSpec splits composite city terms instead of preserving city mashups", () => {
  const normalized = normalizeRecallSpec({
    ...recallSpec,
    location_terms: ["san francisco new york city", "seattle"],
    strict_location_terms: ["san francisco new york city"],
  }, 20, { recordLimitOverride: 50 });

  assert.ok(normalized.location_terms.includes("san francisco"));
  assert.ok(normalized.location_terms.includes("new york city"));
  assert.ok(!normalized.location_terms.includes("san francisco new york city"));
  assert.ok(!normalized.strict_location_terms.includes("san francisco new york city"));
});

test("buildBrightDataRecallFilters builds balanced fixed-budget sourcing rounds", () => {
  const rounds = buildBrightDataRecallFilters(
    {
      title: "Senior Software Engineer",
      recall_spec: recallSpec,
      hiring_brief: hiringBrief,
    },
    20,
    executionProfile,
    {
      normalizeRecallSpec: (value) => value as RecallSpec,
      sanitizeHiringBrief: () => hiringBrief,
      buildStandardSkillFilter: () => null,
      buildRecallLocationFilter: () => ({
        operator: "or",
        filters: [
          { name: "location", operator: "includes", value: "san francisco" },
        ],
      }),
      isPlaceholderTitle: (title) => !title,
      hiddenGemLimit: 25,
      companyTargetLimit: 25,
    },
  );

  assert.deepEqual(rounds.map((round) => round.round), [
    "standard",
    "hidden_gem",
    "company_target",
  ]);
  assert.deepEqual(rounds.map((round) => round.request.recordsLimit), [50, 25, 25]);

  const standardValues = leafValues(rounds[0].request.filter);
  assert.ok(standardValues.includes("staff search engineer"));
  assert.ok(standardValues.includes("search infrastructure"));
  assert.ok(standardValues.includes("kubernetes"));
  assert.ok(!standardValues.includes("python"));
  assert.ok(!standardValues.includes("us-based"));
  assert.ok(!standardValues.includes("in sf nyc or seattle"));
  assert.ok(!flattenRules(rounds[0].request.filter).some((rule) => "name" in rule && rule.name === "location"));
  assert.equal(rounds[0].diagnostics.location_mode, "country_only");
  const rootFilter = rounds[0].request.filter;
  assert.ok("filters" in rootFilter);
  const standardSkillFilter = rootFilter.filters.find((rule) =>
    "filters" in rule &&
    rule.operator === "and" &&
    rule.filters.some((child) => leafValues(child).includes("search infrastructure")) &&
    rule.filters.some((child) => leafValues(child).includes("kubernetes")),
  );
  assert.ok(
    standardSkillFilter,
    "standard recall should require both a role/domain anchor and engineering depth evidence",
  );

  const hiddenValues = leafValues(rounds[1].request.filter);
  assert.ok(hiddenValues.includes("platform engineer"));
  assert.ok(hiddenValues.includes("ml infrastructure engineer"));
  assert.ok(hiddenValues.includes("production engineer"));
  assert.ok(!hiddenValues.includes("data engineer"));
  assert.ok(hiddenValues.includes("ranking"));

  const companyRules = flattenRules(rounds[2].request.filter);
  assert.ok(companyRules.some((rule) => "name" in rule && rule.name === "current_company_name"));
  assert.ok(companyRules.some((rule) => "name" in rule && rule.name === "position"));
  assert.ok(leafValues(rounds[2].request.filter).includes("elastic"));
  assert.ok(leafValues(rounds[2].request.filter).includes("search infrastructure"));
  assert.ok(leafValues(rounds[2].request.filter).includes("kubernetes"));
});

test("buildBrightDataRecallFilters skips optional sourcing rounds when limits are zero", () => {
  const rounds = buildBrightDataRecallFilters(
    {
      title: "Senior Software Engineer",
      recall_spec: recallSpec,
      hiring_brief: hiringBrief,
    },
    20,
    {
      ...executionProfile,
      hiddenGemLimit: 0,
      companyTargetLimit: 0,
    },
    {
      normalizeRecallSpec: (value) => value as RecallSpec,
      sanitizeHiringBrief: () => hiringBrief,
      buildStandardSkillFilter: () => null,
      buildRecallLocationFilter: () => null,
      isPlaceholderTitle: (title) => !title,
      hiddenGemLimit: 25,
      companyTargetLimit: 25,
    },
  );

  assert.deepEqual(rounds.map((round) => round.round), ["standard"]);
  assert.deepEqual(rounds.map((round) => round.request.recordsLimit), [50]);
});

test("buildBrightDataRecallFilters uses high-recall standard round for data platform LLM ranking", () => {
  const rounds = buildBrightDataRecallFilters(
    {
      title: "Staff Data Platform Engineer",
      recall_spec: {
        ...recallSpec,
        title_variants: ["Staff Data Platform Engineer", "Senior Data Platform Engineer"],
        core_skill_terms: ["Kafka", "Spark", "Kubernetes", "PostgreSQL", "Apache Druid"],
        differentiating_skill_terms: ["data platform", "data infrastructure", "streaming pipelines", "big data compute"],
        baseline_skill_terms: ["Kubernetes", "distributed systems"],
        domain_terms: ["data platform", "data systems"],
        must_have_signals: ["data platform", "Kafka", "Spark", "PostgreSQL"],
        lateral_title_variants: ["Data Engineer", "Infrastructure Engineer"],
        recall_strategy: "multi_round",
      },
      hiring_brief: {
        ...hiringBrief,
        role_core: {
          ...hiringBrief.role_core,
          title: "Staff Data Platform Engineer",
          function_focus: "Data platform engineering",
        },
      },
    },
    30,
    {
      ...executionProfile,
      companyTargetLimit: 25,
    },
    {
      normalizeRecallSpec: (value) => value as RecallSpec,
      sanitizeHiringBrief: (_value, parsed) => parsed.hiring_brief as HiringBrief,
      buildStandardSkillFilter: () => null,
      buildRecallLocationFilter: () => null,
      isPlaceholderTitle: (title) => !title,
      hiddenGemLimit: 25,
      companyTargetLimit: 0,
    },
  );

  assert.deepEqual(rounds.map((round) => round.round), [
    "standard",
    "standard_skill",
    "standard_seniority",
    "company_target",
  ]);
  assert.deepEqual(rounds.map((round) => round.request.recordsLimit), [50, 12, 13, 25]);
  const standardRound = rounds.find((round) => round.round === "standard");
  assert.ok(standardRound);
  assert.ok(standardRound.diagnostics.title_terms.includes("staff data platform engineer"));
  assert.ok(standardRound.diagnostics.title_terms.includes("senior data platform engineer"));
  assert.ok(standardRound.diagnostics.title_terms.includes("staff data infrastructure engineer"));
  assert.ok(standardRound.diagnostics.title_terms.includes("senior data infrastructure engineer"));
  assert.ok(standardRound.diagnostics.title_terms.includes("lead data platform engineer"));
  assert.ok(standardRound.diagnostics.title_terms.includes("staff streaming platform engineer"));
  assert.ok(standardRound.diagnostics.title_terms.includes("principal streaming platform engineer"));
  assert.ok(!standardRound.diagnostics.title_terms.includes("senior software engineer"));
  assert.ok(!standardRound.diagnostics.title_terms.includes("staff software engineer"));
  assert.ok(!standardRound.diagnostics.title_terms.includes("principal software engineer"));
  assert.ok(!standardRound.diagnostics.title_terms.includes("senior backend engineer"));
  assert.ok(!standardRound.diagnostics.title_terms.includes("senior platform engineer"));
  assert.ok(!standardRound.diagnostics.title_terms.includes("data platform engineer"));
  assert.ok(!standardRound.diagnostics.title_terms.includes("data infrastructure engineer"));
  assert.ok(!standardRound.diagnostics.title_terms.includes("streaming platform engineer"));
  assert.ok(!standardRound.diagnostics.title_terms.includes("big data compute engineer"));
  assert.ok(!standardRound.diagnostics.title_terms.includes("data systems engineer"));
  assert.ok(!standardRound.diagnostics.title_terms.includes("data engineer"));
  assert.ok(standardRound.diagnostics.title_terms.includes("senior data engineer"));
  assert.ok(standardRound.diagnostics.title_terms.includes("staff data engineer"));
  assert.ok(standardRound.diagnostics.title_terms.includes("principal data engineer"));
  assert.ok(standardRound.diagnostics.title_terms.includes("lead data engineer"));
  assert.ok(!leafValues(standardRound.request.filter).includes("big data compute"));
  assert.ok(!leafValues(standardRound.request.filter).includes("distributed systems"));
  assert.ok(maxGroupDepth(chunkBrightDataFilter(standardRound.request.filter)) <= 3);

  const skillRound = rounds.find((round) => round.round === "standard_skill");
  assert.ok(skillRound);
  assert.ok(skillRound.diagnostics.title_terms.includes("senior software engineer"));
  assert.ok(skillRound.diagnostics.title_terms.includes("staff platform engineer"));
  assert.ok(skillRound.diagnostics.title_terms.includes("principal data engineer"));
  assert.ok(leafValues(skillRound.request.filter).includes("kafka"));
  assert.ok(leafValues(skillRound.request.filter).includes("data platform"));
  assert.ok(maxGroupDepth(chunkBrightDataFilter(skillRound.request.filter)) <= 3);

  const seniorityRound = rounds.find((round) => round.round === "standard_seniority");
  assert.ok(seniorityRound);
  assert.ok(seniorityRound.diagnostics.title_terms.includes("staff software engineer"));
  assert.ok(seniorityRound.diagnostics.title_terms.includes("principal platform engineer"));
  assert.ok(seniorityRound.diagnostics.title_terms.includes("lead data engineer"));
  assert.ok(!seniorityRound.diagnostics.title_terms.includes("senior software engineer"));
  assert.ok(leafValues(seniorityRound.request.filter).includes("distributed systems"));
  assert.ok(leafValues(seniorityRound.request.filter).includes("streaming platform"));
  assert.ok(maxGroupDepth(chunkBrightDataFilter(seniorityRound.request.filter)) <= 3);

  const companyRound = rounds.find((round) => round.round === "company_target");
  assert.ok(companyRound);
  assert.ok(companyRound.diagnostics.title_terms.includes("staff data platform engineer"));
  assert.ok(companyRound.diagnostics.title_terms.includes("senior software engineer"));
  assert.ok(companyRound.diagnostics.title_terms.includes("staff software engineer"));
  assert.ok(companyRound.diagnostics.title_terms.includes("senior backend engineer"));
  assert.ok(!companyRound.diagnostics.title_terms.includes("data infrastructure engineer"));
  assert.ok(!companyRound.diagnostics.title_terms.includes("web platform engineer"));
  assert.ok(leafValues(companyRound.request.filter).includes("big data compute"));
  assert.ok(leafValues(companyRound.request.filter).includes("apache druid"));
  assert.ok(leafValues(companyRound.request.filter).includes("spark"));
  assert.ok(leafValues(companyRound.request.filter).includes("kafka"));
  assert.ok(leafValues(companyRound.request.filter).includes("confluent"));
  assert.ok(leafValues(companyRound.request.filter).includes("data lake"));
  assert.ok(maxGroupDepth(chunkBrightDataFilter(companyRound.request.filter)) <= 3);
});
