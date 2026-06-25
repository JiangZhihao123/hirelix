import assert from "node:assert/strict";
import test from "node:test";

import { buildRetryParsedRequirements } from "@/lib/search-retry";

test("retry clears failed recall metadata and stale zero-recall counters", () => {
  const next = buildRetryParsedRequirements({
    title: "Senior Backend Engineer",
    recall_provider: "brightdata_dataset",
    recall_metadata: {
      provider: "brightdata_dataset",
      snapshot_id: "snap_failed",
      bright_profiles_returned: 0,
    },
    search_error_type: "zero_recall",
    search_error_at: "2026-06-25T00:00:00.000Z",
    search_error_retryable: true,
    display_stats: {
      bright_profiles_returned: 0,
      recall_profile_count: 0,
      retrieval_count: 0,
      deep_review_requested_count: 0,
      deep_review_completed_count: 0,
      bright_profiles_requested: 250,
    },
  });

  assert.ok(next);
  assert.equal(next.recall_metadata, null);
  assert.equal(next.search_error_type, null);
  assert.equal(next.search_error_at, null);
  assert.equal(next.search_error_retryable, null);
  const displayStats = next.display_stats as Record<string, unknown>;
  assert.equal(displayStats.bright_profiles_requested, 250);
  assert.equal(displayStats.bright_profiles_returned, 0);
});
