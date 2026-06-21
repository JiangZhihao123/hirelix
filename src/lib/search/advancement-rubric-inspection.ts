import type {
  AdvancementRubric,
  HiringBrief,
  RecallSpec,
} from "@/lib/search/types";

export type AdvancementRubricInspectionReport = {
  search_id: string | null;
  source: "search" | "parsed_json" | "jd_parse";
  title: string | null;
  candidate_count: number | null;
  hiring_brief: HiringBrief;
  recall_spec: Pick<
    RecallSpec,
    | "countries"
    | "title_variants"
    | "core_skill_terms"
    | "must_have_signals"
    | "avoid_profiles"
    | "target_companies"
    | "recall_strategy"
    | "sourcing_lanes"
  >;
  advancement_rubric: AdvancementRubric;
  scoring_context_preview: string;
  checks: {
    has_role_specific_same_work: boolean;
    has_must_have_evidence: boolean;
    has_reject_signals: boolean;
    prompt_includes_advancement_rubric: boolean;
  };
  recommendation: "ready_to_validate_candidates" | "needs_jd_parse_review";
  reasons: string[];
};

export function buildAdvancementRubricInspectionReport(
  parsed: Record<string, unknown>,
  options: {
    searchId?: string | null;
    source: AdvancementRubricInspectionReport["source"];
    sanitizeHiringBrief: (value: unknown, fallbackParsed: Record<string, unknown>) => HiringBrief;
    normalizeRecallSpec: (value: unknown, recordLimit: number) => RecallSpec;
    sanitizeAdvancementRubric: (
      value: unknown,
      parsed: Record<string, unknown>,
    ) => AdvancementRubric;
    buildPromptSearchContext: (parsed: Record<string, unknown>) => string;
  },
): AdvancementRubricInspectionReport {
  const candidateCount = Number.isFinite(parsed.candidate_count)
    ? Math.max(1, Math.round(Number(parsed.candidate_count)))
    : null;
  const hiringBrief = options.sanitizeHiringBrief(parsed.hiring_brief, parsed);
  const recallSpec = options.normalizeRecallSpec(
    parsed.recall_spec,
    candidateCount ?? 250,
  );
  const advancementRubric = options.sanitizeAdvancementRubric(
    parsed.advancement_rubric,
    parsed,
  );
  const scoringContextPreview = options.buildPromptSearchContext(parsed);

  const joinedSameWork = advancementRubric.same_work_evidence.join(" ").toLowerCase();
  const joinedRejectSignals = advancementRubric.reject_signals.join(" ").toLowerCase();
  const title = typeof parsed.title === "string" && parsed.title.trim()
    ? parsed.title.trim()
    : hiringBrief.role_core.title;
  const coreTerms = [
    title,
    hiringBrief.role_core.function_focus,
    ...hiringBrief.role_core.required_skills,
    ...recallSpec.core_skill_terms,
    ...recallSpec.must_have_signals,
  ]
    .map((value) => value?.toLowerCase().trim())
    .filter((value): value is string => Boolean(value && value.length >= 3));

  const hasRoleSpecificSameWork = coreTerms.some((term) => joinedSameWork.includes(term));
  const hasMustHaveEvidence = advancementRubric.must_have_evidence.length > 0;
  const hasRejectSignals = advancementRubric.reject_signals.length > 0;
  const promptIncludesAdvancementRubric = scoringContextPreview.includes("Advancement Rubric:");

  const reasons: string[] = [];
  if (!hasRoleSpecificSameWork) {
    reasons.push("same_work_evidence_not_role_specific");
  }
  if (!hasMustHaveEvidence) {
    reasons.push("missing_must_have_evidence");
  }
  if (!hasRejectSignals) {
    reasons.push("missing_reject_signals");
  }
  if (!promptIncludesAdvancementRubric) {
    reasons.push("scoring_context_missing_advancement_rubric");
  }
  if (
    joinedRejectSignals.includes("only title") ||
    joinedRejectSignals.includes("keywords")
  ) {
    reasons.push("rejects_title_or_keyword_only_matches");
  }

  const blockingReasons = reasons.filter(
    (reason) => reason !== "rejects_title_or_keyword_only_matches",
  );

  return {
    search_id: options.searchId ?? null,
    source: options.source,
    title,
    candidate_count: candidateCount,
    hiring_brief: hiringBrief,
    recall_spec: {
      countries: recallSpec.countries,
      title_variants: recallSpec.title_variants,
      core_skill_terms: recallSpec.core_skill_terms,
      must_have_signals: recallSpec.must_have_signals,
      avoid_profiles: recallSpec.avoid_profiles,
      target_companies: recallSpec.target_companies,
      recall_strategy: recallSpec.recall_strategy,
      sourcing_lanes: recallSpec.sourcing_lanes,
    },
    advancement_rubric: advancementRubric,
    scoring_context_preview: scoringContextPreview,
    checks: {
      has_role_specific_same_work: hasRoleSpecificSameWork,
      has_must_have_evidence: hasMustHaveEvidence,
      has_reject_signals: hasRejectSignals,
      prompt_includes_advancement_rubric: promptIncludesAdvancementRubric,
    },
    recommendation: blockingReasons.length === 0
      ? "ready_to_validate_candidates"
      : "needs_jd_parse_review",
    reasons,
  };
}
