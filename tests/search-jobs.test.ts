import test from "node:test";
import assert from "node:assert/strict";
import { resolveSearchJobRunnerBaseUrl } from "../src/lib/search-jobs";

test("resolveSearchJobRunnerBaseUrl prefers request origin outside production", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppBaseUrl = process.env.APP_BASE_URL;
  const originalRunnerBaseUrl = process.env.SEARCH_JOB_RUNNER_BASE_URL;

  process.env.NODE_ENV = "development";
  process.env.APP_BASE_URL = "https://hirelix.online";
  delete process.env.SEARCH_JOB_RUNNER_BASE_URL;

  assert.equal(
    resolveSearchJobRunnerBaseUrl("http://localhost:3000"),
    "http://localhost:3000",
  );

  process.env.NODE_ENV = originalNodeEnv;
  if (originalAppBaseUrl === undefined) {
    delete process.env.APP_BASE_URL;
  } else {
    process.env.APP_BASE_URL = originalAppBaseUrl;
  }
  if (originalRunnerBaseUrl === undefined) {
    delete process.env.SEARCH_JOB_RUNNER_BASE_URL;
  } else {
    process.env.SEARCH_JOB_RUNNER_BASE_URL = originalRunnerBaseUrl;
  }
});

test("resolveSearchJobRunnerBaseUrl uses APP_BASE_URL in production", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppBaseUrl = process.env.APP_BASE_URL;
  const originalRunnerBaseUrl = process.env.SEARCH_JOB_RUNNER_BASE_URL;

  process.env.NODE_ENV = "production";
  process.env.APP_BASE_URL = "https://hirelix.online";
  delete process.env.SEARCH_JOB_RUNNER_BASE_URL;

  assert.equal(
    resolveSearchJobRunnerBaseUrl("http://localhost:3000"),
    "https://hirelix.online",
  );

  process.env.NODE_ENV = originalNodeEnv;
  if (originalAppBaseUrl === undefined) {
    delete process.env.APP_BASE_URL;
  } else {
    process.env.APP_BASE_URL = originalAppBaseUrl;
  }
  if (originalRunnerBaseUrl === undefined) {
    delete process.env.SEARCH_JOB_RUNNER_BASE_URL;
  } else {
    process.env.SEARCH_JOB_RUNNER_BASE_URL = originalRunnerBaseUrl;
  }
});

test("resolveSearchJobRunnerBaseUrl honors explicit override", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppBaseUrl = process.env.APP_BASE_URL;
  const originalRunnerBaseUrl = process.env.SEARCH_JOB_RUNNER_BASE_URL;

  process.env.NODE_ENV = "development";
  process.env.APP_BASE_URL = "https://hirelix.online";
  process.env.SEARCH_JOB_RUNNER_BASE_URL = "https://custom-runner.example.com";

  assert.equal(
    resolveSearchJobRunnerBaseUrl("http://localhost:3000"),
    "https://custom-runner.example.com",
  );

  process.env.NODE_ENV = originalNodeEnv;
  if (originalAppBaseUrl === undefined) {
    delete process.env.APP_BASE_URL;
  } else {
    process.env.APP_BASE_URL = originalAppBaseUrl;
  }
  if (originalRunnerBaseUrl === undefined) {
    delete process.env.SEARCH_JOB_RUNNER_BASE_URL;
  } else {
    process.env.SEARCH_JOB_RUNNER_BASE_URL = originalRunnerBaseUrl;
  }
});
