import assert from "node:assert/strict";
import test from "node:test";

import type { BrightDataDatasetFilterRequest } from "@/lib/brightdata";
import type { RecallRound } from "@/lib/search/recall";
import {
  assessRecallValidationProfile,
  validateRecallLanes,
  type RecallLaneValidationDependencies,
} from "@/lib/search/recall-validation";
import { adaptDatasetRecordToBrightDataProfile } from "@/lib/brightdata";

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
        profileRow({
          linkedin_id: "candidate-1",
          name: "Candidate One",
          url: "https://www.linkedin.com/in/candidate-one",
        }),
        profileRow({
          linkedin_id: "candidate-2",
          name: "Candidate Two",
          url: "https://www.linkedin.com/in/candidate-two",
        }),
      ],
    ],
    [
      "hidden_gem",
      [
        profileRow({
          linkedin_id: "candidate-2",
          name: "Candidate Two",
          url: "https://www.linkedin.com/in/candidate-two",
        }),
        profileRow({
          linkedin_id: "candidate-3",
          name: "Candidate Three",
          url: "https://www.linkedin.com/in/candidate-three",
        }),
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
      profileRow({
        linkedin_id: "candidate-1",
        name: "Candidate One",
        url: "https://www.linkedin.com/in/candidate-one",
      }),
      profileRow({
        linkedin_id: "candidate-2",
        name: "Candidate Two",
        url: "https://www.linkedin.com/in/candidate-two",
      }),
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

test("validateRecallLanes skips historical snapshots when filter hash drifted", async () => {
  let loadedHistorical = false;
  const deps: RecallLaneValidationDependencies = {
    lookupCachedSnapshot: async () => null,
    loadCachedSnapshotProfiles: async () => {
      loadedHistorical = true;
      return [profileRow({
        linkedin_id: "candidate-1",
        name: "Candidate One",
        url: "https://www.linkedin.com/in/candidate-one",
      })];
    },
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
          filterHash: "old-filter-hash",
        },
      ],
      now: () => new Date("2026-06-20T00:00:00.000Z"),
    },
  );

  assert.equal(loadedHistorical, false);
  assert.equal(report.rounds[0]?.status, "not_run_cache_miss");
  assert.equal(report.rounds[0]?.returned, 0);
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

test("assessRecallValidationProfile rejects profile URL/name mismatches", () => {
  const assessment = assessRecallValidationProfile(
    adaptDatasetRecordToBrightDataProfile(profileRow({
      name: "Aurora Dai",
      linkedin_id: "aurora-dai",
      url: "https://www.linkedin.com/in/arlinda-de-jesus-5b1905107",
      headline: "Senior Software Engineer",
      current_company_name: "Google",
      current_company_title: "Senior Software Engineer",
      skills: ["Kubernetes", "Distributed Systems"],
    })),
  );

  assert.equal(assessment.label, "likely_irrelevant");
  assert.ok(assessment.reasons.includes("profile_url_name_mismatch"));
});

test("assessRecallValidationProfile accepts abbreviated LinkedIn profile slugs", () => {
  const assessment = assessRecallValidationProfile(
    adaptDatasetRecordToBrightDataProfile(profileRow({
      name: "Emilio Gonzalez",
      linkedin_id: "emilio-gonzalez",
      url: "https://linkedin.com/in/emilgonzdev",
      headline: "Senior Software Engineer",
      current_company_name: "Lemonade",
      current_company_title: "Senior Software Engineer",
      skills: ["Kubernetes", "Distributed Systems"],
    })),
  );

  assert.notEqual(assessment.label, "likely_irrelevant");
  assert.ok(!assessment.reasons.includes("profile_url_name_mismatch"));
});

test("assessRecallValidationProfile requires current engineering role for potential advance", () => {
  const assessment = assessRecallValidationProfile(
    adaptDatasetRecordToBrightDataProfile(profileRow({
      name: "Irina Stanescu",
      linkedin_id: "irina-stanescu",
      url: "https://www.linkedin.com/in/irinastanescu",
      headline: "Staff Software Engineer • Tech Lead Manager • Career Coach",
      current_company_name: "The Caring Techie",
      current_company_title: "Founder & CEO - Engineering Leadership Coach",
      skills: ["Distributed Systems", "Kubernetes", "Leadership"],
    })),
  );

  assert.equal(assessment.label, "likely_irrelevant");
  assert.ok(assessment.reasons.includes("irrelevant_or_inactive_profile_signal"));
});

test("validateRecallLanes includes quality reasons in sample profiles", async () => {
  const deps: RecallLaneValidationDependencies = {
    lookupCachedSnapshot: async () => ({
      snapshotId: "snapshot-cache",
      datasetSize: 1,
      cost: null,
      expiresAt: "2026-07-01T00:00:00.000Z",
    }),
    loadCachedSnapshotProfiles: async () => [
      profileRow({
        name: "Jane Engineer",
        linkedin_id: "jane-engineer",
        headline: "Senior Backend Engineer building distributed systems on Kubernetes",
        current_company_name: "Example",
        current_company_title: "Senior Backend Engineer",
        skills: ["Kubernetes", "Distributed Systems"],
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

  assert.equal(report.rounds[0]?.sample_profiles[0]?.quality_label, "potential_advance");
  assert.ok(report.rounds[0]?.sample_profiles[0]?.quality_reasons.includes("current_engineering_title"));
  assert.ok(report.rounds[0]?.sample_profiles[0]?.quality_reasons.includes("technical_depth_signal"));
});
