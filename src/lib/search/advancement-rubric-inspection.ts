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
  structural_checks: {
    has_same_work_evidence: boolean;
    has_must_have_evidence: boolean;
    has_reject_signals: boolean;
    prompt_includes_advancement_rubric: boolean;
  };
  llm_review: AdvancementRubricLlmReview | null;
  recommendation:
    | "requires_llm_review"
    | "ready_to_validate_candidates"
    | "needs_jd_parse_review"
    | "uncertain"
    | "insufficient_structure";
  reasons: string[];
};

export type AdvancementRubricLlmReview = {
  verdict: "ready_to_validate_candidates" | "needs_jd_parse_review" | "uncertain";
  summary: string;
  strengths: string[];
  gaps: string[];
  suggested_changes: string[];
};

function normalizeStringList(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function normalizeAdvancementRubricLlmReview(value: unknown): AdvancementRubricLlmReview {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const verdict = item.verdict === "ready_to_validate_candidates" ||
    item.verdict === "needs_jd_parse_review" ||
    item.verdict === "uncertain"
    ? item.verdict
    : "uncertain";
  return {
    verdict,
    summary: typeof item.summary === "string" ? item.summary.trim() : "",
    strengths: normalizeStringList(item.strengths, 5),
    gaps: normalizeStringList(item.gaps, 5),
    suggested_changes: normalizeStringList(item.suggested_changes, 5),
  };
}

function truncateText(value: string, maxChars: number) {
  return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;
}

export function buildAdvancementRubricLlmReviewPrompt(params: {
  jdText: string | null;
  parsed: Record<string, unknown>;
  scoringContextPreview: string;
}) {
  return `You are an expert technical recruiting reviewer.

Your job is to judge whether the parsed JD understanding and advancement rubric are good enough to evaluate candidates for this specific JD.

Important:
- Do not use generic rules or keyword matching.
- Judge whether the rubric captures the actual work, seniority, must-haves, acceptable adjacent backgrounds, and role-specific reject reasons.
- A good rubric should help a recruiter decide whether a specific JD/profile pair is worth advancing.
- Do not judge candidate quality here. Judge only whether this JD-specific decision framework is usable.

Return only JSON:
{
  "verdict": "ready_to_validate_candidates | needs_jd_parse_review | uncertain",
  "summary": "short plain-English judgment",
  "strengths": ["what the rubric gets right"],
  "gaps": ["what is missing or too generic"],
  "suggested_changes": ["specific prompt/rubric changes"]
}

## Original JD
${truncateText((params.jdText ?? "").trim(), 5000)}

## Parsed Requirements
${truncateText(JSON.stringify(params.parsed, null, 2), 7000)}

## Scoring Context Preview
${truncateText(params.scoringContextPreview, 5000)}`;
}

export function buildAdvancementRubricInspectionReport(
  parsed: Record<string, unknown>,
  options: {
    searchId?: string | null;
    source: AdvancementRubricInspectionReport["source"];
    llmReview?: AdvancementRubricLlmReview | null;
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

  const title = typeof parsed.title === "string" && parsed.title.trim()
    ? parsed.title.trim()
    : hiringBrief.role_core.title;

  const hasSameWorkEvidence = advancementRubric.same_work_evidence.length > 0;
  const hasMustHaveEvidence = advancementRubric.must_have_evidence.length > 0;
  const hasRejectSignals = advancementRubric.reject_signals.length > 0;
  const promptIncludesAdvancementRubric = scoringContextPreview.includes("Advancement Rubric:");

  const reasons: string[] = [];
  if (!hasSameWorkEvidence) {
    reasons.push("missing_same_work_evidence");
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
  const hasStructuralGap = reasons.length > 0;
  const llmReview = options.llmReview ?? null;
  if (!llmReview && !hasStructuralGap) {
    reasons.push("needs_llm_rubric_judge");
  }

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
    structural_checks: {
      has_same_work_evidence: hasSameWorkEvidence,
      has_must_have_evidence: hasMustHaveEvidence,
      has_reject_signals: hasRejectSignals,
      prompt_includes_advancement_rubric: promptIncludesAdvancementRubric,
    },
    llm_review: llmReview,
    recommendation: llmReview
      ? llmReview.verdict
      : hasStructuralGap
        ? "insufficient_structure"
        : "requires_llm_review",
    reasons,
  };
}
