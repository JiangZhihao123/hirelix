export const SEARCH_EXPANSION_REASON_OPTIONS = [
  {
    code: "too_few_strong_candidates",
    label: "Too few strong candidates",
  },
  {
    code: "too_broad_or_off_target",
    label: "Too broad or off target",
  },
  {
    code: "need_stronger_technical_depth",
    label: "Need stronger technical depth",
  },
  {
    code: "wrong_seniority",
    label: "Wrong seniority",
  },
  {
    code: "wrong_location",
    label: "Wrong location",
  },
  {
    code: "wrong_company_background",
    label: "Wrong company background",
  },
  {
    code: "missing_must_have_skill",
    label: "Missing a must-have skill",
  },
  {
    code: "other",
    label: "Other feedback",
  },
] as const;

export type SearchExpansionReasonCode = typeof SEARCH_EXPANSION_REASON_OPTIONS[number]["code"];

export type SearchExpansionFeedback = {
  reasonCode: SearchExpansionReasonCode;
  reasonLabel: string;
  note: string | null;
  requestedAt: string | null;
};

const DEFAULT_REASON_CODE: SearchExpansionReasonCode = "too_few_strong_candidates";
const REASON_LABELS = new Map<SearchExpansionReasonCode, string>(
  SEARCH_EXPANSION_REASON_OPTIONS.map((option) => [option.code, option.label]),
);

function normalizeReasonCode(value: unknown): SearchExpansionReasonCode {
  return SEARCH_EXPANSION_REASON_OPTIONS.some((option) => option.code === value)
    ? (value as SearchExpansionReasonCode)
    : DEFAULT_REASON_CODE;
}

function normalizeNote(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized.slice(0, 600) : null;
}

function normalizeRequestedAt(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function getSearchExpansionReasonLabel(code: SearchExpansionReasonCode) {
  return REASON_LABELS.get(code) ?? REASON_LABELS.get(DEFAULT_REASON_CODE) ?? "Too few strong candidates";
}

export function normalizeSearchExpansionFeedbackInput(value: unknown): SearchExpansionFeedback {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const reasonCode = normalizeReasonCode(
    input.feedback_reason ?? input.reason_code ?? input.reason,
  );
  return {
    reasonCode,
    reasonLabel: getSearchExpansionReasonLabel(reasonCode),
    note: normalizeNote(input.feedback_note ?? input.user_feedback ?? input.note),
    requestedAt: null,
  };
}

export function normalizeStoredSearchExpansionFeedback(value: unknown): SearchExpansionFeedback | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const reasonCode = normalizeReasonCode(input.reason_code ?? input.reasonCode);
  return {
    reasonCode,
    reasonLabel:
      normalizeNote(input.reason_label ?? input.reasonLabel) ||
      getSearchExpansionReasonLabel(reasonCode),
    note: normalizeNote(input.user_feedback ?? input.note),
    requestedAt: normalizeRequestedAt(input.requested_at ?? input.requestedAt),
  };
}

export function toSearchExpansionFeedbackRecord(
  feedback: SearchExpansionFeedback,
  requestedAt?: string,
) {
  return {
    reason_code: feedback.reasonCode,
    reason_label: feedback.reasonLabel,
    user_feedback: feedback.note,
    requested_at: requestedAt ?? feedback.requestedAt,
  };
}
