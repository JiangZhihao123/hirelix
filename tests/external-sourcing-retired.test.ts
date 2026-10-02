import { test } from "node:test";
import assert from "node:assert/strict";
import { EXTERNAL_SOURCING_ENABLED } from "../src/lib/external-sourcing";
import { enqueueSearchJob, kickSearchJobRunner } from "../src/lib/search/job-queue";
import { processNextSearchJob } from "../src/lib/search-jobs";

test("retired sourcing cannot enqueue or execute work even with old scheduler configuration", async () => {
  const prior = process.env.SEARCH_JOB_RUNNER_KICK_ENABLED;
  const db = process.env.DATABASE_URL;
  process.env.SEARCH_JOB_RUNNER_KICK_ENABLED = "true";
  delete process.env.DATABASE_URL;
  try {
    assert.equal(EXTERNAL_SOURCING_ENABLED, false);
    await assert.rejects(enqueueSearchJob({searchId:"retired",userId:"retired",jdText:"No external request should run",candidateCount:100}), /no longer available/);
    assert.deepEqual(await processNextSearchJob(), {processed:false,hasMore:false});
    assert.equal(kickSearchJobRunner("https://invalid.example"), undefined);
  } finally {
    if (prior === undefined) delete process.env.SEARCH_JOB_RUNNER_KICK_ENABLED; else process.env.SEARCH_JOB_RUNNER_KICK_ENABLED = prior;
    if (db === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = db;
  }
});
