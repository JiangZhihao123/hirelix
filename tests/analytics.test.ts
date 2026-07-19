import test from "node:test";
import assert from "node:assert/strict";

import { isRecentSignup } from "../src/lib/analytics";

test("isRecentSignup distinguishes a new OAuth user from a returning user", () => {
  const now = Date.parse("2026-07-19T12:00:00.000Z");

  assert.equal(isRecentSignup("2026-07-19T11:55:00.000Z", now), true);
  assert.equal(isRecentSignup("2026-07-18T12:00:00.000Z", now), false);
  assert.equal(isRecentSignup("not-a-date", now), false);
  assert.equal(isRecentSignup(null, now), false);
});
