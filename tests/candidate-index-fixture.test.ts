import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("Zillow validation JD is frozen with a matching content hash", () => {
  const fixturePath = path.resolve("tests/fixtures/zillow-agentic-ai-jd.json");
  const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
  const jdText = String(fixture.jd_text || "");
  assert.equal(fixture.job_requisition_id, "P749437");
  assert.equal(fixture.country_code, "US");
  assert.equal(fixture.remote_type, "Remote");
  assert.equal(createHash("sha256").update(jdText).digest("hex"), fixture.content_sha256);
  assert.match(jdText, /production ML systems/i);
  assert.match(jdText, /agent frameworks/i);
});

