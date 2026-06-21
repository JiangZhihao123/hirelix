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

test("advancement rubric inspection reports structure and defers quality judgment to LLM", () => {
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
  assert.equal(report.recommendation, "requires_llm_review");
  assert.equal(report.structural_checks.has_same_work_evidence, true);
  assert.equal(report.structural_checks.prompt_includes_advancement_rubric, true);
  assert.equal(report.llm_review, null);
  assert.match(report.scoring_context_preview, /Advancement Rubric:/);
  assert.match(report.scoring_context_preview, /Same Work Evidence:.*data platform/i);
  assert.ok(report.reasons.includes("needs_llm_rubric_judge"));
});

test("advancement rubric inspection only flags structural gaps without judging quality", () => {
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
        same_work_evidence: [],
        must_have_evidence: ["Concrete profile evidence for Go."],
        reject_signals: ["Mostly unrelated to this JD."],
      },
    },
    {
      source: "parsed_json",
      sanitizeHiringBrief,
      normalizeRecallSpec,
      sanitizeAdvancementRubric: () => ({
        same_work_evidence: [],
        seniority_evidence: [],
        must_have_evidence: ["Concrete profile evidence for Go."],
        acceptable_tradeoffs: [],
        reject_signals: ["Mostly unrelated to this JD."],
      }),
      buildPromptSearchContext,
    },
  );

  assert.equal(report.recommendation, "insufficient_structure");
  assert.equal(report.structural_checks.has_same_work_evidence, false);
  assert.ok(report.reasons.includes("missing_same_work_evidence"));
});

test("advancement rubric inspection uses explicit LLM review for quality verdict", () => {
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
        same_work_evidence: ["Current profile evidence shows backend systems ownership."],
        must_have_evidence: ["Concrete profile evidence for Go."],
        reject_signals: ["Mostly unrelated to this JD."],
      },
    },
    {
      ...dependencies,
      source: "parsed_json",
      llmReview: {
        verdict: "needs_jd_parse_review",
        summary: "Too generic for this JD.",
        strengths: ["Has must-have evidence"],
        gaps: ["Reject signals are not role-specific enough"],
        suggested_changes: ["Tie reject reasons to backend ownership and system scale"],
      },
    },
  );

  assert.equal(report.recommendation, "needs_jd_parse_review");
  assert.equal(report.llm_review?.summary, "Too generic for this JD.");
});
