import test from "node:test";
import assert from "node:assert/strict";

import {
  getPublicEvidenceJobTimeoutMs,
  normalizePublicEvidenceJobTimestampFields,
  shouldRefreshLinkedInOutreachAfterResearch,
} from "../src/lib/public-evidence-jobs";

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

test("getPublicEvidenceJobTimeoutMs bounds configurable job timeout", () => {
  assert.equal(getPublicEvidenceJobTimeoutMs({}), 240_000);
  assert.equal(getPublicEvidenceJobTimeoutMs({ PUBLIC_EVIDENCE_JOB_TIMEOUT_MS: "120000" }), 120_000);
  assert.equal(getPublicEvidenceJobTimeoutMs({ PUBLIC_EVIDENCE_JOB_TIMEOUT_MS: "1000" }), 30_000);
  assert.equal(getPublicEvidenceJobTimeoutMs({ PUBLIC_EVIDENCE_JOB_TIMEOUT_MS: "999999" }), 240_000);
  assert.equal(getPublicEvidenceJobTimeoutMs({ PUBLIC_EVIDENCE_JOB_TIMEOUT_MS: "wat" }), 240_000);
});

test("researched outreach refreshes only when candidate research produced sellable evidence", () => {
  assert.equal(shouldRefreshLinkedInOutreachAfterResearch({
    selling_kit: { evidence_basis: "public_evidence" },
  }), true);
  assert.equal(shouldRefreshLinkedInOutreachAfterResearch({
    selling_kit: { evidence_basis: "linkedin_based" },
  }), false);
  assert.equal(shouldRefreshLinkedInOutreachAfterResearch({}), false);
});
