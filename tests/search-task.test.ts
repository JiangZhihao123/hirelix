import test from "node:test";
import assert from "node:assert/strict";
import { getSearchTaskEtaCopy } from "../src/lib/search-task.ts";

test("getSearchTaskEtaCopy keeps accepted searches scoped to brief parsing", () => {
  assert.equal(
    getSearchTaskEtaCopy("queued", "accepted"),
    "Brief parsing usually finishes in under 1 minute",
  );
});

test("getSearchTaskEtaCopy sets realistic recall expectations once the brief is ready", () => {
  assert.equal(
    getSearchTaskEtaCopy("searching", "provider_recall"),
    "Usually 3-6 minutes from submission",
  );
});

test("getSearchTaskEtaCopy keeps deep scoring reassurance copy", () => {
  assert.equal(
    getSearchTaskEtaCopy("deep_scoring", "shortlist_ready"),
    "Shortlist ready now; background refinement may take 1-3 more minutes",
  );
});
