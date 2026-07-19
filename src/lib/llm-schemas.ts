import type { LlmJsonSchemaConfig } from "@/lib/llm-client";

function enumSchema(values: string[]) {
  return {
    type: "string",
    enum: values,
  } as const;
}

function nullableStringSchema() {
  return {
    type: ["string", "null"],
  } as const;
}

function stringArraySchema(minItems?: number) {
  return {
    type: "array",
    items: { type: "string" },
    ...(minItems !== undefined ? { minItems } : {}),
  } as const;
}

const roleFamilySchema = enumSchema([
  "backend",
  "frontend",
  "fullstack",
  "data_engineering",
  "data_science_ml",
  "platform_infra_sre",
  "security",
  "mobile",
  "engineering_management",
  "other",
]);

const constraintVerdictsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["location_fit", "work_model_fit", "must_have_coverage"],
  properties: {
    location_fit: enumSchema(["local", "nearby", "non_local", "unknown"]),
    work_model_fit: enumSchema(["yes", "no", "unclear"]),
    must_have_coverage: enumSchema(["strong", "partial", "weak", "unknown"]),
  },
} as const;

const judgeAssessmentItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "index",
    "capability_score",
    "relevance_score",
    "join_likelihood_score",
    "constraint_verdicts",
    "primary_risk",
    "first_contact_confidence",
    "blocking_constraints",
    "blocking_severity",
    "advance_recommendation",
    "shortlist_decision",
    "short_reasons",
    "risk_flags",
    "evidence_quality",
  ],
  properties: {
    index: { type: "integer" },
    capability_score: { type: "number" },
    relevance_score: { type: "number" },
    join_likelihood_score: { type: "number" },
    constraint_verdicts: constraintVerdictsSchema,
    primary_risk: nullableStringSchema(),
    first_contact_confidence: enumSchema(["high", "medium", "low"]),
    blocking_constraints: stringArraySchema(),
    blocking_severity: enumSchema(["hard", "soft", "none"]),
    advance_recommendation: enumSchema(["advance", "hold", "reject"]),
    shortlist_decision: enumSchema(["yes", "no"]),
    short_reasons: stringArraySchema(),
    risk_flags: stringArraySchema(),
    evidence_quality: enumSchema(["high", "medium", "low"]),
  },
} as const;

const fastJudgeAssessmentItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "index",
    "capability_score",
    "relevance_score",
    "join_likelihood_score",
    "advance_recommendation",
    "shortlist_decision",
    "primary_risk",
    "first_contact_confidence",
    "blocking_severity",
    "short_reasons",
    "evidence_quality",
  ],
  properties: {
    index: { type: "integer" },
    capability_score: { type: "number" },
    relevance_score: { type: "number" },
    join_likelihood_score: { type: "number" },
    advance_recommendation: enumSchema(["advance", "hold", "reject"]),
    shortlist_decision: enumSchema(["yes", "no"]),
    primary_risk: nullableStringSchema(),
    first_contact_confidence: enumSchema(["high", "medium", "low"]),
    blocking_severity: enumSchema(["hard", "soft", "none"]),
    short_reasons: stringArraySchema(),
    evidence_quality: enumSchema(["high", "medium", "low"]),
  },
} as const;

const arbiterAssessmentItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "index",
    "capability_score",
    "relevance_score",
    "join_likelihood_score",
    "quality_score",
    "advance_score",
    "advance_recommendation",
    "shortlist_decision",
    "shortlist_reason",
    "primary_risk",
    "first_contact_confidence",
    "blocking_constraints",
    "blocking_severity",
    "join_likelihood_reasons",
    "constraint_verdicts",
    "risk_flags",
    "why_this_candidate",
    "why_not_higher",
    "skills",
    "experience_years",
    "location",
    "evidence_quality",
    "why_reachable_now",
  ],
  properties: {
    index: { type: "integer" },
    capability_score: { type: "number" },
    relevance_score: { type: "number" },
    join_likelihood_score: { type: "number" },
    quality_score: { type: "number" },
    advance_score: { type: "number" },
    advance_recommendation: enumSchema(["advance", "hold", "reject"]),
    shortlist_decision: enumSchema(["yes", "no"]),
    shortlist_reason: nullableStringSchema(),
    primary_risk: nullableStringSchema(),
    first_contact_confidence: enumSchema(["high", "medium", "low"]),
    blocking_constraints: stringArraySchema(),
    blocking_severity: enumSchema(["hard", "soft", "none"]),
    join_likelihood_reasons: stringArraySchema(),
    constraint_verdicts: constraintVerdictsSchema,
    risk_flags: stringArraySchema(),
    why_this_candidate: stringArraySchema(),
    why_not_higher: stringArraySchema(),
    skills: stringArraySchema(),
    experience_years: {
      type: ["number", "null"],
    },
    location: nullableStringSchema(),
    evidence_quality: enumSchema(["high", "medium", "low"]),
    why_reachable_now: nullableStringSchema(),
  },
} as const;

export const COMPANY_INFO_EXTRACTION_JSON_SCHEMA: LlmJsonSchemaConfig = {
  name: "company_info_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["company_name", "domain"],
    properties: {
      company_name: nullableStringSchema(),
      domain: nullableStringSchema(),
    },
  },
};

export function buildOutreachDraftJsonSchema(options?: {
  includeEmail?: boolean;
}): LlmJsonSchemaConfig {
  const includeEmail = options?.includeEmail === true;
  return {
    name: includeEmail ? "outreach_draft_full" : "outreach_draft_linkedin_only",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: includeEmail ? ["subject", "linkedin", "email"] : ["subject", "linkedin"],
      properties: {
        subject: { type: "string" },
        linkedin: { type: "string" },
        ...(includeEmail ? { email: { type: "string" } } : {}),
      },
    },
  };
}

export const AI_COMPANY_RESPONSE_JSON_SCHEMA: LlmJsonSchemaConfig = {
  name: "ai_company_profile",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["profile", "confidence", "used_sources"],
    properties: {
      profile: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "website",
          "industry",
          "size",
          "mission",
          "culture",
          "benefits",
          "tech_stack",
          "selling_points",
        ],
        properties: {
          name: { type: "string" },
          website: { type: "string" },
          industry: { type: "string" },
          size: { type: "string" },
          mission: { type: "string" },
          culture: { type: "string" },
          benefits: { type: "string" },
          tech_stack: { type: "string" },
          selling_points: { type: "string" },
        },
      },
      confidence: enumSchema(["high", "medium", "low"]),
      used_sources: stringArraySchema(),
    },
  },
};

export const JD_SEARCH_INTENT_JSON_SCHEMA: LlmJsonSchemaConfig = {
  name: "jd_search_intent",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "hiring_brief",
      "headhunter_brief",
      "sourcing_plan",
      "recall_spec",
      "advancement_rubric",
    ],
    properties: {
      title: { type: "string" },
      hiring_brief: {
        type: "object",
        additionalProperties: false,
        required: [
          "role_core",
          "work_model",
          "location_scope",
          "location_flexibility",
          "relocation_allowed",
          "must_have_constraints",
          "soft_constraints",
          "company_stage_expectation",
          "constraint_reasoning",
        ],
        properties: {
          role_core: {
            type: "object",
            additionalProperties: false,
            required: [
              "title",
              "seniority",
              "function_focus",
              "required_skills",
              "nice_to_have_skills",
            ],
            properties: {
              title: { type: "string" },
              seniority: nullableStringSchema(),
              function_focus: { type: "string" },
              required_skills: stringArraySchema(),
              nice_to_have_skills: stringArraySchema(),
            },
          },
          work_model: enumSchema(["onsite", "hybrid", "remote", "unknown"]),
          location_scope: nullableStringSchema(),
          location_flexibility: enumSchema(["strict", "moderate", "flexible"]),
          relocation_allowed: enumSchema(["yes", "no", "unknown"]),
          must_have_constraints: stringArraySchema(),
          soft_constraints: stringArraySchema(),
          company_stage_expectation: enumSchema(["startup", "growth", "enterprise", "unknown"]),
          constraint_reasoning: { type: "string" },
        },
      },
      headhunter_brief: {
        type: "object",
        additionalProperties: false,
        required: [
          "role_family",
          "functional_core",
          "must_not_drift_to",
          "same_work_proof",
          "acceptable_adjacency",
          "disallowed_adjacency",
          "role_mission",
          "ideal_candidate_backgrounds",
          "allowed_adjacent_profiles",
          "misleading_profile_patterns",
          "equivalent_evidence",
          "verification_risks",
        ],
        properties: {
          role_family: roleFamilySchema,
          functional_core: { type: "string" },
          must_not_drift_to: stringArraySchema(),
          same_work_proof: stringArraySchema(),
          acceptable_adjacency: stringArraySchema(),
          disallowed_adjacency: stringArraySchema(),
          role_mission: { type: "string" },
          ideal_candidate_backgrounds: stringArraySchema(),
          allowed_adjacent_profiles: stringArraySchema(),
          misleading_profile_patterns: stringArraySchema(),
          equivalent_evidence: stringArraySchema(),
          verification_risks: stringArraySchema(),
        },
      },
      sourcing_plan: {
        type: "object",
        additionalProperties: false,
        required: ["strategy_mode", "first_probe_goal", "lanes", "early_stop_rules"],
        properties: {
          strategy_mode: enumSchema(["headhunter_v1", "headhunter_v2"]),
          first_probe_goal: { type: "string" },
          lanes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "name",
                "lane_kind",
                "target_persona",
                "non_negotiables",
                "relaxed_evidence",
                "exclusion_patterns",
                "initial_budget",
                "max_budget",
              ],
              properties: {
                name: { type: "string" },
                lane_kind: enumSchema([
                  "primary_exact",
                  "primary_relaxed",
                  "target_company_engineering",
                  "adjacent_authorized",
                  "exploration",
                ]),
                target_persona: { type: "string" },
                non_negotiables: stringArraySchema(),
                relaxed_evidence: stringArraySchema(),
                exclusion_patterns: stringArraySchema(),
                initial_budget: { type: "number" },
                max_budget: { type: "number" },
              },
            },
          },
          early_stop_rules: stringArraySchema(),
        },
      },
      recall_spec: {
        type: "object",
        additionalProperties: false,
        required: [
          "countries",
          "title_variants",
          "core_skill_terms",
          "differentiating_skill_terms",
          "baseline_skill_terms",
          "domain_terms",
          "must_have_signals",
          "avoid_profiles",
          "strict_location_terms",
          "nearby_location_terms",
          "geo_strategy",
          "recall_confidence",
          "role_breadth",
          "lateral_title_variants",
          "target_companies",
          "sourcing_lanes",
          "recall_strategy",
        ],
        properties: {
          countries: stringArraySchema(),
          title_variants: stringArraySchema(3),
          core_skill_terms: stringArraySchema(),
          differentiating_skill_terms: stringArraySchema(),
          baseline_skill_terms: stringArraySchema(),
          domain_terms: stringArraySchema(),
          must_have_signals: stringArraySchema(),
          avoid_profiles: stringArraySchema(),
          strict_location_terms: stringArraySchema(),
          nearby_location_terms: stringArraySchema(),
          geo_strategy: { type: "string" },
          recall_confidence: enumSchema(["high", "medium", "low"]),
          role_breadth: enumSchema(["narrow", "balanced", "broad"]),
          lateral_title_variants: stringArraySchema(),
          target_companies: stringArraySchema(),
          sourcing_lanes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "name",
                "strategy",
                "lane_kind",
                "target_persona",
                "non_negotiables",
                "relaxed_evidence",
                "exclusion_patterns",
                "initial_budget",
                "max_budget",
                "title_terms",
                "skill_terms",
                "company_terms",
                "avoid_terms",
                "budget_weight",
              ],
              properties: {
                name: { type: "string" },
                strategy: enumSchema(["title", "skill", "seniority", "company"]),
                lane_kind: enumSchema([
                  "primary_exact",
                  "primary_relaxed",
                  "target_company_engineering",
                  "adjacent_authorized",
                  "exploration",
                ]),
                target_persona: { type: "string" },
                non_negotiables: stringArraySchema(),
                relaxed_evidence: stringArraySchema(),
                exclusion_patterns: stringArraySchema(),
                initial_budget: { type: "number" },
                max_budget: { type: "number" },
                title_terms: stringArraySchema(),
                skill_terms: stringArraySchema(),
                company_terms: stringArraySchema(),
                avoid_terms: stringArraySchema(),
                budget_weight: { type: "number" },
              },
            },
          },
          recall_strategy: enumSchema(["standard", "multi_round"]),
        },
      },
      advancement_rubric: {
        type: "object",
        additionalProperties: false,
        required: [
          "same_work_evidence",
          "seniority_evidence",
          "must_have_evidence",
          "acceptable_tradeoffs",
          "reject_signals",
        ],
        properties: {
          same_work_evidence: stringArraySchema(),
          seniority_evidence: stringArraySchema(),
          must_have_evidence: stringArraySchema(),
          acceptable_tradeoffs: stringArraySchema(),
          reject_signals: stringArraySchema(),
        },
      },
    },
  },
};

const sourcingLaneSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "strategy",
    "lane_kind",
    "target_persona",
    "non_negotiables",
    "relaxed_evidence",
    "exclusion_patterns",
    "initial_budget",
    "max_budget",
    "title_terms",
    "skill_terms",
    "company_terms",
    "avoid_terms",
    "budget_weight",
  ],
  properties: {
    name: { type: "string" },
    strategy: enumSchema(["title", "skill", "seniority", "company"]),
    lane_kind: enumSchema([
      "primary_exact",
      "primary_relaxed",
      "target_company_engineering",
      "adjacent_authorized",
      "exploration",
    ]),
    target_persona: { type: "string" },
    non_negotiables: stringArraySchema(),
    relaxed_evidence: stringArraySchema(),
    exclusion_patterns: stringArraySchema(),
    initial_budget: { type: "number" },
    max_budget: { type: "number" },
    title_terms: stringArraySchema(),
    skill_terms: stringArraySchema(),
    company_terms: stringArraySchema(),
    avoid_terms: stringArraySchema(),
    budget_weight: { type: "number" },
  },
};

export const RECALL_REACT_JSON_SCHEMA: LlmJsonSchemaConfig = {
  name: "recall_react_observation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["decision", "diagnosis", "revised_lanes"],
    properties: {
      decision: enumSchema(["score_now", "revise_recall"]),
      diagnosis: { type: "string" },
      revised_lanes: {
        type: "array",
        items: sourcingLaneSchema,
      },
    },
  },
};

export const LANE_CONTRACT_CRITIC_JSON_SCHEMA: LlmJsonSchemaConfig = {
  name: "lane_contract_critic",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "strategy_mode",
      "status",
      "role_family",
      "reviews",
      "approved_sourcing_lanes",
      "rejected_reason",
    ],
    properties: {
      strategy_mode: enumSchema(["headhunter_v2"]),
      status: enumSchema(["approved", "needs_repair", "rejected"]),
      role_family: roleFamilySchema,
      reviews: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "lane_index",
            "lane_name",
            "lane_kind",
            "decision",
            "role_family_alignment",
            "drift_risks",
            "repaired_lane",
            "reason",
          ],
          properties: {
            lane_index: { type: "integer" },
            lane_name: { type: "string" },
            lane_kind: enumSchema([
              "primary_exact",
              "primary_relaxed",
              "target_company_engineering",
              "adjacent_authorized",
              "exploration",
            ]),
            decision: enumSchema(["approve", "repair", "reject"]),
            role_family_alignment: enumSchema(["aligned", "authorized_adjacent", "drifted"]),
            drift_risks: stringArraySchema(),
            repaired_lane: {
              anyOf: [
                sourcingLaneSchema,
                { type: "null" },
              ],
            },
            reason: { type: "string" },
          },
        },
      },
      approved_sourcing_lanes: {
        type: "array",
        items: sourcingLaneSchema,
      },
      rejected_reason: nullableStringSchema(),
    },
  },
};

export const LANE_AUDITOR_JSON_SCHEMA: LlmJsonSchemaConfig = {
  name: "headhunter_lane_audit",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "decision",
      "quality_grade",
      "why_this_lane_is_working",
      "why_this_lane_is_wrong",
      "wrong_profile_patterns",
      "next_lane_revision",
    ],
    properties: {
      decision: enumSchema(["expand", "revise", "stop", "escalate_adjacent"]),
      quality_grade: enumSchema(["A", "B", "C", "D"]),
      why_this_lane_is_working: { type: "string" },
      why_this_lane_is_wrong: { type: "string" },
      wrong_profile_patterns: stringArraySchema(),
      next_lane_revision: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "lane_kind",
          "target_persona",
          "non_negotiables",
          "relaxed_evidence",
          "exclusion_patterns",
          "initial_budget",
          "max_budget",
        ],
        properties: {
          name: { type: "string" },
          lane_kind: enumSchema([
            "primary_exact",
            "primary_relaxed",
            "target_company_engineering",
            "adjacent_authorized",
            "exploration",
          ]),
          target_persona: { type: "string" },
          non_negotiables: stringArraySchema(),
          relaxed_evidence: stringArraySchema(),
          exclusion_patterns: stringArraySchema(),
          initial_budget: { type: "number" },
          max_budget: { type: "number" },
        },
      },
    },
  },
};

export function buildJudgeScoreJsonSchema(poolSize: number): LlmJsonSchemaConfig {
  return {
    name: poolSize === 1 ? "judge_score_single" : "judge_score_batch",
    strict: true,
    schema: poolSize === 1
      ? judgeAssessmentItemSchema
      : {
          type: "array",
          items: judgeAssessmentItemSchema,
        },
  };
}

export function buildFastJudgeScoreJsonSchema(poolSize: number): LlmJsonSchemaConfig {
  return {
    name: poolSize === 1 ? "fast_judge_score_single" : "fast_judge_score_batch",
    strict: true,
    schema: poolSize === 1
      ? fastJudgeAssessmentItemSchema
      : {
          type: "array",
          items: fastJudgeAssessmentItemSchema,
        },
  };
}

export const RECALL_VALIDATION_QUALITY_JSON_SCHEMA: LlmJsonSchemaConfig = {
  name: "recall_validation_quality",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["assessments"],
    properties: {
      assessments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["index", "quality_label", "quality_reasons"],
          properties: {
            index: { type: "integer" },
            quality_label: enumSchema(["potential_advance", "review", "likely_irrelevant"]),
            quality_reasons: stringArraySchema(),
          },
        },
      },
    },
  },
};

export const ARBITER_SCORE_JSON_SCHEMA: LlmJsonSchemaConfig = {
  name: "arbiter_score_batch",
  strict: true,
  schema: {
    type: "array",
    items: arbiterAssessmentItemSchema,
  },
};
