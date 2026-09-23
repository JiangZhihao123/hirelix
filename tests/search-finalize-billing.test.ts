import test from "node:test";
import assert from "node:assert/strict";

import { getBillableClientRoleCount } from "../src/lib/billing-server";
import { completeSearch } from "../src/lib/search/finalize";

test("a completed retry charges the role that was released after failure", async () => {
  const usageMetadata: Record<string, unknown> = {
    client_role_billing_status: "released_after_failure",
    profile_scans_billing_status: "released_after_failure",
    client_roles_used: 0,
  };
  const candidate = {
    name: "Example Engineer",
    headline: "Backend Engineer",
    location: "New York",
    skills: ["Python"],
    experience_years: 8,
    match_score: 82,
    match_reasons: ["Built backend services"],
    profile_url: "https://example.com/profile",
    github_url: null,
    email: null,
    outreach_draft: null,
    metadata: { delivery_bucket: "review_next" },
    final_rank: 1,
  };

  await completeSearch(
    { searchId: "search-1", jobId: "job-1", createdAt: null } as Parameters<typeof completeSearch>[0],
    { internal_operator: false },
    [candidate],
    { bright_profiles_returned: 1 } as Parameters<typeof completeSearch>[3],
    {
      nowIso: () => "2026-09-23T00:00:00.000Z",
      getSearchStartedAt: () => null,
      elapsedSince: () => undefined,
      buildSearchDisplayStats: (stats) => stats as Parameters<typeof completeSearch>[3],
      generateOutreachDraftsForRows: async (_context, _runtime, _parsed, rows) => rows,
      getExecutionRuntime: () => ({}) as never,
      getSearchExecutionProfile: () => ({}),
      upsertCandidatesForSearch: async () => {},
      withDisplayStats: (parsed, stats) => ({ ...parsed, display_stats: stats }),
      setSearchStatus: async () => {},
      updateSearchUsageEventMetadata: async (_searchId, patch) => {
        Object.assign(usageMetadata, patch);
      },
      logSearchEvent: () => {},
    },
    { generateOutreachDrafts: false },
  );

  assert.equal(usageMetadata.client_role_billing_status, "charged_after_completion");
  assert.equal(usageMetadata.client_roles_used, 1);
  assert.equal(usageMetadata.profile_scans_billing_status, "charged");
  assert.equal(getBillableClientRoleCount(usageMetadata), 1);
});
