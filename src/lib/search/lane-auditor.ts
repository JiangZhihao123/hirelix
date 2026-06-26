import { HEADHUNTER_LANE_AUDITOR_PROMPT } from "@/lib/prompts";
import type { HeadhunterLaneKind, SourcingLane } from "@/lib/search/types";

export type LaneAuditDecision = "expand" | "revise" | "stop" | "escalate_adjacent";
export type LaneAuditGrade = "A" | "B" | "C" | "D";

export type LaneAuditResult = {
  decision: LaneAuditDecision;
  quality_grade: LaneAuditGrade;
  why_this_lane_is_working: string;
  why_this_lane_is_wrong: string;
  wrong_profile_patterns: string[];
  next_lane_revision: {
    name: string;
    lane_kind: HeadhunterLaneKind;
    target_persona: string;
    non_negotiables: string[];
    relaxed_evidence: string[];
    exclusion_patterns: string[];
    initial_budget: number;
    max_budget: number;
  };
};

function normalizeNullableString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeStringArray(value: unknown, maxItems = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, maxItems);
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function normalizeBudget(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.round(value))
    : fallback;
}

export function normalizeLaneAuditResult(value: unknown): LaneAuditResult {
  const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const revision = item.next_lane_revision && typeof item.next_lane_revision === "object"
    ? (item.next_lane_revision as Record<string, unknown>)
    : {};
  const laneKind = normalizeEnum(
    revision.lane_kind,
    [
      "primary_exact",
      "primary_relaxed",
      "target_company_engineering",
      "adjacent_authorized",
      "exploration",
    ] as const,
    "primary_exact",
  );
  return {
    decision: normalizeEnum(
      item.decision,
      ["expand", "revise", "stop", "escalate_adjacent"] as const,
      "revise",
    ),
    quality_grade: normalizeEnum(item.quality_grade, ["A", "B", "C", "D"] as const, "C"),
    why_this_lane_is_working: normalizeNullableString(item.why_this_lane_is_working) || "",
    why_this_lane_is_wrong: normalizeNullableString(item.why_this_lane_is_wrong) || "",
    wrong_profile_patterns: normalizeStringArray(item.wrong_profile_patterns, 8),
    next_lane_revision: {
      name: normalizeNullableString(revision.name) || "Revised lane",
      lane_kind: laneKind,
      target_persona: normalizeNullableString(revision.target_persona) || "Profiles matching the revised lane contract",
      non_negotiables: normalizeStringArray(revision.non_negotiables, 8),
      relaxed_evidence: normalizeStringArray(revision.relaxed_evidence, 8),
      exclusion_patterns: normalizeStringArray(revision.exclusion_patterns, 8),
      initial_budget: normalizeBudget(revision.initial_budget, laneKind === "primary_exact" ? 35 : 15),
      max_budget: normalizeBudget(revision.max_budget, laneKind === "primary_exact" ? 150 : 50),
    },
  };
}

export function buildLaneAuditUserPrompt(params: {
  jdText: string;
  headhunterBrief: unknown;
  lane: SourcingLane;
  profileSample: string;
  judgeSummary: string;
}) {
  return `${HEADHUNTER_LANE_AUDITOR_PROMPT}

## Original JD
${params.jdText.trim().slice(0, 5000)}

## Headhunter Brief
${JSON.stringify(params.headhunterBrief ?? {}, null, 2)}

## Lane Contract
${JSON.stringify({
    name: params.lane.name,
    lane_kind: params.lane.lane_kind ?? "primary_exact",
    strategy: params.lane.strategy,
    target_persona: params.lane.target_persona ?? "",
    non_negotiables: params.lane.non_negotiables ?? [],
    relaxed_evidence: params.lane.relaxed_evidence ?? [],
    exclusion_patterns: params.lane.exclusion_patterns ?? params.lane.avoid_terms,
    initial_budget: params.lane.initial_budget ?? 0,
    max_budget: params.lane.max_budget ?? 0,
    title_terms: params.lane.title_terms,
    skill_terms: params.lane.skill_terms,
    company_terms: params.lane.company_terms,
  }, null, 2)}

## Profile Sample
${params.profileSample.trim().slice(0, 12000)}

## Judge Result Summary
${params.judgeSummary.trim().slice(0, 2000)}`;
}
