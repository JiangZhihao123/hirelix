import assert from "node:assert/strict";
import test from "node:test";

import type { BrightDataFilterRule } from "@/lib/brightdata";
import { chunkBrightDataFilter } from "@/lib/brightdata";
import {
  buildBrightDataRecallFilters,
  getRecallPersonas,
  sanitizeRecallSignalTerms,
  scaleRecallRoundsForValidation,
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
  deliveryReferenceCount: 50,
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
  sourcing_lanes: [],
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
  assert.deepEqual(getRecallPersonas(rounds).map((persona) => persona.kind), [
    "standard_ic",
    "adjacent_strong",
    "target_company",
  ]);
  assert.equal(rounds[0].diagnostics.persona?.label, "Standard matching IC engineers");
  assert.equal(rounds[1].diagnostics.persona?.round, "hidden_gem");
  assert.ok(rounds[2].diagnostics.persona?.company_terms.includes("elastic"));
  assert.deepEqual(rounds.map((round) => round.request.recordsLimit), [50, 25, 25]);

  const standardValues = leafValues(rounds[0].request.filter);
  assert.ok(standardValues.includes("staff search engineer"));
  assert.ok(standardValues.includes("search infrastructure"));
  assert.ok(standardValues.includes("kubernetes"));
  assert.ok(standardValues.includes("python"));
  assert.ok(standardValues.includes("golang"));
  assert.ok(!standardValues.includes("us-based"));
  assert.ok(!standardValues.includes("in sf nyc or seattle"));
  assert.ok(!flattenRules(rounds[0].request.filter).some((rule) => "name" in rule && rule.name === "location"));
  assert.equal(rounds[0].diagnostics.location_mode, "country_only");
  const rootFilter = rounds[0].request.filter;
  assert.ok("filters" in rootFilter);
  const standardSkillFilter = rootFilter.filters.find((rule) =>
    "filters" in rule &&
    rule.operator === "or" &&
    leafValues(rule).includes("search infrastructure") &&
    leafValues(rule).includes("kubernetes"),
  );
  assert.ok(
    standardSkillFilter,
    "standard recall should keep a broad skill signal OR so LLM scoring can judge quality after recall",
  );

  const hiddenValues = leafValues(rounds[1].request.filter);
  assert.ok(hiddenValues.includes("platform engineer"));
  assert.ok(hiddenValues.includes("ml infrastructure engineer"));
  assert.ok(hiddenValues.includes("production engineer"));
  assert.ok(!hiddenValues.includes("cloud engineer"));
  assert.ok(!hiddenValues.includes("data engineer"));
  assert.ok(hiddenValues.includes("search infrastructure"));
  assert.ok(maxGroupDepth(chunkBrightDataFilter(rounds[1].request.filter)) <= 3);

  const companyRules = flattenRules(rounds[2].request.filter);
  assert.ok(companyRules.some((rule) => "name" in rule && rule.name === "current_company_name"));
  assert.ok(companyRules.some((rule) => "name" in rule && rule.name === "position"));
  assert.ok(leafValues(rounds[2].request.filter).includes("elastic"));
  assert.ok(leafValues(rounds[2].request.filter).includes("search infrastructure"));
  assert.ok(leafValues(rounds[2].request.filter).includes("distributed systems"));
  assert.ok(
    flattenRules(rounds[2].request.filter).some((rule) =>
      "filters" in rule &&
      rule.operator === "or" &&
      rule.filters.some((child) => leafValues(child).includes("search infrastructure")) &&
      rule.filters.some((child) => leafValues(child).includes("distributed systems"))
    ),
    "company target recall should use title or skill evidence inside target companies, not triple-AND them",
  );
});

test("headhunter v2 distributes the full cold-start budget across four configured lanes", () => {
  const previousStrategy = process.env.SEARCH_RECALL_STRATEGY;
  process.env.SEARCH_RECALL_STRATEGY = "headhunter_v2";
  try {
    const lanes = [
      {
        name: "core title",
        strategy: "title" as const,
        lane_kind: "primary_exact" as const,
        target_persona: "Core ML engineers",
        non_negotiables: ["production ML systems"],
        relaxed_evidence: [],
        exclusion_patterns: [],
        initial_budget: 40,
        max_budget: 100,
        title_terms: ["Machine Learning Engineer"],
        skill_terms: ["production ML systems"],
        company_terms: [],
        avoid_terms: [],
        budget_weight: 4,
      },
      {
        name: "equivalent title",
        strategy: "skill" as const,
        lane_kind: "adjacent_authorized" as const,
        target_persona: "Applied AI engineers",
        non_negotiables: ["agentic AI"],
        relaxed_evidence: [],
        exclusion_patterns: [],
        initial_budget: 25,
        max_budget: 100,
        title_terms: ["Applied Scientist", "AI Engineer"],
        skill_terms: ["agentic AI", "multi-step reasoning"],
        company_terms: [],
        avoid_terms: [],
        budget_weight: 2.5,
      },
      {
        name: "strong employed operators",
        strategy: "title" as const,
        lane_kind: "primary_relaxed" as const,
        target_persona: "Senior ML platform engineers",
        non_negotiables: ["cloud ML infrastructure"],
        relaxed_evidence: [],
        exclusion_patterns: [],
        initial_budget: 20,
        max_budget: 100,
        title_terms: ["ML Platform Engineer", "AI Infrastructure Engineer"],
        skill_terms: ["cloud ML infrastructure"],
        company_terms: [],
        avoid_terms: [],
        budget_weight: 2,
      },
      {
        name: "target company lane",
        strategy: "company" as const,
        lane_kind: "target_company_engineering" as const,
        target_persona: "AI engineers at relevant companies",
        non_negotiables: ["production ML systems"],
        relaxed_evidence: [],
        exclusion_patterns: [],
        initial_budget: 15,
        max_budget: 100,
        title_terms: ["Machine Learning Engineer", "AI Engineer"],
        skill_terms: ["production ML systems"],
        company_terms: ["Zillow"],
        avoid_terms: [],
        budget_weight: 1.5,
      },
    ];
    const rounds = buildBrightDataRecallFilters(
      {
        title: "Machine Learning Engineer",
        recall_spec: { ...recallSpec, sourcing_lanes: lanes, recall_strategy: "multi_round" },
        hiring_brief: hiringBrief,
      },
      100,
      { ...executionProfile, filterLimit: 40, hiddenGemLimit: 35, companyTargetLimit: 25 },
      {
        normalizeRecallSpec: (value) => value as RecallSpec,
        sanitizeHiringBrief: () => hiringBrief,
        buildStandardSkillFilter: () => null,
        buildRecallLocationFilter: () => null,
        isPlaceholderTitle: (title) => !title,
        hiddenGemLimit: 35,
        companyTargetLimit: 25,
      },
    );

    assert.deepEqual(rounds.map((round) => round.round), ["standard", "lane_2", "lane_3", "lane_4"]);
    assert.equal(rounds.reduce((sum, round) => sum + round.request.recordsLimit, 0), 100);
    assert.ok(rounds.every((round) => round.request.recordsLimit > 0));
    assert.equal(rounds[0].diagnostics.persona?.label, "Core ML engineers");
  } finally {
    if (previousStrategy == null) delete process.env.SEARCH_RECALL_STRATEGY;
    else process.env.SEARCH_RECALL_STRATEGY = previousStrategy;
  }
});

test("buildBrightDataRecallFilters uses exact company matching for short target names", () => {
  const rounds = buildBrightDataRecallFilters(
    {
      title: "Senior Backend Engineer",
      recall_spec: {
        ...recallSpec,
        target_companies: ["Trov", "Hippo", "Stripe", "Lemonade"],
      },
      hiring_brief: hiringBrief,
    },
    20,
    executionProfile,
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

  const companyRound = rounds.find((round) => round.round === "company_target");
  assert.ok(companyRound);
  const companyRules = flattenRules(companyRound.request.filter)
    .filter((rule): rule is Extract<BrightDataFilterRule, { name: string }> =>
      "name" in rule && rule.name === "current_company_name",
    );
  const operatorsByValue = new Map(companyRules.map((rule) => [String(rule.value).toLowerCase(), rule.operator]));
  assert.equal(operatorsByValue.get("trov"), "=");
  assert.equal(operatorsByValue.get("hippo"), "=");
  assert.equal(operatorsByValue.get("stripe"), "includes");
  assert.equal(operatorsByValue.get("lemonade"), "includes");
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

test("buildBrightDataRecallFilters adds LLM lanes without replacing deterministic rounds", () => {
  const rounds = buildBrightDataRecallFilters(
    {
      title: "Staff Data Platform Engineer",
      recall_spec: {
        ...recallSpec,
        title_variants: ["Staff Data Platform Engineer"],
        core_skill_terms: ["Kafka", "Spark", "Flink", "Kubernetes"],
        differentiating_skill_terms: ["streaming platform", "data infrastructure"],
        domain_terms: ["data platform"],
        must_have_signals: ["Kafka", "Flink", "streaming platform"],
        sourcing_lanes: [
          {
            name: "direct data platform titles",
            strategy: "title",
            title_terms: ["Staff Data Platform Engineer", "Principal Data Platform Engineer"],
            skill_terms: ["Kafka", "Spark", "Flink"],
            company_terms: [],
            avoid_terms: ["BI"],
            budget_weight: 4,
          },
          {
            name: "broad infra people with streaming evidence",
            strategy: "skill",
            title_terms: ["Staff Software Engineer", "Principal Platform Engineer"],
            skill_terms: ["Kafka", "Flink", "streaming platform"],
            company_terms: [],
            avoid_terms: [],
            budget_weight: 4,
          },
          {
            name: "target company data infra",
            strategy: "company",
            title_terms: ["Staff Software Engineer", "Senior Data Engineer"],
            skill_terms: ["data infrastructure"],
            company_terms: ["Confluent", "Databricks"],
            avoid_terms: [],
            budget_weight: 4,
          },
        ],
        recall_strategy: "multi_round",
      },
      hiring_brief: hiringBrief,
    },
    30,
    {
      ...executionProfile,
      filterLimit: 60,
      hiddenGemLimit: 20,
      companyTargetLimit: 20,
    },
    {
      normalizeRecallSpec,
      sanitizeHiringBrief: () => hiringBrief,
      buildStandardSkillFilter: () => null,
      buildRecallLocationFilter: () => null,
      isPlaceholderTitle: (title) => !title,
      hiddenGemLimit: 20,
      companyTargetLimit: 20,
    },
  );

  assert.deepEqual(rounds.map((round) => round.round), [
    "standard",
    "standard_skill",
    "standard_seniority",
    "company_target",
    "llm_title_1",
    "llm_skill_2",
    "llm_company_3",
  ]);
  assert.equal(rounds.reduce((sum, round) => sum + round.request.recordsLimit, 0), 100);
  assert.equal(rounds.find((round) => round.round === "standard")?.request.recordsLimit, 60);
  assert.equal(
    rounds
      .filter((round) => ["standard_skill", "standard_seniority", "llm_title_1", "llm_skill_2"].includes(round.round))
      .reduce((sum, round) => sum + round.request.recordsLimit, 0),
    20,
  );
  assert.equal(
    rounds
      .filter((round) => ["company_target", "llm_company_3"].includes(round.round))
      .reduce((sum, round) => sum + round.request.recordsLimit, 0),
    20,
  );

  const standardRound = rounds.find((round) => round.round === "standard");
  assert.ok(standardRound);
  assert.ok(leafValues(standardRound.request.filter).includes("principal data platform engineer"));
  assert.ok(!leafValues(standardRound.request.filter).includes("flink"));

  const llmTitleRound = rounds.find((round) => round.round === "llm_title_1");
  assert.ok(llmTitleRound);
  assert.ok(leafValues(llmTitleRound.request.filter).includes("principal data platform engineer"));
  assert.ok(leafValues(llmTitleRound.request.filter).includes("kafka"));
  assert.ok(leafValues(llmTitleRound.request.filter).includes("flink"));

  const companyRound = rounds.find((round) => round.round === "company_target");
  assert.ok(companyRound);
  assert.ok(leafValues(companyRound.request.filter).includes("confluent"));

  const llmSkillRound = rounds.find((round) => round.round === "llm_skill_2");
  assert.ok(llmSkillRound);
  assert.ok(!llmSkillRound.diagnostics.title_terms.includes("senior backend engineer"));
});

test("buildBrightDataRecallFilters prunes low-budget LLM micro-lanes and preserves deterministic budget pools", () => {
  const rounds = buildBrightDataRecallFilters(
    {
      title: "Staff Data Platform Engineer",
      recall_spec: {
        ...recallSpec,
        target_companies: ["Confluent", "Databricks", "Snowflake", "Airbnb", "Uber"],
        sourcing_lanes: [
          {
            name: "target company data infra",
            strategy: "company",
            title_terms: ["Staff", "Principal", "Lead", "Principal Data Platform Engineer"],
            skill_terms: ["Kafka", "data infrastructure"],
            company_terms: ["Confluent", "Databricks"],
            avoid_terms: [],
            budget_weight: 1,
          },
        ],
        recall_strategy: "multi_round",
      },
      hiring_brief: hiringBrief,
    },
    30,
    {
      ...executionProfile,
      filterLimit: 50,
      hiddenGemLimit: 0,
      companyTargetLimit: 50,
    },
    {
      normalizeRecallSpec,
      sanitizeHiringBrief: () => hiringBrief,
      buildStandardSkillFilter: () => null,
      buildRecallLocationFilter: () => null,
      isPlaceholderTitle: (title) => !title,
      hiddenGemLimit: 0,
      companyTargetLimit: 50,
    },
  );

  assert.deepEqual(rounds.map((round) => round.round), [
    "standard",
    "company_target",
  ]);
  assert.equal(rounds.reduce((sum, round) => sum + round.request.recordsLimit, 0), 100);
  assert.equal(rounds.find((round) => round.round === "standard")?.request.recordsLimit, 50);
  assert.equal(rounds.find((round) => round.round === "company_target")?.request.recordsLimit, 50);
  assert.ok(!rounds.some((round) => round.round.startsWith("llm_")));

  const companyRound = rounds.find((round) => round.round === "company_target");
  assert.ok(companyRound);
  const values = leafValues(companyRound.request.filter);
  assert.ok(values.includes("confluent"));
});

test("buildBrightDataRecallFilters keeps backend expansion rounds high-intent and prunes one-record LLM lanes", () => {
  const openlyRecallSpec: RecallSpec = {
    countries: ["US"],
    title_variants: [
      "Senior Backend Engineer",
      "Staff Backend Engineer",
      "Principal Backend Engineer",
      "Senior Software Engineer",
      "Staff Software Engineer",
      "Lead Backend Engineer",
    ],
    core_skill_terms: [
      "Go",
      "PostgreSQL",
      "Kubernetes",
      "Google Cloud",
      "distributed systems",
      "microservices",
      "API",
      "gRPC",
      "Pub/Sub",
      "Terraform",
    ],
    differentiating_skill_terms: ["Go", "Kubernetes", "Cloud Run", "Pub/Sub", "BigQuery"],
    baseline_skill_terms: ["PostgreSQL", "REST", "SQL", "Git", "CI/CD"],
    domain_terms: ["insurance", "fintech", "payments"],
    location_terms: [],
    strict_location_terms: [],
    nearby_location_terms: [],
    must_have_signals: [
      "go",
      "postgresql",
      "kubernetes",
      "production backend",
      "distributed systems",
      "cloud infrastructure",
    ],
    avoid_profiles: ["frontend", "mobile", "data analyst", "QA", "ML research", "Python only"],
    geo_strategy: "Focus on US-based candidates; remote-friendly; no location restrictions beyond country.",
    recall_confidence: "high",
    role_breadth: "balanced",
    lateral_title_variants: [
      "Platform Engineer",
      "Infrastructure Engineer",
      "Site Reliability Engineer",
      "Cloud Engineer",
      "Distributed Systems Engineer",
    ],
    target_companies: [
      "Lemonade",
      "Hippo",
      "Root Insurance",
      "Metromile",
      "Policygenius",
      "Next Insurance",
      "Kin Insurance",
      "Clearcover",
      "Trov",
      "Zego",
      "Stripe",
      "Plaid",
      "Adyen",
      "Checkout.com",
      "Confluent",
    ],
    sourcing_lanes: [
      {
        name: "Primary Title",
        strategy: "title",
        title_terms: [
          "Senior Backend Engineer",
          "Staff Backend Engineer",
          "Principal Backend Engineer",
          "Senior Software Engineer",
          "Staff Software Engineer",
          "Lead Backend Engineer",
        ],
        skill_terms: ["go", "postgresql", "kubernetes"],
        company_terms: [],
        avoid_terms: ["frontend", "mobile", "data analyst", "QA", "ML"],
        budget_weight: 1,
      },
      {
        name: "Lateral Pools",
        strategy: "title",
        title_terms: [
          "Platform Engineer",
          "Infrastructure Engineer",
          "Site Reliability Engineer",
          "Cloud Engineer",
          "Distributed Systems Engineer",
        ],
        skill_terms: ["go", "postgresql", "kubernetes"],
        company_terms: [],
        avoid_terms: ["frontend", "mobile", "data analyst", "QA", "ML"],
        budget_weight: 1,
      },
      {
        name: "Target Companies",
        strategy: "company",
        title_terms: ["Backend Engineer", "Software Engineer", "Platform Engineer", "Infrastructure Engineer"],
        skill_terms: ["go", "postgresql", "kubernetes"],
        company_terms: [
          "Lemonade",
          "Hippo",
          "Root Insurance",
          "Metromile",
          "Policygenius",
          "Next Insurance",
          "Kin Insurance",
          "Clearcover",
          "Trov",
          "Zego",
          "Stripe",
          "Plaid",
          "Adyen",
          "Checkout.com",
          "Confluent",
        ],
        avoid_terms: ["frontend", "mobile", "data analyst", "QA", "ML"],
        budget_weight: 1,
      },
    ],
    recall_strategy: "multi_round",
    record_limit: 150,
  };
  const remoteBrief: HiringBrief = {
    ...hiringBrief,
    role_core: {
      title: "Senior Backend Engineer",
      seniority: "Senior",
      function_focus: "Backend platform systems",
      required_skills: ["Go", "PostgreSQL", "Kubernetes"],
      nice_to_have_skills: ["GCP", "Terraform"],
    },
    work_model: "remote",
    location_scope: "United States",
    location_flexibility: "flexible",
    relocation_allowed: "unknown",
    must_have_constraints: ["US-based"],
    soft_constraints: [],
    company_stage_expectation: "growth",
  };

  const rounds = buildBrightDataRecallFilters(
    {
      title: "Senior Backend Engineer",
      recall_spec: openlyRecallSpec,
      hiring_brief: remoteBrief,
    },
    25,
    {
      ...executionProfile,
      filterLimit: 150,
      hiddenGemLimit: 50,
      companyTargetLimit: 50,
    },
    {
      normalizeRecallSpec: (value) => value as RecallSpec,
      sanitizeHiringBrief: () => remoteBrief,
      buildStandardSkillFilter: () => null,
      buildRecallLocationFilter: () => null,
      isPlaceholderTitle: (title) => !title,
      hiddenGemLimit: 50,
      companyTargetLimit: 50,
    },
  );

  assert.deepEqual(rounds.map((round) => round.round), [
    "standard",
    "hidden_gem",
    "company_target",
  ]);
  assert.equal(rounds.reduce((sum, round) => sum + round.request.recordsLimit, 0), 250);
  assert.ok(!rounds.some((round) => round.round.startsWith("llm_")));

  const hiddenRound = rounds.find((round) => round.round === "hidden_gem");
  assert.ok(hiddenRound);
  assert.ok(!leafValues(hiddenRound.request.filter).includes("cloud engineer"));
  assert.ok(
    flattenRules(hiddenRound.request.filter).some((rule) =>
      "filters" in rule &&
      rule.operator === "or" &&
      leafValues(rule).includes("golang") &&
      leafValues(rule).includes("postgresql")
    ),
    "hidden gem recall should keep broad backend skill evidence without requiring every skill together",
  );
  assert.ok(
    flattenRules(hiddenRound.request.filter).some((rule) =>
      "name" in rule &&
      rule.name === "position" &&
      leafValues(rule).some((value) => value.includes("platform engineer"))
    ),
    "hidden gem recall should keep current-position title evidence while allowing profile-wide skill evidence",
  );
  assert.ok(
    flattenRules(hiddenRound.request.filter).some((rule) =>
      "filters" in rule &&
      rule.operator === "or" &&
      rule.filters.some((child) => "name" in child && child.name === "about") &&
      rule.filters.some((child) => "name" in child && child.name === "position")
    ),
    "hidden gem skill evidence should not be constrained to current-position text only",
  );

  const companyRound = rounds.find((round) => round.round === "company_target");
  assert.ok(companyRound);
  assert.ok(leafValues(companyRound.request.filter).includes("zego"));
  assert.ok(maxGroupDepth(chunkBrightDataFilter(companyRound.request.filter)) <= 3);
  assert.ok(leafValues(companyRound.request.filter).includes("golang"));
  assert.ok(leafValues(companyRound.request.filter).includes("postgresql"));
  assert.ok(!leafValues(companyRound.request.filter).includes("go"));
  assert.ok(!leafValues(companyRound.request.filter).includes("4 years backend experience"));
});

test("buildBrightDataRecallFilters does not add location filter for moderate remote-friendly recall", () => {
  const remoteBrief: HiringBrief = {
    ...hiringBrief,
    work_model: "remote",
    location_flexibility: "moderate",
    relocation_allowed: "unknown",
  };
  const rounds = buildBrightDataRecallFilters(
    {
      title: "Senior Software Engineer",
      recall_spec: recallSpec,
      hiring_brief: remoteBrief,
    },
    20,
    executionProfile,
    {
      normalizeRecallSpec: (value) => value as RecallSpec,
      sanitizeHiringBrief: () => remoteBrief,
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

  assert.ok(rounds.length > 0);
  assert.ok(rounds.every((round) => round.diagnostics.location_mode === "country_only"));
  assert.ok(rounds.every((round) =>
    !flattenRules(round.request.filter).some((rule) => "name" in rule && rule.name === "location")
  ));
});

test("scaleRecallRoundsForValidation caps per-round and total request limits", () => {
  const rounds = buildBrightDataRecallFilters(
    {
      title: "Senior Software Engineer",
      recall_spec: recallSpec,
      hiring_brief: hiringBrief,
    },
    20,
    {
      ...executionProfile,
      filterLimit: 150,
      hiddenGemLimit: 50,
      companyTargetLimit: 50,
    },
    {
      normalizeRecallSpec: (value) => value as RecallSpec,
      sanitizeHiringBrief: () => hiringBrief,
      buildStandardSkillFilter: () => null,
      buildRecallLocationFilter: () => null,
      isPlaceholderTitle: (title) => !title,
      hiddenGemLimit: 50,
      companyTargetLimit: 50,
    },
  );

  const scaled = scaleRecallRoundsForValidation(rounds, {
    perRoundLimit: 5,
    totalLimit: 12,
  });

  assert.equal(scaled[0]?.round, "standard");
  assert.ok(scaled.length >= 1);
  assert.ok(scaled.every((round) => round.request.recordsLimit <= 5));
  assert.equal(
    scaled.reduce((sum, round) => sum + round.request.recordsLimit, 0),
    12,
  );
  assert.ok(scaled.every((round) => round.diagnostics.requested_count === round.request.recordsLimit));
  assert.deepEqual(
    scaled.map((round) => round.round),
    rounds.slice(0, scaled.length).map((round) => round.round),
  );
});
