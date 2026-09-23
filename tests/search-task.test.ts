import test from "node:test";
import assert from "node:assert/strict";
import { getSearchTaskEtaCopy, getSearchTaskStage } from "../src/lib/search-task";

test("deep scoring waits for a visible candidate before marking the shortlist ready", () => {
  assert.equal(getSearchTaskStage({ status: "deep_scoring", partial_ready_at: null }), "reviewing_profiles");
  assert.equal(getSearchTaskStage({ status: "deep_scoring", partial_ready_at: "2026-09-23T10:00:00Z" }), "shortlist_ready");
});

test("getSearchTaskEtaCopy keeps accepted searches scoped to brief parsing", () => {
  assert.equal(
    getSearchTaskEtaCopy("queued", "accepted"),
    "Brief parsing usually finishes in under 1 minute",
  );
});

test("getSearchTaskEtaCopy sets realistic recall expectations once the brief is ready", () => {
  assert.equal(
    getSearchTaskEtaCopy("searching", "linkedin_scan"),
    "LinkedIn search usually takes 5-10 minutes",
  );
});

test("getSearchTaskEtaCopy keeps deep scoring reassurance copy", () => {
  assert.equal(
    getSearchTaskEtaCopy("deep_scoring", "shortlist_ready"),
    "Shortlist ready now; background refinement may take 1-3 more minutes",
  );
});
