import assert from "node:assert/strict";
import test from "node:test";

import type { BrightDataDatasetFilterRequest } from "@/lib/brightdata";
import type { RecallRound } from "@/lib/search/recall";
import {
  validateRecallLanes,
  type RecallLaneValidationDependencies,
} from "@/lib/search/recall-validation";

function request(recordsLimit: number): BrightDataDatasetFilterRequest {
  return {
    datasetId: "test_dataset",
    recordsLimit,
    filter: {
      name: "country_code",
      operator: "=",
      value: "US",
    },
  };
}

function round(name: string, recordsLimit: number): RecallRound {
  return {
    round: name,
    request: request(recordsLimit),
    diagnostics: {
      round: name,
      requested_count: recordsLimit,
      title_terms: ["Senior Backend Engineer"],
      skill_signal_groups: {
        search_domain: ["search"],
        platform_engineering: ["distributed systems", "kubernetes"],
      },
      location_mode: "country_only",
    },
  };
}

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    name: "Jane Engineer",
    linkedin_id: "jane-engineer",
    headline: "Senior Backend Engineer building distributed systems on Kubernetes",
    current_company_name: "Example",
    current_company_title: "Senior Backend Engineer",
    location: "San Francisco",
    city: "San Francisco",
    country_code: "US",
    skills: ["Go", "Kubernetes", "Distributed Systems"],
    url: "https://www.linkedin.com/in/jane-engineer",
    ...overrides,
  };
}

test("validateRecallLanes does not call Bright on cache miss when allowBright is false", async () => {
  let triggerCalls = 0;
  const deps: RecallLaneValidationDependencies = {
    lookupCachedSnapshot: async () => null,
    loadCachedSnapshotProfiles: async () => null,
    triggerDatasetFilter: async () => {
      triggerCalls += 1;
      return "snapshot-never-called";
    },
  };

  const report = await validateRecallLanes(
    [round("standard", 5)],
    deps,
    {
      allowBright: false,
      now: () => new Date("2026-06-20T00:00:00.000Z"),
    },
  );

  assert.equal(triggerCalls, 0);
  assert.equal(report.recommendation, "insufficient_data");
  assert.equal(report.rounds[0]?.status, "not_run_cache_miss");
  assert.equal(report.rounds[0]?.returned, 0);
});

test("validateRecallLanes reports cache hits, cross-lane duplicates, and quality rates", async () => {
  const rowsByRound = new Map<string, Record<string, unknown>[]>([
    [
      "standard",
      [
        profileRow({ linkedin_id: "candidate-1", name: "Candidate One" }),
        profileRow({ linkedin_id: "candidate-2", name: "Candidate Two" }),
      ],
    ],
    [
      "hidden_gem",
      [
        profileRow({ linkedin_id: "candidate-2", name: "Candidate Two" }),
        profileRow({ linkedin_id: "candidate-3", name: "Candidate Three" }),
      ],
    ],
  ]);
  const deps: RecallLaneValidationDependencies = {
    lookupCachedSnapshot: async () => ({
      snapshotId: "snapshot-cache",
      datasetSize: 2,
      cost: null,
      expiresAt: "2026-07-01T00:00:00.000Z",
    }),
    loadCachedSnapshotProfiles: async (_snapshotId, sourceRound) => rowsByRound.get(sourceRound) ?? null,
  };

  const report = await validateRecallLanes(
    [round("standard", 5), round("hidden_gem", 5)],
    deps,
    {
      allowBright: false,
      now: () => new Date("2026-06-20T00:00:00.000Z"),
    },
  );

  assert.equal(report.total_returned, 4);
  assert.equal(report.total_unique, 3);
  assert.equal(report.unique_rate, 0.75);
  assert.equal(report.potential_advance_count, 4);
  assert.equal(report.rounds[0]?.status, "cache_hit");
  assert.equal(report.rounds[0]?.unique, 2);
  assert.equal(report.rounds[0]?.potential_advance_rate, 1);
  assert.equal(report.rounds[1]?.duplicate_count, 1);
  assert.equal(report.rounds[1]?.unique_rate, 0.5);
  assert.equal(report.rounds[1]?.lane_usefulness, "useful");
});

test("validateRecallLanes keeps historical snapshot request counts separate from micro caps", async () => {
  const deps: RecallLaneValidationDependencies = {
    lookupCachedSnapshot: async () => null,
    loadCachedSnapshotProfiles: async () => [
      profileRow({ linkedin_id: "candidate-1", name: "Candidate One" }),
      profileRow({ linkedin_id: "candidate-2", name: "Candidate Two" }),
    ],
  };

  const report = await validateRecallLanes(
    [round("standard", 5)],
    deps,
    {
      allowBright: false,
      knownSnapshots: [
        {
          round: "standard",
          snapshotId: "historical-standard",
          recordsLimit: 150,
        },
      ],
      now: () => new Date("2026-06-20T00:00:00.000Z"),
    },
  );

  assert.equal(report.total_requested_cap, 5);
  assert.equal(report.total_requested, 150);
  assert.equal(report.rounds[0]?.status, "historical_snapshot");
  assert.equal(report.rounds[0]?.requested, 150);
  assert.equal(report.rounds[0]?.returned_rate, 0.0133);
});

test("validateRecallLanes flags weak samples as bad filter signals", async () => {
  const deps: RecallLaneValidationDependencies = {
    lookupCachedSnapshot: async () => ({
      snapshotId: "snapshot-cache",
      datasetSize: 3,
      cost: null,
      expiresAt: "2026-07-01T00:00:00.000Z",
    }),
    loadCachedSnapshotProfiles: async () => [
      profileRow({
        linkedin_id: "recruiter-1",
        name: "Recruiter One",
        headline: "Technical Recruiter and Talent Acquisition Partner",
        current_company_title: "Technical Recruiter",
        skills: ["Recruiting"],
      }),
      profileRow({
        linkedin_id: "sales-1",
        name: "Sales One",
        headline: "Account Executive for SaaS sales",
        current_company_title: "Account Executive",
        skills: ["Sales"],
      }),
      profileRow({
        linkedin_id: "pm-1",
        name: "PM One",
        headline: "Product Manager for analytics dashboards",
        current_company_title: "Product Manager",
        skills: ["Roadmap"],
      }),
    ],
  };

  const report = await validateRecallLanes(
    [round("standard", 5)],
    deps,
    {
      allowBright: false,
      now: () => new Date("2026-06-20T00:00:00.000Z"),
    },
  );

  assert.equal(report.rounds[0]?.bad_filter_signal, "sample_quality_weak");
  assert.equal(report.rounds[0]?.lane_usefulness, "weak");
  assert.equal(report.rounds[0]?.potential_advance_rate, 0);
});
