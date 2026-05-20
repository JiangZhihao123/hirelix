import test from "node:test";
import assert from "node:assert/strict";

import { normalizePublicEvidenceJobTimestampFields } from "../src/lib/public-evidence-jobs";

test("normalizePublicEvidenceJobTimestampFields converts ISO strings for Drizzle timestamp columns", () => {
  const patch = normalizePublicEvidenceJobTimestampFields({
    available_at: "2026-05-20T03:12:04.000Z",
    finished_at: "2026-05-20T03:12:05.000Z",
    locked_at: null,
    last_error: "provider failed",
  });

  assert.ok(patch.available_at instanceof Date);
  assert.ok(patch.finished_at instanceof Date);
  assert.equal((patch.available_at as Date).toISOString(), "2026-05-20T03:12:04.000Z");
  assert.equal((patch.finished_at as Date).toISOString(), "2026-05-20T03:12:05.000Z");
  assert.equal(patch.locked_at, null);
  assert.equal(patch.last_error, "provider failed");
});
