export const CANDIDATE_STATUS_OPTIONS = [
  "new",
  "starred",
  "contacted",
  "replied",
  "submitted",
  "interview",
  "placed",
  "rejected",
] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUS_OPTIONS)[number];

const CANDIDATE_STATUS_SET = new Set<string>(CANDIDATE_STATUS_OPTIONS);

export const CANDIDATE_STATUS_LABELS: Record<CandidateStatus, string> = {
  new: "New",
  starred: "Starred",
  contacted: "Contacted",
  replied: "Replied",
  submitted: "Submitted",
  interview: "Interview",
  placed: "Placed",
  rejected: "Rejected",
};

export const VALIDATION_OUTCOME_STATUSES = [
  "contacted",
  "replied",
  "submitted",
  "interview",
  "placed",
] as const satisfies readonly CandidateStatus[];

export function isValidCandidateStatus(status: unknown): status is CandidateStatus {
  return typeof status === "string" && CANDIDATE_STATUS_SET.has(status);
}
