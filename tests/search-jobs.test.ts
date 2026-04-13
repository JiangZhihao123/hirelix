import test from "node:test";
import assert from "node:assert/strict";
import { resolveSearchJobRunnerBaseUrl } from "../src/lib/search-jobs";

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
