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
  const includeEmail = options?.includeEmail !== false;
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
    required: ["title", "hiring_brief", "recall_spec"],
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
                "title_terms",
                "skill_terms",
                "company_terms",
                "avoid_terms",
                "budget_weight",
              ],
              properties: {
                name: { type: "string" },
                strategy: enumSchema(["title", "skill", "seniority", "company"]),
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

export const ARBITER_SCORE_JSON_SCHEMA: LlmJsonSchemaConfig = {
  name: "arbiter_score_batch",
  strict: true,
  schema: {
    type: "array",
    items: arbiterAssessmentItemSchema,
  },
};
