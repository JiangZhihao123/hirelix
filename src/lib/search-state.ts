export const STALE_PROCESSING_MINUTES = 15;

const STALE_SEARCH_STATUSES = ["queued", "parsing", "searching", "screening"] as const;
const RUNNING_SEARCH_STATUSES = [
  ...STALE_SEARCH_STATUSES,
  "deep_scoring",
] as const;
const REVIEWABLE_SEARCH_STATUSES = [
  "deep_scoring",
  "done",
] as const;

export function isStaleTrackableSearchStatus(status: string | null | undefined) {
  return STALE_SEARCH_STATUSES.includes(
    (status || "") as (typeof STALE_SEARCH_STATUSES)[number],
  );
}

export function isRunningSearchStatus(status: string | null | undefined) {
  return RUNNING_SEARCH_STATUSES.includes(
    (status || "") as (typeof RUNNING_SEARCH_STATUSES)[number],
  );
}

export function isReviewableSearchStatus(status: string | null | undefined) {
  return REVIEWABLE_SEARCH_STATUSES.includes(
    (status || "") as (typeof REVIEWABLE_SEARCH_STATUSES)[number],
  );
}

export function getSearchStatusBucket(status: string | null | undefined) {
  if (isReviewableSearchStatus(status)) return "done";
  if (isRunningSearchStatus(status)) return "processing";
  if (status === "error") return "error";
  return "all";
}

export function isStaleProcessingSearch(
  status: string | null | undefined,
  updatedAt: string | null | undefined,
  thresholdMinutes = STALE_PROCESSING_MINUTES,
) {
  if (!isStaleTrackableSearchStatus(status)) return false;
  return isOlderThanMinutes(updatedAt, thresholdMinutes);
}

export function isOlderThanMinutes(
  updatedAt: string | null | undefined,
  thresholdMinutes = STALE_PROCESSING_MINUTES,
) {
  if (!updatedAt) return false;

  const updatedAtTime = new Date(updatedAt).getTime();
  if (Number.isNaN(updatedAtTime)) return false;

  return Date.now() - updatedAtTime > thresholdMinutes * 60 * 1000;
}

export function getStalledSearchMessage(thresholdMinutes = STALE_PROCESSING_MINUTES) {
  return `This search stalled before finishing. It did not update for over ${thresholdMinutes} minutes, so Hirelix marked it as failed. Retry it to continue.`;
}
