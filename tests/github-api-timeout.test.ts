import test from "node:test";
import assert from "node:assert/strict";

import { githubFetch, serperGithubSearch } from "../src/lib/github/api";

test("serperGithubSearch aborts hanging requests after timeout", async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = process.env.SERPER_REQUEST_TIMEOUT_MS;
  process.env.SERPER_REQUEST_TIMEOUT_MS = "5";

  let aborted = false;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    return await new Promise<Response>((_resolve, reject) => {
      if (signal?.aborted) {
        aborted = true;
        reject(signal.reason ?? new Error("aborted"));
        return;
      }
      signal?.addEventListener(
        "abort",
        () => {
          aborted = true;
          reject(signal.reason ?? new Error("aborted"));
        },
        { once: true },
      );
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      serperGithubSearch("serper-test-key", "Alice Example GitHub"),
      /timed out/i,
    );
    assert.equal(aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTimeout === undefined) {
      delete process.env.SERPER_REQUEST_TIMEOUT_MS;
    } else {
      process.env.SERPER_REQUEST_TIMEOUT_MS = originalTimeout;
    }
  }
});

test("githubFetch aborts hanging requests after timeout", async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = process.env.GITHUB_REQUEST_TIMEOUT_MS;
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_REQUEST_TIMEOUT_MS = "5";
  process.env.GITHUB_TOKEN = "github-test-token";

  let aborted = false;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const signal = init?.signal;
    return await new Promise<Response>((_resolve, reject) => {
      if (signal?.aborted) {
        aborted = true;
        reject(signal.reason ?? new Error("aborted"));
        return;
      }
      signal?.addEventListener(
        "abort",
        () => {
          aborted = true;
          reject(signal.reason ?? new Error("aborted"));
        },
        { once: true },
      );
    });
  }) as typeof fetch;

  try {
    await assert.rejects(githubFetch("/users/octocat"), /timed out/i);
    assert.equal(aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTimeout === undefined) {
      delete process.env.GITHUB_REQUEST_TIMEOUT_MS;
    } else {
      process.env.GITHUB_REQUEST_TIMEOUT_MS = originalTimeout;
    }
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  }
});
