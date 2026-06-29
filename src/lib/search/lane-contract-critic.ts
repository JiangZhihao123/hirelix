import { LANE_CONTRACT_CRITIC_PROMPT } from "@/lib/prompts";
import { normalizeNullableString, normalizeStringArray, normalizeText } from "@/lib/search/normalize";
import type {
  CompiledFilterFidelityResult,
  HeadhunterLaneKind,
  LaneContractReviewItem,
  LaneContractReviewResult,
  LaneRoleFamilyAlignment,
  RecallRoundDiagnostics,
  RecallSpec,
  RoleFamily,
  SourcingLane,
} from "@/lib/search/types";

const ROLE_FAMILIES = [
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
] as const;

const LANE_KINDS = [
  "primary_exact",
  "primary_relaxed",
  "target_company_engineering",
  "adjacent_authorized",
  "exploration",
] as const;

const LANE_STRATEGIES = ["title", "skill", "seniority", "company"] as const;

const ROLE_PATTERNS: Array<[RoleFamily, RegExp]> = [
  ["engineering_management", /\b(engineering manager|engineering lead|director of engineering|head of engineering|vp engineering|manager)\b/],
  ["frontend", /\b(frontend|front end|front-end|ui engineer|web engineer|react|vue|angular)\b/],
  ["mobile", /\b(mobile|ios|android|react native)\b/],
  ["security", /\b(security|appsec|application security|cloud security|product security)\b/],
  ["data_science_ml", /\b(machine learning|ml engineer|ai engineer|data scientist|applied scientist|research scientist|deep learning|nlp|computer vision)\b/],
  ["data_engineering", /\b(data engineer|data engineering|data platform|data infrastructure|analytics engineer|etl|elt|warehouse|lakehouse|big data|streaming platform)\b/],
  ["platform_infra_sre", /\b(platform engineer|platform engineering|infrastructure engineer|infrastructure engineering|site reliability|sre|devops|cloud engineer|production engineer|kubernetes platform)\b/],
  ["fullstack", /\b(fullstack|full stack|product engineer)\b/],
  ["backend", /\b(backend|back end|back-end|server|api|microservice|microservices|services)\b/],
];

const ROLE_DRIFT_TERMS: Record<RoleFamily, string[]> = {
  backend: ["data platform", "data engineer", "data scientist", "ml engineer", "site reliability", "sre", "devops", "frontend", "mobile"],
  frontend: ["backend", "data platform", "data engineer", "site reliability", "sre", "devops", "mobile"],
  fullstack: ["data platform", "data scientist", "site reliability", "sre", "devops", "mobile"],
  data_engineering: ["frontend", "mobile", "data scientist", "ml engineer", "site reliability", "sre", "devops"],
  data_science_ml: ["frontend", "mobile", "backend", "site reliability", "sre", "devops", "data platform"],
  platform_infra_sre: ["frontend", "mobile", "data scientist", "product engineer"],
  security: ["frontend", "mobile", "data scientist", "data platform"],
  mobile: ["backend", "frontend", "data platform", "site reliability", "sre", "devops"],
  engineering_management: ["individual contributor", "hands-on only", "intern"],
  other: [],
};

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeBudget(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.round(value))
    : fallback;
}

export function normalizeRoleFamily(value: unknown, fallback: RoleFamily = "other"): RoleFamily {
  return normalizeEnum(value, ROLE_FAMILIES, fallback);
}

function textHasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(normalizeText(term)));
}

export function inferRoleFamilyFromText(values: Array<unknown>): RoleFamily {
  const text = normalizeText(
    values
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .filter((value): value is string => typeof value === "string")
      .join(" "),
  );
  for (const [family, pattern] of ROLE_PATTERNS) {
    if (pattern.test(text)) return family;
  }
  return "other";
}

function getRoleCore(parsed: Record<string, unknown>) {
  const hiringBrief = parsed.hiring_brief && typeof parsed.hiring_brief === "object"
    ? (parsed.hiring_brief as Record<string, unknown>)
    : {};
  return hiringBrief.role_core && typeof hiringBrief.role_core === "object"
    ? (hiringBrief.role_core as Record<string, unknown>)
    : {};
}

function getPrimaryLaneRoleFamily(recallSpec?: RecallSpec): RoleFamily {
  const primaryLanes = (recallSpec?.sourcing_lanes ?? []).filter((lane) =>
    lane.lane_kind === "primary_exact" || lane.lane_kind === "primary_relaxed"
  );
  return inferRoleFamilyFromText(primaryLanes.flatMap((lane) => [
    lane.name,
    lane.target_persona,
    lane.non_negotiables,
    lane.title_terms,
  ]));
}

export function getParsedRoleFamily(parsed: Record<string, unknown>, recallSpec?: RecallSpec): RoleFamily {
  const brief = parsed.headhunter_brief && typeof parsed.headhunter_brief === "object"
    ? (parsed.headhunter_brief as Record<string, unknown>)
    : {};
  const explicit = normalizeRoleFamily(brief.role_family, "other");
  if (explicit !== "other") return explicit;
  const roleCore = getRoleCore(parsed);
  const titleFamily = inferRoleFamilyFromText([
    parsed.title,
    roleCore.title,
  ]);
  if (titleFamily !== "other") return titleFamily;
  const primaryLaneFamily = getPrimaryLaneRoleFamily(recallSpec);
  if (primaryLaneFamily !== "other") return primaryLaneFamily;
  const functionalFamily = inferRoleFamilyFromText([
    brief.functional_core,
    roleCore.function_focus,
  ]);
  if (functionalFamily !== "other") return functionalFamily;
  return inferRoleFamilyFromText([
    parsed.title,
    roleCore.title,
    brief.functional_core,
    roleCore.function_focus,
    recallSpec?.title_variants,
  ]);
}

function normalizeLane(value: unknown, fallback: SourcingLane, roleFamily: RoleFamily): SourcingLane {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const strategy = normalizeEnum(item.strategy, LANE_STRATEGIES, fallback.strategy);
  const laneKind = normalizeEnum(item.lane_kind, LANE_KINDS, fallback.lane_kind ?? "primary_exact");
  const defaultInitialBudget =
    laneKind === "primary_exact" ? 25 :
      laneKind === "primary_relaxed" ? 15 :
        laneKind === "exploration" ? 10 :
          laneKind === "target_company_engineering" ? 20 : 15;
  const defaultMaxBudget =
    laneKind === "primary_exact" ? 80 :
      laneKind === "primary_relaxed" ? 50 :
        laneKind === "exploration" ? 15 :
          laneKind === "target_company_engineering" ? 40 : 30;
  return {
    name: normalizeNullableString(item.name) || fallback.name || `${roleFamily} ${laneKind}`,
    strategy,
    lane_kind: laneKind,
    target_persona: normalizeNullableString(item.target_persona) || fallback.target_persona || "",
    non_negotiables: normalizeStringArray(item.non_negotiables, 10).length > 0
      ? normalizeStringArray(item.non_negotiables, 10)
      : fallback.non_negotiables ?? [],
    relaxed_evidence: normalizeStringArray(item.relaxed_evidence, 10).length > 0
      ? normalizeStringArray(item.relaxed_evidence, 10)
      : fallback.relaxed_evidence ?? [],
    exclusion_patterns: normalizeStringArray(item.exclusion_patterns, 10).length > 0
      ? normalizeStringArray(item.exclusion_patterns, 10)
      : fallback.exclusion_patterns ?? [],
    initial_budget: Math.min(
      normalizeBudget(item.initial_budget, fallback.initial_budget ?? defaultInitialBudget),
      laneKind === "exploration" ? 10 : 25,
    ),
    max_budget: Math.min(
      normalizeBudget(item.max_budget, fallback.max_budget ?? defaultMaxBudget),
      laneKind === "primary_exact" ? 80 : laneKind === "primary_relaxed" ? 50 : 40,
    ),
    title_terms: normalizeStringArray(item.title_terms, 12).length > 0
      ? normalizeStringArray(item.title_terms, 12)
      : fallback.title_terms,
    skill_terms: normalizeStringArray(item.skill_terms, 16).length > 0
      ? normalizeStringArray(item.skill_terms, 16)
      : fallback.skill_terms,
    company_terms: normalizeStringArray(item.company_terms, 15).length > 0
      ? normalizeStringArray(item.company_terms, 15)
      : fallback.company_terms,
    avoid_terms: normalizeStringArray(item.avoid_terms, 10).length > 0
      ? normalizeStringArray(item.avoid_terms, 10)
      : fallback.avoid_terms,
    budget_weight:
      typeof item.budget_weight === "number" && Number.isFinite(item.budget_weight)
        ? Math.max(0.25, Math.min(3, item.budget_weight))
        : fallback.budget_weight || 1,
  };
}

function getLaneText(lane: SourcingLane) {
  return normalizeText([
    lane.name,
    lane.target_persona,
    ...(lane.non_negotiables ?? []),
    ...(lane.relaxed_evidence ?? []),
    ...lane.title_terms,
    ...lane.skill_terms,
    ...lane.company_terms,
  ].filter(Boolean).join(" "));
}

function getLaneRoleFamily(lane: SourcingLane): RoleFamily {
  return inferRoleFamilyFromText([
    lane.name,
    lane.target_persona,
    lane.non_negotiables,
    lane.title_terms,
  ]);
}

function isEngineeringLane(lane: SourcingLane) {
  const text = getLaneText(lane);
  return /\b(engineer|engineering|developer|software|backend|frontend|fullstack|full stack|platform|infrastructure|sre|devops|security|mobile|data)\b/.test(text);
}

function makeRepairedLane(params: {
  lane: SourcingLane;
  recallSpec: RecallSpec;
  roleFamily: RoleFamily;
  reason: string;
}): SourcingLane | null {
  const roleTitleTerms = params.recallSpec.title_variants.filter((term) => {
    const family = inferRoleFamilyFromText([term]);
    return family === params.roleFamily || family === "other";
  });
  const titleTerms = roleTitleTerms.length > 0 ? roleTitleTerms : params.lane.title_terms;
  if (titleTerms.length === 0 && params.lane.company_terms.length === 0) return null;
  const driftTerms = ROLE_DRIFT_TERMS[params.roleFamily] ?? [];
  return {
    ...params.lane,
    name: `${params.lane.name || "lane"} repaired`,
    target_persona:
      params.lane.target_persona ||
      `${params.roleFamily} candidates with same-work evidence`,
    non_negotiables: [
      `${params.roleFamily} role-family alignment`,
      ...(params.lane.non_negotiables ?? []),
      ...params.recallSpec.must_have_signals.slice(0, 4),
    ].slice(0, 10),
    exclusion_patterns: [
      ...(params.lane.exclusion_patterns ?? []),
      ...driftTerms.map((term) => `not primarily ${term}`),
      params.reason,
    ].slice(0, 10),
    title_terms: titleTerms,
    skill_terms: params.lane.skill_terms.length > 0
      ? params.lane.skill_terms
      : [
        ...params.recallSpec.differentiating_skill_terms,
        ...params.recallSpec.must_have_signals,
      ].slice(0, 12),
    company_terms:
      params.lane.lane_kind === "target_company_engineering"
        ? params.lane.company_terms.length > 0
          ? params.lane.company_terms
          : params.recallSpec.target_companies.slice(0, 15)
        : [],
    initial_budget: Math.min(params.lane.initial_budget ?? 25, params.lane.lane_kind === "primary_exact" ? 25 : 15),
    max_budget: Math.min(params.lane.max_budget ?? 50, params.lane.lane_kind === "primary_exact" ? 80 : 50),
  };
}

function reviewLaneDeterministically(params: {
  lane: SourcingLane;
  laneIndex: number;
  recallSpec: RecallSpec;
  roleFamily: RoleFamily;
  brief: Record<string, unknown>;
}): LaneContractReviewItem {
  const laneKind = params.lane.lane_kind ?? "primary_exact";
  const laneFamily = getLaneRoleFamily(params.lane);
  const laneText = getLaneText(params.lane);
  const mustNotDriftTo = [
    ...normalizeStringArray(params.brief.must_not_drift_to, 10),
    ...normalizeStringArray(params.brief.disallowed_adjacency, 10),
  ];
  const explicitDrift = mustNotDriftTo.some((pattern) => laneText.includes(normalizeText(pattern)));
  const genericDrift = params.roleFamily !== "other" &&
    laneFamily !== "other" &&
    laneFamily !== params.roleFamily;
  const roleSpecificDrift = params.roleFamily !== "other" &&
    textHasAny(laneText, ROLE_DRIFT_TERMS[params.roleFamily] ?? []);
  const adjacentAllowed = [
    ...normalizeStringArray(params.brief.acceptable_adjacency, 10),
    ...normalizeStringArray(params.brief.allowed_adjacent_profiles, 10),
  ].length > 0;

  const isPrimaryLane = laneKind === "primary_exact" || laneKind === "primary_relaxed";
  let roleFamilyAlignment: LaneRoleFamilyAlignment =
    explicitDrift || roleSpecificDrift || (isPrimaryLane && genericDrift) ? "drifted" : "aligned";
  let decision: "approve" | "repair" | "reject" = "approve";
  const driftRisks: string[] = [];

  if (isPrimaryLane) {
    if (roleFamilyAlignment === "drifted") {
      decision = "repair";
      driftRisks.push("Primary lane changes role family instead of only changing evidence strength.");
    }
  } else if (laneKind === "adjacent_authorized") {
    if (!adjacentAllowed) {
      decision = "reject";
      roleFamilyAlignment = "drifted";
      driftRisks.push("Adjacent lane has no headhunter brief authorization.");
    } else {
      roleFamilyAlignment = "authorized_adjacent";
    }
  } else if (laneKind === "target_company_engineering") {
    const hasCompanyBoundary = params.lane.company_terms.length > 0 || params.recallSpec.target_companies.length > 0;
    if (!hasCompanyBoundary || !isEngineeringLane(params.lane)) {
      decision = "repair";
      roleFamilyAlignment = roleFamilyAlignment === "drifted" ? "drifted" : "aligned";
      driftRisks.push("Target-company lane must keep both company and engineering boundaries.");
    }
  }

  const repairedLane = decision === "repair"
    ? makeRepairedLane({
      lane: params.lane,
      recallSpec: params.recallSpec,
      roleFamily: params.roleFamily,
      reason: driftRisks[0] ?? "Repair role-family boundary before spending Bright budget.",
    })
    : null;

  if (decision === "repair" && !repairedLane) {
    decision = "reject";
  }

  return {
    lane_index: params.laneIndex,
    lane_name: params.lane.name,
    lane_kind: laneKind,
    decision,
    role_family_alignment: roleFamilyAlignment,
    drift_risks: driftRisks,
    repaired_lane: repairedLane,
    reason:
      driftRisks[0] ??
      (roleFamilyAlignment === "authorized_adjacent"
        ? "Adjacent lane is explicitly authorized by the headhunter brief."
        : "Lane preserves the role-family contract."),
  };
}

export function buildDeterministicLaneContractReview(params: {
  parsed: Record<string, unknown>;
  recallSpec: RecallSpec;
  reviewedAt?: string | null;
}): LaneContractReviewResult {
  const brief = params.parsed.headhunter_brief && typeof params.parsed.headhunter_brief === "object"
    ? (params.parsed.headhunter_brief as Record<string, unknown>)
    : {};
  const roleFamily = getParsedRoleFamily(params.parsed, params.recallSpec);
  const reviews = params.recallSpec.sourcing_lanes.map((lane, index) =>
    reviewLaneDeterministically({
      lane,
      laneIndex: index,
      recallSpec: params.recallSpec,
      roleFamily,
      brief,
    })
  );
  const approvedSourcingLanes = reviews.flatMap((review, index) => {
    if (review.decision === "approve") return [params.recallSpec.sourcing_lanes[index]];
    if (review.decision === "repair" && review.repaired_lane) return [review.repaired_lane];
    return [];
  });
  const hasApprovedPrimary = approvedSourcingLanes.some((lane) =>
    lane.lane_kind === "primary_exact" || lane.lane_kind === "primary_relaxed"
  );
  const repaired = reviews.some((review) => review.decision === "repair");
  return {
    strategy_mode: "headhunter_v2",
    status: hasApprovedPrimary ? (repaired ? "needs_repair" : "approved") : "rejected",
    role_family: roleFamily,
    reviews,
    approved_sourcing_lanes: approvedSourcingLanes,
    rejected_reason: hasApprovedPrimary ? null : "No approved primary lane remained after role-family review.",
    reviewed_at: params.reviewedAt ?? null,
  };
}

export function normalizeLaneContractReviewResult(params: {
  value: unknown;
  parsed: Record<string, unknown>;
  recallSpec: RecallSpec;
  reviewedAt?: string | null;
}): LaneContractReviewResult {
  const fallback = buildDeterministicLaneContractReview(params);
  const item = params.value && typeof params.value === "object"
    ? (params.value as Record<string, unknown>)
    : {};
  const roleFamily = normalizeRoleFamily(item.role_family, fallback.role_family);
  const rawReviews = Array.isArray(item.reviews) ? item.reviews : [];
  const reviews = params.recallSpec.sourcing_lanes.map((lane, index) => {
    const rawReview = rawReviews.find((entry) =>
      entry &&
      typeof entry === "object" &&
      (entry as Record<string, unknown>).lane_index === index
    ) as Record<string, unknown> | undefined;
    const fallbackReview = fallback.reviews[index];
    if (!rawReview) return fallbackReview;
    const decision = normalizeEnum(rawReview.decision, ["approve", "repair", "reject"] as const, fallbackReview.decision);
    const repairedLane = decision === "repair"
      ? normalizeLane(rawReview.repaired_lane, fallbackReview.repaired_lane ?? lane, roleFamily)
      : null;
    return {
      lane_index: index,
      lane_name: normalizeNullableString(rawReview.lane_name) || lane.name,
      lane_kind: normalizeEnum(rawReview.lane_kind, LANE_KINDS, lane.lane_kind ?? "primary_exact"),
      decision,
      role_family_alignment: normalizeEnum(
        rawReview.role_family_alignment,
        ["aligned", "authorized_adjacent", "drifted"] as const,
        fallbackReview.role_family_alignment,
      ),
      drift_risks: normalizeStringArray(rawReview.drift_risks, 10),
      repaired_lane: repairedLane,
      reason: normalizeNullableString(rawReview.reason) || fallbackReview.reason,
    };
  });
  const deterministicReviewsByLane = new Map(
    fallback.reviews.map((review) => [review.lane_index, review]),
  );
  const mergedReviews = reviews.map((review) => {
    const deterministic = deterministicReviewsByLane.get(review.lane_index);
    if (
      deterministic?.role_family_alignment === "drifted" &&
      review.decision === "approve"
    ) {
      return deterministic;
    }
    return review;
  });
  const approvedSourcingLanes = mergedReviews.flatMap((review, index) => {
    if (review.decision === "approve") return [params.recallSpec.sourcing_lanes[index]];
    if (review.decision === "repair" && review.repaired_lane) return [review.repaired_lane];
    return [];
  });
  const hasApprovedPrimary = approvedSourcingLanes.some((lane) =>
    lane.lane_kind === "primary_exact" || lane.lane_kind === "primary_relaxed"
  );
  const hasRepair = mergedReviews.some((review) => review.decision === "repair");
  return {
    strategy_mode: "headhunter_v2",
    status: hasApprovedPrimary ? (hasRepair ? "needs_repair" : "approved") : "rejected",
    role_family: roleFamily,
    reviews: mergedReviews,
    approved_sourcing_lanes: approvedSourcingLanes,
    rejected_reason:
      hasApprovedPrimary
        ? normalizeNullableString(item.rejected_reason)
        : normalizeNullableString(item.rejected_reason) || fallback.rejected_reason,
    reviewed_at: params.reviewedAt ?? null,
  };
}

export function applyLaneContractReviewToParsed(
  parsed: Record<string, unknown>,
  review: LaneContractReviewResult,
) {
  const recallSpec = parsed.recall_spec && typeof parsed.recall_spec === "object"
    ? (parsed.recall_spec as Record<string, unknown>)
    : {};
  return {
    ...parsed,
    lane_contract_review: review,
    approved_sourcing_lanes: review.approved_sourcing_lanes,
    recall_spec: {
      ...recallSpec,
      approved_sourcing_lanes: review.approved_sourcing_lanes,
      sourcing_lanes: review.approved_sourcing_lanes,
    },
  };
}

export function buildLaneContractCriticUserPrompt(params: {
  jdText: string;
  parsed: Record<string, unknown>;
  recallSpec: RecallSpec;
}) {
  return `${LANE_CONTRACT_CRITIC_PROMPT}

## Original JD
${params.jdText.trim().slice(0, 5000)}

## Headhunter Brief
${JSON.stringify(params.parsed.headhunter_brief ?? {}, null, 2)}

## Advancement Rubric
${JSON.stringify(params.parsed.advancement_rubric ?? {}, null, 2)}

## Sourcing Plan
${JSON.stringify(params.parsed.sourcing_plan ?? {}, null, 2)}

## Recall Spec Sourcing Lanes
${JSON.stringify(params.recallSpec.sourcing_lanes, null, 2)}`;
}

function getRoundLaneKind(round: string, diagnostics?: RecallRoundDiagnostics): HeadhunterLaneKind {
  const personaKind = diagnostics?.persona?.kind;
  if (round === "primary_relaxed" || personaKind === "skill_depth") return "primary_relaxed";
  if (personaKind === "target_company") return "target_company_engineering";
  if (personaKind === "adjacent_strong") return "adjacent_authorized";
  return "primary_exact";
}

export function evaluateCompiledFilterFidelity(params: {
  parsed: Record<string, unknown>;
  recallSpec: RecallSpec;
  rounds: Array<{
    round: string;
    diagnostics: RecallRoundDiagnostics;
    filterHash?: string | null;
  }>;
  checkedAt?: string | null;
}): CompiledFilterFidelityResult[] {
  const roleFamily = getParsedRoleFamily(params.parsed, params.recallSpec);
  const brief = params.parsed.headhunter_brief && typeof params.parsed.headhunter_brief === "object"
    ? (params.parsed.headhunter_brief as Record<string, unknown>)
    : {};
  const hasAdjacencyAuthorization = [
    ...normalizeStringArray(brief.acceptable_adjacency, 10),
    ...normalizeStringArray(brief.allowed_adjacent_profiles, 10),
  ].length > 0;
  return params.rounds.map((round) => {
    const laneKind = getRoundLaneKind(round.round, round.diagnostics);
    const titleFamily = inferRoleFamilyFromText(round.diagnostics.title_terms);
    const valuesText = normalizeText([
      ...round.diagnostics.title_terms,
      ...(round.diagnostics.persona?.title_terms ?? []),
      ...(round.diagnostics.persona?.skill_terms ?? []),
      ...(round.diagnostics.persona?.company_terms ?? []),
    ].join(" "));
    const reasons: string[] = [];
    let alignment: LaneRoleFamilyAlignment = "aligned";
    if (
      (laneKind === "primary_exact" || laneKind === "primary_relaxed") &&
      roleFamily !== "other" &&
      titleFamily !== "other" &&
      titleFamily !== roleFamily
    ) {
      alignment = "drifted";
      reasons.push(`${laneKind} compiled to ${titleFamily} titles for a ${roleFamily} role.`);
    }
    if (
      (laneKind === "primary_exact" || laneKind === "primary_relaxed") &&
      roleFamily !== "other" &&
      textHasAny(valuesText, ROLE_DRIFT_TERMS[roleFamily] ?? [])
    ) {
      alignment = "drifted";
      reasons.push(`${laneKind} contains role-family drift terms outside the approved role identity.`);
    }
    if (laneKind === "adjacent_authorized") {
      if (!hasAdjacencyAuthorization) {
        alignment = "drifted";
        reasons.push("Adjacent lane compiled without explicit headhunter brief authorization.");
      } else {
        alignment = "authorized_adjacent";
      }
    }
    if (laneKind === "target_company_engineering") {
      const hasCompanyTerms = (round.diagnostics.persona?.company_terms ?? []).length > 0;
      const engineeringTerms = isEngineeringLane({
        name: round.diagnostics.persona?.label ?? round.round,
        strategy: "company",
        lane_kind: laneKind,
        target_persona: round.diagnostics.persona?.intent ?? "",
        title_terms: round.diagnostics.title_terms,
        skill_terms: round.diagnostics.persona?.skill_terms ?? [],
        company_terms: round.diagnostics.persona?.company_terms ?? [],
        avoid_terms: [],
        budget_weight: 1,
      });
      if (!hasCompanyTerms || !engineeringTerms) {
        alignment = "drifted";
        reasons.push("Target-company lane lost company or engineering boundary.");
      }
    }
    return {
      round: round.round,
      lane_kind: laneKind,
      status: reasons.length > 0 ? "blocked" : "pass",
      role_family_alignment: alignment,
      reasons,
      filter_hash: round.filterHash ?? null,
      checked_at: params.checkedAt ?? null,
    };
  });
}
