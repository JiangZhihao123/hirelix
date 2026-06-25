function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function buildRetryParsedRequirements(value: unknown): Record<string, unknown> | null {
  const parsedRequirements = readRecord(value);
  if (!parsedRequirements) return null;
  const displayStats = readRecord(parsedRequirements.display_stats);
  return {
    ...parsedRequirements,
    recall_metadata: null,
    recall_provider: "brightdata_dataset",
    search_error_type: null,
    search_error_at: null,
    search_error_retryable: null,
    display_stats: {
      ...displayStats,
      bright_profiles_returned: 0,
      recall_profile_count: 0,
      retrieval_count: 0,
      deep_review_requested_count: 0,
      deep_review_completed_count: 0,
    },
  };
}
