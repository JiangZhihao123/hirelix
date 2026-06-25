import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStandardSkillFilter,
  hasSearchJobStartedPipeline,
  isTransientSnapshotDownloadError,
  resolveSearchJobRunnerBaseUrl,
} from "../src/lib/search-jobs";
import type { BrightDataFilterRule } from "../src/lib/brightdata";
import type { RecallSpec } from "../src/lib/search/types";

const mutableEnv = process.env as Record<string, string | undefined>;

function flattenRules(rule: BrightDataFilterRule): BrightDataFilterRule[] {
  if ("filters" in rule) {
    return [rule, ...rule.filters.flatMap(flattenRules)];
  }
  return [rule];
}

function leafValues(rule: BrightDataFilterRule) {
  return flattenRules(rule)
    .filter((item): item is Extract<BrightDataFilterRule, { name: string }> => "name" in item)
    .map((item) => String(item.value));
}

function recallSpec(overrides: Partial<RecallSpec> = {}): RecallSpec {
  return {
    countries: ["US"],
    title_variants: ["Senior Backend Engineer"],
    core_skill_terms: ["Python", "TypeScript", "Node.js", "AWS", "Kubernetes"],
    differentiating_skill_terms: [
      "PostgreSQL schema design",
      "API design",
      "distributed systems",
      "observability",
      "cloud infrastructure",
    ],
    baseline_skill_terms: ["backend", "distributed systems"],
    domain_terms: ["backend platform"],
    location_terms: [],
    strict_location_terms: [],
    nearby_location_terms: [],
    must_have_signals: ["US-based", "5+ years", "PostgreSQL schema design", "API design"],
    avoid_profiles: [],
    geo_strategy: null,
    recall_confidence: "medium",
    role_breadth: "balanced",
    lateral_title_variants: [],
    target_companies: [],
    sourcing_lanes: [],
    recall_strategy: "multi_round",
    record_limit: 50,
    ...overrides,
  };
}

test("resolveSearchJobRunnerBaseUrl prefers request origin outside production", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppBaseUrl = process.env.APP_BASE_URL;
  const originalRunnerBaseUrl = process.env.SEARCH_JOB_RUNNER_BASE_URL;

  mutableEnv.NODE_ENV = "development";
  mutableEnv.APP_BASE_URL = "https://hirelix.online";
  delete mutableEnv.SEARCH_JOB_RUNNER_BASE_URL;

  assert.equal(
    resolveSearchJobRunnerBaseUrl("http://localhost:3000"),
    "http://localhost:3000",
  );

  mutableEnv.NODE_ENV = originalNodeEnv;
  if (originalAppBaseUrl === undefined) {
    delete mutableEnv.APP_BASE_URL;
  } else {
    mutableEnv.APP_BASE_URL = originalAppBaseUrl;
  }
  if (originalRunnerBaseUrl === undefined) {
    delete mutableEnv.SEARCH_JOB_RUNNER_BASE_URL;
  } else {
    mutableEnv.SEARCH_JOB_RUNNER_BASE_URL = originalRunnerBaseUrl;
  }
});

test("resolveSearchJobRunnerBaseUrl uses APP_BASE_URL in production", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppBaseUrl = process.env.APP_BASE_URL;
  const originalRunnerBaseUrl = process.env.SEARCH_JOB_RUNNER_BASE_URL;

  mutableEnv.NODE_ENV = "production";
  mutableEnv.APP_BASE_URL = "https://hirelix.online";
  delete mutableEnv.SEARCH_JOB_RUNNER_BASE_URL;

  assert.equal(
    resolveSearchJobRunnerBaseUrl("http://localhost:3000"),
    "https://hirelix.online",
  );

  mutableEnv.NODE_ENV = originalNodeEnv;
  if (originalAppBaseUrl === undefined) {
    delete mutableEnv.APP_BASE_URL;
  } else {
    mutableEnv.APP_BASE_URL = originalAppBaseUrl;
  }
  if (originalRunnerBaseUrl === undefined) {
    delete mutableEnv.SEARCH_JOB_RUNNER_BASE_URL;
  } else {
    mutableEnv.SEARCH_JOB_RUNNER_BASE_URL = originalRunnerBaseUrl;
  }
});

test("resolveSearchJobRunnerBaseUrl honors explicit override", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppBaseUrl = process.env.APP_BASE_URL;
  const originalRunnerBaseUrl = process.env.SEARCH_JOB_RUNNER_BASE_URL;

  mutableEnv.NODE_ENV = "development";
  mutableEnv.APP_BASE_URL = "https://hirelix.online";
  mutableEnv.SEARCH_JOB_RUNNER_BASE_URL = "https://custom-runner.example.com";

  assert.equal(
    resolveSearchJobRunnerBaseUrl("http://localhost:3000"),
    "https://custom-runner.example.com",
  );

  mutableEnv.NODE_ENV = originalNodeEnv;
  if (originalAppBaseUrl === undefined) {
    delete mutableEnv.APP_BASE_URL;
  } else {
    mutableEnv.APP_BASE_URL = originalAppBaseUrl;
  }
  if (originalRunnerBaseUrl === undefined) {
    delete mutableEnv.SEARCH_JOB_RUNNER_BASE_URL;
  } else {
    mutableEnv.SEARCH_JOB_RUNNER_BASE_URL = originalRunnerBaseUrl;
  }
});

test("hasSearchJobStartedPipeline treats previous parse completion as started for normal searches", () => {
  assert.equal(
    hasSearchJobStartedPipeline({
      status: "queued",
      pipeline_step: "queued",
      parse_completed_at: "2026-04-29T00:00:00.000Z",
      partial_ready_at: null,
      search_completed_at: null,
      parsed_requirements: {},
    }),
    true,
  );
});

test("hasSearchJobStartedPipeline can reclaim cache-only rescore jobs before restart", () => {
  assert.equal(
    hasSearchJobStartedPipeline({
      status: "queued",
      pipeline_step: "queued",
      parse_completed_at: "2026-04-29T00:00:00.000Z",
      partial_ready_at: null,
      search_completed_at: null,
      parsed_requirements: {
        rerun_mode: "snapshot_profile_cache",
      },
    }),
    false,
  );
});

test("isTransientSnapshotDownloadError treats Bright Data metadata 502 as retryable", () => {
  assert.equal(
    isTransientSnapshotDownloadError(
      new Error("Bright Data snapshot metadata failed (502): <html>502 Bad Gateway</html>"),
    ),
    true,
  );
});

test("isTransientSnapshotDownloadError treats wrapped database network errors as retryable", () => {
  assert.equal(
    isTransientSnapshotDownloadError(
      new Error("Failed to persist Bright Data snapshot profiles: write EPIPE", {
        cause: Object.assign(new Error("write EPIPE"), {
          code: "EPIPE",
          errno: -32,
        }),
      }),
    ),
    true,
  );
});

test("standard Bright recall skill filter stays broad enough for LLM scoring", () => {
  const filter = buildStandardSkillFilter(recallSpec(), "primary");

  assert.ok(filter);
  assert.equal(filter.operator, "or");
  assert.ok(!flattenRules(filter).some((rule) => "filters" in rule && rule.operator === "and"));
  assert.ok(leafValues(filter).includes("backend"));
  assert.ok(leafValues(filter).includes("postgresql schema design"));
  assert.ok(!leafValues(filter).includes("us-based"));
  assert.ok(!leafValues(filter).includes("5+ years"));
});
