import assert from "node:assert/strict";
import test from "node:test";

import { planAdaptiveExpansion } from "@/lib/search/adaptive-expansion";
import type {
  RecallMetadata,
  SearchDisplayStats,
  SourcingLane,
} from "@/lib/search/types";

const directLane: SourcingLane = {
  name: "direct backend",
  strategy: "title",
  lane_kind: "primary_exact",
  target_persona: "Hands-on backend engineers",
  non_negotiables: ["backend engineering"],
  relaxed_evidence: ["transaction systems"],
  exclusion_patterns: ["manager only"],
  initial_budget: 35,
  max_budget: 150,
  title_terms: ["Senior Backend Engineer"],
  skill_terms: ["postgresql", "api design"],
  company_terms: [],
  avoid_terms: ["manager only"],
  budget_weight: 1,
};

const relaxedLane: SourcingLane = {
  ...directLane,
  name: "relaxed backend",
  strategy: "skill",
  lane_kind: "primary_relaxed",
  initial_budget: 15,
  max_budget: 80,
  title_terms: ["Senior Software Engineer"],
};

function displayStats(overrides: Partial<SearchDisplayStats> = {}): SearchDisplayStats {
  return {
    retrieval_count: 50,
    deep_review_count: 50,
    deep_review_requested_count: 50,
    deep_review_completed_count: 50,
    qualified_count: 0,
    outreach_pool_count: 0,
    shortlist_count: 0,
    ...overrides,
  };
}

function metadata(overrides: Partial<RecallMetadata> = {}): RecallMetadata {
  return {
    provider: "brightdata_dataset",
    snapshot_id: "snap_standard",
    recall_strategy_mode: "headhunter_v1",
    bright_profiles_requested: 50,
    bright_profiles_returned: 50,
    recall_iterations: [
      {
        iteration: 1,
        lane: "standard",
        lane_kind: "primary_exact",
        budget: 35,
        snapshot_id: "snap_standard",
        audit: {
          decision: "expand",
          quality_grade: "B",
          summary: "Some backend profiles are directionally right.",
        },
        continue_expansion: true,
      },
      {
        iteration: 2,
        lane: "primary_relaxed",
        lane_kind: "primary_relaxed",
        budget: 15,
        snapshot_id: "snap_relaxed",
        audit: {
          decision: "stop",
          quality_grade: "D",
          summary: "Relaxed lane is polluted.",
        },
        continue_expansion: false,
      },
    ],
    round_diagnostics: [
      {
        round: "standard",
        requested_count: 35,
        returned_count: 35,
        title_terms: ["Senior Backend Engineer"],
        skill_signal_groups: {
          search_domain: ["postgresql"],
          platform_engineering: ["backend"],
        },
        location_mode: "country_only",
        quality_distribution: {
          strong_now: 2,
          consider_next: 0,
          do_not_show: 33,
          total_scored: 35,
        },
      },
      {
        round: "primary_relaxed",
        requested_count: 15,
        returned_count: 15,
        title_terms: ["Senior Software Engineer"],
        skill_signal_groups: {
          search_domain: ["postgresql"],
          platform_engineering: ["backend"],
        },
        location_mode: "country_only",
        quality_distribution: {
          strong_now: 0,
          consider_next: 0,
          do_not_show: 15,
          total_scored: 15,
        },
      },
    ],
    ...overrides,
  };
}

test("adaptive planner expands the best lane and stops a polluted relaxed lane", () => {
  const plan = planAdaptiveExpansion({
    parsed: {},
    recallMetadata: metadata(),
    displayStats: displayStats({ recommended_count: 2 }),
    recallSpec: { sourcing_lanes: [directLane, relaxedLane] },
    totalBudget: 250,
  });

  assert.equal(plan.should_continue, true);
  assert.equal(plan.planned_budget, 30);
  assert.equal(plan.actions.find((action) => action.lane === "standard")?.type, "expand_lane");
  assert.equal(plan.actions.find((action) => action.lane === "standard")?.budget, 30);
  assert.equal(plan.actions.find((action) => action.lane === "primary_relaxed")?.type, "stop_lane");
  assert.equal(plan.actions.find((action) => action.lane === "primary_relaxed")?.budget, 0);
});

test("adaptive planner revises C grade lanes with a small validation budget", () => {
  const plan = planAdaptiveExpansion({
    parsed: {},
    recallMetadata: metadata({
      recall_iterations: [
        {
          iteration: 1,
          lane: "standard",
          lane_kind: "primary_exact",
          budget: 35,
          audit: {
            decision: "revise",
            quality_grade: "C",
            summary: "Direction is close but too broad.",
            next_lane_revision: {
              name: "hands-on API backend",
              lane_kind: "primary_exact",
              target_persona: "Hands-on backend engineers",
              non_negotiables: ["backend engineering"],
              relaxed_evidence: ["billing systems"],
              exclusion_patterns: ["manager only"],
              initial_budget: 20,
              max_budget: 40,
            },
          },
          continue_expansion: false,
        },
      ],
    }),
    displayStats: displayStats({ recommended_count: 0 }),
    recallSpec: { sourcing_lanes: [directLane] },
    totalBudget: 250,
  });

  const action = plan.actions[0];
  assert.equal(plan.should_continue, true);
  assert.equal(action.type, "revise_lane");
  assert.equal(action.budget, 20);
  assert.equal(action.revised_lane?.name, "hands-on API backend");
});

test("adaptive planner records duplicate revised filters without spending", () => {
  const plan = planAdaptiveExpansion({
    parsed: {},
    recallMetadata: metadata({
      recall_iterations: [
        {
          iteration: 1,
          lane: "standard",
          lane_kind: "primary_exact",
          budget: 35,
          audit: {
            decision: "revise",
            quality_grade: "C",
            summary: "Direction is close but would repeat the same filter.",
            next_lane_revision: {
              name: "hands-on API backend",
              lane_kind: "primary_exact",
              target_persona: "Hands-on backend engineers",
              non_negotiables: ["backend engineering"],
              relaxed_evidence: ["billing systems"],
              exclusion_patterns: ["manager only"],
              initial_budget: 20,
              max_budget: 40,
            },
          },
          continue_expansion: false,
        },
      ],
    }),
    displayStats: displayStats({ recommended_count: 0 }),
    recallSpec: { sourcing_lanes: [directLane] },
    totalBudget: 250,
    isDuplicateRevision: () => true,
  });

  assert.equal(plan.should_continue, false);
  assert.equal(plan.stop_reason, "duplicate_revision_filter_hash");
  assert.equal(plan.planned_budget, 0);
  assert.equal(plan.actions[0]?.type, "reuse_snapshot");
  assert.equal(plan.actions[0]?.budget, 0);
});

test("adaptive planner marks all D probe lanes as needing human calibration without spending", () => {
  const plan = planAdaptiveExpansion({
    parsed: {},
    recallMetadata: metadata({
      recall_iterations: [
        {
          iteration: 1,
          lane: "standard",
          lane_kind: "primary_exact",
          budget: 35,
          audit: {
            decision: "stop",
            quality_grade: "D",
            summary: "Direct lane is data-platform polluted.",
          },
          continue_expansion: false,
        },
        {
          iteration: 2,
          lane: "primary_relaxed",
          lane_kind: "primary_relaxed",
          budget: 15,
          audit: {
            decision: "revise",
            quality_grade: "D",
            summary: "Relaxed lane has only data profiles.",
            next_lane_revision: {
              name: "payments backend revision",
              lane_kind: "primary_exact",
              target_persona: "Senior backend engineers with payments API ownership",
              non_negotiables: ["backend engineering", "payments"],
              relaxed_evidence: ["ledger systems"],
              exclusion_patterns: ["data platform"],
              initial_budget: 25,
              max_budget: 80,
            },
          },
          continue_expansion: false,
        },
      ],
    }),
    displayStats: displayStats({ recommended_count: 0 }),
    recallSpec: { sourcing_lanes: [directLane, relaxedLane] },
    totalBudget: 250,
  });

  assert.equal(plan.should_continue, false);
  assert.equal(plan.stop_reason, "needs_human_calibration");
  assert.equal(plan.planned_budget, 0);
  assert.ok(plan.actions.every((action) => action.type === "stop_lane"));
  const revisedStop = plan.actions.find((action) => action.lane === "primary_relaxed");
  assert.equal(revisedStop?.budget, 0);
  assert.equal(revisedStop?.revised_lane?.name, "payments backend revision");
  assert.match(revisedStop?.reason ?? "", /human calibration/);
});

test("adaptive planner stops when actionable target is already met", () => {
  const plan = planAdaptiveExpansion({
    parsed: {},
    recallMetadata: metadata(),
    displayStats: displayStats({ recommended_count: 3 }),
    recallSpec: { sourcing_lanes: [directLane, relaxedLane] },
    totalBudget: 250,
  });

  assert.equal(plan.should_continue, false);
  assert.equal(plan.stop_reason, "actionable_target_met");
  assert.equal(plan.planned_budget, 0);
});

test("adaptive planner refuses to spend without lane audits", () => {
  const plan = planAdaptiveExpansion({
    parsed: {},
    recallMetadata: metadata({
      recall_iterations: [
        {
          iteration: 1,
          lane: "standard",
          lane_kind: "primary_exact",
          budget: 35,
          audit: null,
          continue_expansion: null,
        },
      ],
    }),
    displayStats: displayStats({ recommended_count: 0 }),
    recallSpec: { sourcing_lanes: [directLane] },
    totalBudget: 250,
  });

  assert.equal(plan.should_continue, false);
  assert.equal(plan.stop_reason, "lane_audit_missing");
});

test("adaptive planner counts adaptive batch ids instead of lane count", () => {
  const plan = planAdaptiveExpansion({
    parsed: {},
    recallMetadata: metadata({
      recall_iterations: [
        {
          iteration: 1,
          lane: "standard",
          lane_kind: "primary_exact",
          budget: 35,
          audit: {
            decision: "expand",
            quality_grade: "B",
            summary: "Direct lane still works.",
          },
          continue_expansion: true,
        },
        {
          iteration: 2,
          lane: "adaptive_b1_1_expand_lane_standard",
          lane_kind: "primary_exact",
          budget: 30,
          audit: {
            decision: "expand",
            quality_grade: "B",
            summary: "First adaptive batch still works.",
          },
          continue_expansion: true,
        },
        {
          iteration: 3,
          lane: "adaptive_b1_2_revise_lane_primary_relaxed",
          lane_kind: "primary_relaxed",
          budget: 20,
          audit: {
            decision: "stop",
            quality_grade: "D",
            summary: "Second lane in the same adaptive batch is polluted.",
          },
          continue_expansion: false,
        },
      ],
    }),
    displayStats: displayStats({ recommended_count: 1 }),
    recallSpec: { sourcing_lanes: [directLane, relaxedLane] },
    totalBudget: 250,
    maxAdaptiveBatches: 2,
  });

  assert.equal(plan.should_continue, true);
  assert.equal(plan.stop_reason, null);
});
