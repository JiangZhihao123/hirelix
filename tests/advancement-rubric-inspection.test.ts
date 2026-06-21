import assert from "node:assert/strict";
import test from "node:test";

import { buildAdvancementRubricInspectionReport } from "@/lib/search/advancement-rubric-inspection";
import {
  buildPromptSearchContext,
  normalizeRecallSpec,
  sanitizeAdvancementRubric,
  sanitizeHiringBrief,
} from "@/lib/search-jobs";

const dependencies = {
  sanitizeHiringBrief,
  normalizeRecallSpec,
  sanitizeAdvancementRubric,
  buildPromptSearchContext,
};

test("advancement rubric inspection reports JD-specific scoring context", () => {
  const parsed = {
    title: "Staff Data Platform Engineer",
    candidate_count: 250,
    hiring_brief: {
      role_core: {
        title: "Staff Data Platform Engineer",
        seniority: "Staff",
        function_focus: "data platform infrastructure",
        required_skills: ["Kafka", "Spark", "Flink"],
        nice_to_have_skills: ["Kubernetes"],
      },
      work_model: "remote",
      location_scope: "United States",
      location_flexibility: "flexible",
      relocation_allowed: "unknown",
      must_have_constraints: ["owns production data platform systems"],
    },
    recall_spec: {
      countries: ["US"],
      title_variants: ["Staff Data Platform Engineer", "Principal Data Platform Engineer"],
      core_skill_terms: ["Kafka", "Flink", "Spark"],
      must_have_signals: ["streaming infrastructure", "data platform ownership"],
      target_companies: ["Databricks", "Confluent"],
      recall_strategy: "multi_round",
    },
    advancement_rubric: {
      same_work_evidence: [
        "Current profile shows data platform infrastructure ownership.",
      ],
      seniority_evidence: [
        "Staff-level scope across production data systems.",
      ],
      must_have_evidence: [
        "Concrete Kafka, Spark, or Flink production evidence.",
      ],
      acceptable_tradeoffs: [
        "Backend platform title can pass with streaming infrastructure evidence.",
      ],
      reject_signals: [
        "Only analytics dashboard or BI reporting evidence.",
        "Only title, employer brand, or loose keywords support the match.",
      ],
    },
  };

  const report = buildAdvancementRubricInspectionReport(parsed, {
    ...dependencies,
    searchId: "search-1",
    source: "parsed_json",
  });

  assert.equal(report.search_id, "search-1");
  assert.equal(report.recommendation, "ready_to_validate_candidates");
  assert.equal(report.checks.has_role_specific_same_work, true);
  assert.equal(report.checks.prompt_includes_advancement_rubric, true);
  assert.match(report.scoring_context_preview, /Advancement Rubric:/);
  assert.match(report.scoring_context_preview, /Same Work Evidence:.*data platform/i);
  assert.ok(report.reasons.includes("rejects_title_or_keyword_only_matches"));
});

test("advancement rubric inspection flags generic same-work evidence", () => {
  const report = buildAdvancementRubricInspectionReport(
    {
      title: "Senior Backend Engineer",
      candidate_count: 50,
      hiring_brief: {
        role_core: {
          title: "Senior Backend Engineer",
          seniority: "Senior",
          function_focus: "backend systems",
          required_skills: ["Go", "PostgreSQL"],
        },
      },
      recall_spec: {
        countries: ["US"],
        core_skill_terms: ["Go", "PostgreSQL"],
        must_have_signals: ["distributed systems"],
      },
      advancement_rubric: {
        same_work_evidence: ["Current profile evidence shows similar work."],
        must_have_evidence: ["Concrete profile evidence for Go."],
        reject_signals: ["Mostly unrelated to this JD."],
      },
    },
    {
      ...dependencies,
      source: "parsed_json",
    },
  );

  assert.equal(report.recommendation, "needs_jd_parse_review");
  assert.equal(report.checks.has_role_specific_same_work, false);
  assert.ok(report.reasons.includes("same_work_evidence_not_role_specific"));
});
