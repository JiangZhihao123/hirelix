import test from "node:test";
import assert from "node:assert/strict";
import {
  hasSearchJobStartedPipeline,
  resolveSearchJobRunnerBaseUrl,
} from "../src/lib/search-jobs";

const mutableEnv = process.env as Record<string, string | undefined>;

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
