import type {
  HeadhunterLaneKind,
  RecallMetadata,
  RecallRoundDiagnostics,
  SearchDisplayStats,
  SourcingLane,
} from "@/lib/search/types";

export type AdaptiveExpansionActionType =
  | "expand_lane"
  | "revise_lane"
  | "stop_lane"
  | "escalate_adjacent"
  | "reuse_snapshot"
  | "duplicate_market_slice"
  | "rewrite_thesis"
  | "finish";

export type AdaptiveExpansionAction = {
  type: AdaptiveExpansionActionType;
  lane: string;
  lane_kind: HeadhunterLaneKind;
  budget: number;
  reason: string;
  source_iteration?: number | null;
  revised_lane?: SourcingLane | null;
  thesis_rewrite?: {
    failure_reason: string;
    previous_drift_point: string;
    new_lane_difference: string;
    should_spend_bright: boolean;
  } | null;
};

export type AdaptiveExpansionPlan = {
  should_continue: boolean;
  stop_reason: string | null;
  remaining_budget: number;
  planned_budget: number;
  actions: AdaptiveExpansionAction[];
};

const DEFAULT_FREE_ACTIONABLE_TARGET = 3;
const DEFAULT_MAX_ADAPTIVE_BATCHES = 2;
const DEFAULT_EXPANSION_BUDGET_BY_GRADE: Record<"A" | "B" | "C" | "D", number> = {
  A: 50,
  B: 30,
  C: 20,
  D: 0,
};
const DEFAULT_DUPLICATE_MARKET_SLICE_OVERLAP_THRESHOLD = 0.7;

function clampBudget(value: number, remainingBudget: number, maxBudget?: number | null) {
  const boundedByMax = typeof maxBudget === "number" && Number.isFinite(maxBudget)
    ? Math.min(value, Math.max(1, Math.round(maxBudget)))
    : value;
  return Math.max(0, Math.min(Math.round(boundedByMax), Math.max(0, remainingBudget)));
}

function getUsedBudget(iterations: NonNullable<RecallMetadata["recall_iterations"]>) {
  return iterations.reduce((sum, iteration) => sum + Math.max(0, Math.round(iteration.budget || 0)), 0);
}

function getAdaptiveBatchCount(iterations: NonNullable<RecallMetadata["recall_iterations"]>) {
  const batches = new Set<string>();
  for (const iteration of iterations) {
    if (!/^adaptive_/.test(iteration.lane)) continue;
    const match = /^adaptive_b(\d+)_/.exec(iteration.lane);
    batches.add(match ? match[1] : iteration.lane);
  }
  return batches.size;
}

function getQualityDistribution(
  diagnostics: RecallRoundDiagnostics[],
  lane: string,
) {
  return diagnostics.find((round) => round.round === lane)?.quality_distribution ?? null;
}

function getRoundDiagnostics(
  diagnostics: RecallRoundDiagnostics[],
  lane: string,
) {
  return diagnostics.find((round) => round.round === lane) ?? null;
}

function isAllowedAdjacentProfile(
  parsed: Record<string, unknown>,
) {
  const brief = parsed.headhunter_brief && typeof parsed.headhunter_brief === "object"
    ? (parsed.headhunter_brief as Record<string, unknown>)
    : null;
  return Array.isArray(brief?.allowed_adjacent_profiles) && brief.allowed_adjacent_profiles.length > 0;
}

function toSourcingLane(
  value: unknown,
  fallback: SourcingLane,
): SourcingLane {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Partial<SourcingLane>;
  return {
    ...fallback,
    ...record,
    name: typeof record.name === "string" && record.name.trim().length > 0
      ? record.name.trim()
      : fallback.name,
    lane_kind: record.lane_kind ?? fallback.lane_kind,
    title_terms: Array.isArray(record.title_terms) ? record.title_terms : fallback.title_terms,
    skill_terms: Array.isArray(record.skill_terms) ? record.skill_terms : fallback.skill_terms,
    company_terms: Array.isArray(record.company_terms) ? record.company_terms : fallback.company_terms,
    avoid_terms: Array.isArray(record.avoid_terms) ? record.avoid_terms : fallback.avoid_terms,
    budget_weight: typeof record.budget_weight === "number" ? record.budget_weight : fallback.budget_weight,
  };
}

function getFallbackLane(
  lane: string,
  laneKind: HeadhunterLaneKind,
  recallSpec: { sourcing_lanes?: SourcingLane[] } | null | undefined,
) {
  const byKind = recallSpec?.sourcing_lanes?.find((item) => item.lane_kind === laneKind);
  if (byKind) return byKind;
  const first = recallSpec?.sourcing_lanes?.[0];
  if (first) return first;
  return {
    name: lane,
    strategy: laneKind === "target_company_engineering" ? "company" : laneKind === "primary_exact" ? "title" : "skill",
    lane_kind: laneKind,
    title_terms: [],
    skill_terms: [],
    company_terms: [],
    avoid_terms: [],
    budget_weight: 1,
  } satisfies SourcingLane;
}

function buildActionReason(params: {
  grade: string;
  decision: string;
  summary?: string | null;
  strongNow?: number;
  doNotShow?: number;
}) {
  const pieces = [`audit ${params.grade}/${params.decision}`];
  if (typeof params.strongNow === "number" || typeof params.doNotShow === "number") {
    pieces.push(`quality strong=${params.strongNow ?? 0}, rejected=${params.doNotShow ?? 0}`);
  }
  if (params.summary) pieces.push(params.summary);
  return pieces.join("; ").slice(0, 500);
}

function resolveNoSpendStopReason(params: {
  actions: AdaptiveExpansionAction[];
  completedAudits: NonNullable<RecallMetadata["recall_iterations"]>;
}) {
  if (params.actions.some((action) => action.type === "duplicate_market_slice")) {
    return "duplicate_market_slice";
  }
  if (params.actions.some((action) => action.type === "rewrite_thesis")) {
    return "needs_human_calibration";
  }
  if (params.actions.some((action) => action.type === "reuse_snapshot")) {
    return "duplicate_revision_filter_hash";
  }
  const audited = params.completedAudits.filter((iteration) => iteration.audit);
  if (
    audited.length > 0 &&
    audited.every((iteration) => iteration.audit?.quality_grade === "D")
  ) {
    return "needs_human_calibration";
  }
  if (
    audited.length > 0 &&
    params.actions.length > 0 &&
    params.actions.every((action) => action.type === "stop_lane")
  ) {
    return "all_lanes_stopped";
  }
  return "no_expandable_lanes";
}

function hasWorkableAuditedLane(
  iterations: NonNullable<RecallMetadata["recall_iterations"]>,
) {
  return iterations.some((iteration) => {
    const audit = iteration.audit;
    if (!audit) return false;
    return (audit.quality_grade === "A" || audit.quality_grade === "B") && audit.decision !== "stop";
  });
}

function isDuplicateMarketSliceIteration(
  iteration: NonNullable<RecallMetadata["recall_iterations"]>[number],
  diagnostics: RecallRoundDiagnostics[],
) {
  const diagnostic = getRoundDiagnostics(diagnostics, iteration.lane);
  const rawReturned = iteration.raw_profiles_returned ?? diagnostic?.returned_count ?? null;
  const uniqueAdded = iteration.unique_profiles_added ?? diagnostic?.unique_added_count ?? null;
  const overlapRatio = iteration.overlap_ratio ?? diagnostic?.overlap_ratio ?? null;
  return (
    iteration.market_slice_status === "duplicate_market_slice" ||
    (
      rawReturned != null &&
      rawReturned > 0 &&
      uniqueAdded === 0
    ) ||
    (
      overlapRatio != null &&
      overlapRatio >= DEFAULT_DUPLICATE_MARKET_SLICE_OVERLAP_THRESHOLD
    )
  );
}

export function planAdaptiveExpansion(params: {
  parsed: Record<string, unknown>;
  recallMetadata: RecallMetadata | null;
  displayStats: SearchDisplayStats | null;
  recallSpec?: { sourcing_lanes?: SourcingLane[] } | null;
  totalBudget: number;
  strategyMode?: "headhunter_v1" | "headhunter_v2";
  actionableTarget?: number;
  maxAdaptiveBatches?: number;
  isDuplicateRevision?: (action: {
    lane: string;
    lane_kind: HeadhunterLaneKind;
    revised_lane: SourcingLane;
    budget: number;
  }) => boolean;
}): AdaptiveExpansionPlan {
  const totalBudget = Math.max(0, Math.round(params.totalBudget));
  const strategyMode = params.strategyMode ?? "headhunter_v1";
  const iterations = params.recallMetadata?.recall_iterations ?? [];
  const usedBudget = getUsedBudget(iterations);
  let remainingBudget = Math.max(0, totalBudget - usedBudget);
  const actionableTarget = Math.max(1, Math.round(params.actionableTarget ?? DEFAULT_FREE_ACTIONABLE_TARGET));
  const actionableCount =
    params.displayStats?.recommended_count ??
    params.displayStats?.actionable_candidate_count ??
    params.displayStats?.worth_reviewing_count ??
    0;

  if (iterations.length === 0) {
    return {
      should_continue: false,
      stop_reason: "no_recall_iterations",
      remaining_budget: remainingBudget,
      planned_budget: 0,
      actions: [{ type: "finish", lane: "all", lane_kind: "primary_exact", budget: 0, reason: "No recall iterations to expand." }],
    };
  }

  if (remainingBudget <= 0) {
    return {
      should_continue: false,
      stop_reason: "budget_exhausted",
      remaining_budget: 0,
      planned_budget: 0,
      actions: [{ type: "finish", lane: "all", lane_kind: "primary_exact", budget: 0, reason: "No adaptive recall budget remains." }],
    };
  }

  const maxAdaptiveBatches = Math.max(0, Math.round(params.maxAdaptiveBatches ?? DEFAULT_MAX_ADAPTIVE_BATCHES));
  if (getAdaptiveBatchCount(iterations) >= maxAdaptiveBatches) {
    return {
      should_continue: false,
      stop_reason: "adaptive_batch_limit_reached",
      remaining_budget: remainingBudget,
      planned_budget: 0,
      actions: [{ type: "finish", lane: "all", lane_kind: "primary_exact", budget: 0, reason: `Adaptive batch limit reached (${maxAdaptiveBatches}).` }],
    };
  }

  const actions: AdaptiveExpansionAction[] = [];
  const diagnostics = params.recallMetadata?.round_diagnostics ?? [];
  const completedAudits = iterations.filter((iteration) => iteration.audit);
  if (completedAudits.length === 0) {
    return {
      should_continue: false,
      stop_reason: "lane_audit_missing",
      remaining_budget: remainingBudget,
      planned_budget: 0,
      actions: [{ type: "finish", lane: "all", lane_kind: "primary_exact", budget: 0, reason: "Lane audits are missing; not spending more Bright budget." }],
    };
  }

  const zeroActionableWithWeakAudit =
    actionableCount <= 0 &&
    completedAudits.length > 0 &&
    completedAudits.every((iteration) => {
      const grade = iteration.audit?.quality_grade ?? "D";
      return grade === "C" || grade === "D" || iteration.audit?.decision === "revise" || iteration.audit?.decision === "stop";
    });
  const sparseNoActionablePool =
    actionableCount <= 0 &&
    completedAudits.some((iteration) => {
      const diagnostic = getRoundDiagnostics(diagnostics, iteration.lane);
      const uniqueAdded = iteration.unique_profiles_added ?? diagnostic?.unique_added_count ?? null;
      return uniqueAdded != null && uniqueAdded < 3;
    });
  if (strategyMode === "headhunter_v2" && (zeroActionableWithWeakAudit || sparseNoActionablePool)) {
    return {
      should_continue: false,
      stop_reason: "needs_human_calibration",
      remaining_budget: remainingBudget,
      planned_budget: 0,
      actions: [{
        type: "rewrite_thesis",
        lane: "all",
        lane_kind: "primary_exact",
        budget: 0,
        reason: zeroActionableWithWeakAudit
          ? "No actionable candidates and audited lanes are C/D or revision/stop; rewrite sourcing thesis instead of micro-tuning fields."
          : "No actionable candidates and the market slice is too sparse; rewrite sourcing thesis before another Bright spend.",
        thesis_rewrite: {
          failure_reason: actionableCount <= 0
            ? "No outreach-ready candidates were produced."
            : "Current lane did not produce enough fresh profile evidence.",
          previous_drift_point: completedAudits
            .map((iteration) => iteration.audit?.why_this_lane_is_wrong || iteration.audit?.summary)
            .filter((value): value is string => Boolean(value))
            .join(" | ")
            .slice(0, 500),
          new_lane_difference: "A materially different lane must change the sourcing thesis and pass Lane Contract Critic before Bright spend.",
          should_spend_bright: false,
        },
      }],
    };
  }

  if (actionableCount >= actionableTarget && hasWorkableAuditedLane(completedAudits)) {
    return {
      should_continue: false,
      stop_reason: "actionable_target_met",
      remaining_budget: remainingBudget,
      planned_budget: 0,
      actions: [{ type: "finish", lane: "all", lane_kind: "primary_exact", budget: 0, reason: `Actionable candidate target met (${actionableCount}/${actionableTarget}) with at least one workable audited lane.` }],
    };
  }

  const duplicateMarketSliceAudits = completedAudits.filter((iteration) =>
    isDuplicateMarketSliceIteration(iteration, diagnostics)
  );
  if (duplicateMarketSliceAudits.length > 0 && !hasWorkableAuditedLane(completedAudits)) {
    return {
      should_continue: false,
      stop_reason: "duplicate_market_slice",
      remaining_budget: remainingBudget,
      planned_budget: 0,
      actions: completedAudits.map((iteration) => ({
        type: duplicateMarketSliceAudits.includes(iteration) ? "duplicate_market_slice" : "stop_lane",
        lane: iteration.lane,
        lane_kind: iteration.lane_kind ?? "primary_exact",
        budget: 0,
        reason: duplicateMarketSliceAudits.includes(iteration)
          ? "Duplicate market slice detected after adaptive recall; not spending more Bright budget without a materially different sourcing thesis."
          : "Adaptive recall already hit a duplicate market slice and no A/B lane remains; stopping C/D micro-revisions to avoid incremental spend.",
        source_iteration: iteration.iteration,
      })),
    };
  }

  const candidates = [...completedAudits].sort((left, right) => {
    const gradeRank = { A: 4, B: 3, C: 2, D: 1 } as const;
    const leftGrade = left.audit?.quality_grade ?? "D";
    const rightGrade = right.audit?.quality_grade ?? "D";
    return gradeRank[rightGrade] - gradeRank[leftGrade];
  });

  for (const iteration of candidates) {
    if (remainingBudget <= 0) break;
    const audit = iteration.audit;
    if (!audit) continue;
    const laneKind = iteration.lane_kind ?? "primary_exact";
    const diagnostic = getRoundDiagnostics(diagnostics, iteration.lane);
    const quality = diagnostic?.quality_distribution ?? getQualityDistribution(diagnostics, iteration.lane);
    const overlapRatio = iteration.overlap_ratio ?? diagnostic?.overlap_ratio ?? null;
    const uniqueAdded = iteration.unique_profiles_added ?? diagnostic?.unique_added_count ?? null;
    const rawReturned = iteration.raw_profiles_returned ?? diagnostic?.returned_count ?? null;
    const reason = buildActionReason({
      grade: audit.quality_grade,
      decision: audit.decision,
      summary: audit.summary,
      strongNow: quality?.strong_now,
      doNotShow: quality?.do_not_show,
    });

    if (
      isDuplicateMarketSliceIteration(iteration, diagnostics)
    ) {
      actions.push({
        type: "duplicate_market_slice",
        lane: iteration.lane,
        lane_kind: laneKind,
        budget: 0,
        reason: `${reason}; duplicate market slice detected (returned=${rawReturned ?? "unknown"}, unique_added=${uniqueAdded ?? "unknown"}, overlap=${overlapRatio ?? "unknown"})`,
        source_iteration: iteration.iteration,
      });
      continue;
    }

    if (audit.decision === "stop" || audit.quality_grade === "D") {
      const revisedLane =
        audit.decision === "revise" && audit.next_lane_revision
          ? toSourcingLane(
            audit.next_lane_revision,
            getFallbackLane(iteration.lane, laneKind, params.recallSpec),
          )
          : null;
      actions.push({
        type: "stop_lane",
        lane: iteration.lane,
        lane_kind: laneKind,
        budget: 0,
        reason: audit.quality_grade === "D" && audit.decision === "revise"
          ? `${reason}; quality grade D requires human calibration before another Bright spend`
          : reason,
        source_iteration: iteration.iteration,
        revised_lane: revisedLane,
      });
      continue;
    }

    if (audit.decision === "escalate_adjacent") {
      if (!isAllowedAdjacentProfile(params.parsed)) {
        actions.push({
          type: "stop_lane",
          lane: iteration.lane,
          lane_kind: laneKind,
          budget: 0,
          reason: `${reason}; adjacent escalation not authorized by headhunter brief`,
          source_iteration: iteration.iteration,
        });
        continue;
      }
      const fallbackLane = getFallbackLane(iteration.lane, "adjacent_authorized", params.recallSpec);
      const revisedLane = toSourcingLane(audit.next_lane_revision, {
        ...fallbackLane,
        lane_kind: "adjacent_authorized",
      });
      const budget = clampBudget(25, remainingBudget, revisedLane.max_budget);
      remainingBudget -= budget;
      actions.push({
        type: "escalate_adjacent",
        lane: iteration.lane,
        lane_kind: "adjacent_authorized",
        budget,
        reason,
        source_iteration: iteration.iteration,
        revised_lane: revisedLane,
      });
      continue;
    }

    if (audit.decision === "revise" || audit.quality_grade === "C") {
      const fallbackLane = getFallbackLane(iteration.lane, laneKind, params.recallSpec);
      const revisedLane = toSourcingLane(audit.next_lane_revision, fallbackLane);
      const baseBudget = DEFAULT_EXPANSION_BUDGET_BY_GRADE[audit.quality_grade];
      const budget = clampBudget(baseBudget, remainingBudget, revisedLane.max_budget);
      if (budget <= 0) continue;
      if (params.isDuplicateRevision?.({
        lane: iteration.lane,
        lane_kind: revisedLane.lane_kind ?? laneKind,
        revised_lane: revisedLane,
        budget,
      })) {
        actions.push({
          type: "reuse_snapshot",
          lane: iteration.lane,
          lane_kind: revisedLane.lane_kind ?? laneKind,
          budget: 0,
          reason: `${reason}; revised lane compiles to an already used Bright filter`,
          source_iteration: iteration.iteration,
          revised_lane: revisedLane,
        });
        continue;
      }
      remainingBudget -= budget;
      actions.push({
        type: "revise_lane",
        lane: iteration.lane,
        lane_kind: revisedLane.lane_kind ?? laneKind,
        budget,
        reason,
        source_iteration: iteration.iteration,
        revised_lane: revisedLane,
      });
      continue;
    }

    if (audit.decision === "expand") {
      const fallbackLane = getFallbackLane(iteration.lane, laneKind, params.recallSpec);
      const baseBudget = DEFAULT_EXPANSION_BUDGET_BY_GRADE[audit.quality_grade];
      const budget = clampBudget(baseBudget, remainingBudget, fallbackLane.max_budget);
      if (budget <= 0) continue;
      remainingBudget -= budget;
      actions.push({
        type: "expand_lane",
        lane: iteration.lane,
        lane_kind: laneKind,
        budget,
        reason,
        source_iteration: iteration.iteration,
        revised_lane: fallbackLane,
      });
    }
  }

  const spendActions = actions.filter((action) => action.budget > 0);
  const plannedBudget = spendActions.reduce((sum, action) => sum + action.budget, 0);
  if (plannedBudget <= 0) {
    return {
      should_continue: false,
      stop_reason: resolveNoSpendStopReason({ actions, completedAudits }),
      remaining_budget: remainingBudget,
      planned_budget: 0,
      actions: actions.length > 0
        ? actions
        : [{ type: "finish", lane: "all", lane_kind: "primary_exact", budget: 0, reason: "No lane was safe to expand." }],
    };
  }

  return {
    should_continue: true,
    stop_reason: null,
    remaining_budget: remainingBudget,
    planned_budget: plannedBudget,
    actions,
  };
}
