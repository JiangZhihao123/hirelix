import assert from "node:assert/strict";
import test from "node:test";

import type { BrightDataDatasetFilterRequest } from "@/lib/brightdata";
import type { RecallRound } from "@/lib/search/recall";
import {
  assessRecallValidationProfile,
  buildRecallValidationQualityPrompt,
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
    assessProfileQuality: async (profiles) => profiles.map((_profile, index) => ({
      index,
      quality_label: "potential_advance" as const,
      quality_reasons: ["mock judge accepted profile"],
    })),
  };

  const report = await validateRecallLanes(
    [round("standard", 5), round("hidden_gem", 5)],
    deps,
    {
      allowBright: false,
      useLlmQualityJudge: true,
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

test("validateRecallLanes downloads existing cache snapshots without resubmitting Bright", async () => {
  let triggerCalls = 0;
  let downloadedSnapshotId: string | null = null;
  let persistedSnapshotId: string | null = null;
  let persistedRound: string | null = null;
  const deps: RecallLaneValidationDependencies = {
    lookupCachedSnapshot: async () => ({
      snapshotId: "snapshot-cache",
      datasetSize: 1,
      cost: null,
      expiresAt: "2026-07-01T00:00:00.000Z",
    }),
    loadCachedSnapshotProfiles: async () => null,
    triggerDatasetFilter: async () => {
      triggerCalls += 1;
      return "new-snapshot";
    },
    downloadDatasetSnapshot: async (snapshotId) => {
      downloadedSnapshotId = snapshotId;
      return [profileRow()];
    },
    persistSnapshotProfiles: async (_rows, params) => {
      persistedSnapshotId = params.snapshotId;
      persistedRound = params.sourceRound;
    },
  };

  const report = await validateRecallLanes(
    [round("standard", 5)],
    deps,
    {
      allowBright: true,
      now: () => new Date("2026-06-20T00:00:00.000Z"),
    },
  );

  assert.equal(triggerCalls, 0);
  assert.equal(downloadedSnapshotId, "snapshot-cache");
  assert.equal(persistedSnapshotId, "snapshot-cache");
  assert.equal(persistedRound, "standard");
  assert.equal(report.rounds[0]?.status, "downloaded_cache_snapshot");
  assert.equal(report.rounds[0]?.returned, 1);
});

test("validateRecallLanes reuses cached snapshot rows across source rounds", async () => {
  let downloadCalls = 0;
  let fallbackRequested = false;
  const deps: RecallLaneValidationDependencies = {
    lookupCachedSnapshot: async () => ({
      snapshotId: "snapshot-cache",
      datasetSize: 1,
      cost: null,
      expiresAt: "2026-07-01T00:00:00.000Z",
    }),
    loadCachedSnapshotProfiles: async (_snapshotId, sourceRound, options) => {
      fallbackRequested = options?.fallbackAnyRound === true;
      if (sourceRound === "adaptive_b2_1_revise_lane_standard" && options?.fallbackAnyRound) {
        return [profileRow()];
      }
      return null;
    },
    downloadDatasetSnapshot: async () => {
      downloadCalls += 1;
      return [profileRow()];
    },
  };

  const report = await validateRecallLanes(
    [round("adaptive_b2_1_revise_lane_standard", 20)],
    deps,
    {
      allowBright: true,
      now: () => new Date("2026-06-20T00:00:00.000Z"),
    },
  );

  assert.equal(fallbackRequested, true);
  assert.equal(downloadCalls, 0);
  assert.equal(report.rounds[0]?.status, "cache_hit");
  assert.equal(report.rounds[0]?.returned, 1);
});

test("validateRecallLanes downloads historical snapshots without resubmitting Bright", async () => {
  let triggerCalls = 0;
  let downloadedSnapshotId: string | null = null;
  let persistedSnapshotId: string | null = null;
  const deps: RecallLaneValidationDependencies = {
    lookupCachedSnapshot: async () => null,
    loadCachedSnapshotProfiles: async () => null,
    triggerDatasetFilter: async () => {
      triggerCalls += 1;
      return "new-snapshot";
    },
    downloadDatasetSnapshot: async (snapshotId) => {
      downloadedSnapshotId = snapshotId;
      return [profileRow()];
    },
    persistSnapshotProfiles: async (_rows, params) => {
      persistedSnapshotId = params.snapshotId;
    },
  };

  const report = await validateRecallLanes(
    [round("standard", 5)],
    deps,
    {
      allowBright: true,
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

  assert.equal(triggerCalls, 0);
  assert.equal(downloadedSnapshotId, "historical-standard");
  assert.equal(persistedSnapshotId, "historical-standard");
  assert.equal(report.rounds[0]?.status, "downloaded_cache_snapshot");
  assert.equal(report.rounds[0]?.requested, 150);
  assert.equal(report.rounds[0]?.returned, 1);
});

test("validateRecallLanes submits Bright only when cache is absent", async () => {
  let triggerCalls = 0;
  const deps: RecallLaneValidationDependencies = {
    lookupCachedSnapshot: async () => null,
    loadCachedSnapshotProfiles: async () => null,
    triggerDatasetFilter: async () => {
      triggerCalls += 1;
      return "new-snapshot";
    },
    downloadDatasetSnapshot: async () => [profileRow()],
  };

  const report = await validateRecallLanes(
    [round("standard", 5)],
    deps,
    {
      allowBright: true,
      now: () => new Date("2026-06-20T00:00:00.000Z"),
    },
  );

  assert.equal(triggerCalls, 1);
  assert.equal(report.rounds[0]?.status, "submitted_micro");
  assert.equal(report.rounds[0]?.returned, 1);
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
    assessProfileQuality: async (profiles) => profiles.map((_profile, index) => ({
      index,
      quality_label: "likely_irrelevant" as const,
      quality_reasons: ["mock judge rejected profile"],
    })),
  };

  const report = await validateRecallLanes(
    [round("standard", 5)],
    deps,
    {
      allowBright: false,
      useLlmQualityJudge: true,
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

test("assessRecallValidationProfile fallback does not decide role quality without LLM", () => {
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

  assert.equal(assessment.label, "review");
  assert.ok(assessment.reasons.includes("needs_llm_quality_judge"));
});

test("assessRecallValidationProfile fallback keeps adjacent profiles for LLM review", () => {
  const fullStack = assessRecallValidationProfile(
    adaptDatasetRecordToBrightDataProfile(profileRow({
      name: "Full Stack Engineer",
      linkedin_id: "full-stack-engineer",
      url: "https://www.linkedin.com/in/full-stack-engineer",
      headline: "Senior Software Engineer at Example | Full Stack Developer",
      current_company_name: "Example",
      current_company_title: "Senior Software Engineer | Full Stack Developer",
      skills: ["PostgreSQL", "Kubernetes", "Distributed Systems"],
    })),
  );
  const aiProfile = assessRecallValidationProfile(
    adaptDatasetRecordToBrightDataProfile(profileRow({
      name: "AI Engineer",
      linkedin_id: "ai-engineer",
      url: "https://www.linkedin.com/in/ai-engineer",
      headline: "Senior Software Engineer | AI/ML | RAG & LLM Expert | Python",
      current_company_name: "Example",
      current_company_title: "Senior Software Engineer | AI/ML | RAG & LLM Expert",
      skills: ["PostgreSQL", "Kubernetes", "Distributed Systems"],
    })),
  );

  assert.equal(fullStack.label, "review");
  assert.ok(fullStack.reasons.includes("needs_llm_quality_judge"));
  assert.equal(aiProfile.label, "review");
  assert.ok(aiProfile.reasons.includes("needs_llm_quality_judge"));
});

test("validateRecallLanes includes LLM quality reasons in sample profiles", async () => {
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
        headline: "Senior Backend Engineer building distributed systems on Kubernetes and PostgreSQL",
        current_company_name: "Example",
        current_company_title: "Senior Backend Engineer",
        skills: ["Kubernetes", "Distributed Systems", "PostgreSQL"],
      }),
    ],
    assessProfileQuality: async () => [
      {
        index: 0,
        quality_label: "potential_advance",
        quality_reasons: ["backend platform evidence", "matches JD must-have"],
      },
    ],
  };

  const report = await validateRecallLanes(
    [round("standard", 5)],
    deps,
    {
      allowBright: false,
      useLlmQualityJudge: true,
      now: () => new Date("2026-06-20T00:00:00.000Z"),
    },
  );

  assert.equal(report.rounds[0]?.sample_profiles[0]?.quality_label, "potential_advance");
  assert.ok(report.rounds[0]?.sample_profiles[0]?.quality_reasons.includes("backend platform evidence"));
  assert.ok(report.rounds[0]?.sample_profiles[0]?.quality_reasons.includes("matches JD must-have"));
});

test("validateRecallLanes flags incomplete LLM quality judge output", async () => {
  const deps: RecallLaneValidationDependencies = {
    lookupCachedSnapshot: async () => ({
      snapshotId: "snapshot-cache",
      datasetSize: 1,
      cost: null,
      expiresAt: "2026-07-01T00:00:00.000Z",
    }),
    loadCachedSnapshotProfiles: async () => [profileRow()],
    assessProfileQuality: async () => [],
  };

  const report = await validateRecallLanes(
    [round("standard", 5)],
    deps,
    {
      allowBright: false,
      useLlmQualityJudge: true,
      now: () => new Date("2026-06-20T00:00:00.000Z"),
    },
  );

  assert.equal(report.rounds[0]?.bad_filter_signal, "quality_judge_incomplete");
  assert.equal(report.rounds[0]?.sample_profiles[0]?.quality_label, "review");
  assert.ok(report.rounds[0]?.sample_profiles[0]?.quality_reasons.includes("llm_quality_judge_missing"));
});

test("validateRecallLanes does not count potential advance without LLM quality judge", async () => {
  const deps: RecallLaneValidationDependencies = {
    lookupCachedSnapshot: async () => ({
      snapshotId: "snapshot-cache",
      datasetSize: 1,
      cost: null,
      expiresAt: "2026-07-01T00:00:00.000Z",
    }),
    loadCachedSnapshotProfiles: async () => [profileRow()],
  };

  const report = await validateRecallLanes(
    [round("standard", 5)],
    deps,
    {
      allowBright: false,
      now: () => new Date("2026-06-20T00:00:00.000Z"),
    },
  );

  assert.equal(report.potential_advance_count, 0);
  assert.equal(report.rounds[0]?.sample_profiles[0]?.quality_label, "review");
  assert.ok(report.rounds[0]?.sample_profiles[0]?.quality_reasons.includes("needs_llm_quality_judge"));
});

test("buildRecallValidationQualityPrompt asks the LLM to judge against the JD instead of keyword rules", () => {
  const prompt = buildRecallValidationQualityPrompt({
    jdText: "Senior Backend Engineer for distributed payments infrastructure",
    parsedRequirements: {
      title: "Senior Backend Engineer",
      hiring_brief: { role_core: { required_skills: ["Go", "PostgreSQL"] } },
      recall_spec: { must_have_signals: ["distributed systems", "payments"] },
    },
    round: "company_target",
    profiles: [
      adaptDatasetRecordToBrightDataProfile(profileRow({
        name: "Casey Engineer",
        current_company_name: "Stripe",
        current_company_title: "Senior Software Engineer",
      })),
    ],
  });

  assert.match(prompt, /Judge against the JD and parsed search intent/);
  assert.match(prompt, /not against hard-coded keyword lists/);
  assert.match(prompt, /Do not advance a profile on employer prestige, title, or target-company membership alone/);
  assert.match(prompt, /potential_advance needs concrete evidence tied to the JD/);
  assert.match(prompt, /Return exactly 1 assessment object/);
  assert.match(prompt, /Required index values: 0/);
});
