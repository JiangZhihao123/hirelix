import assert from "node:assert/strict";
import test from "node:test";

import {
  createSearchShareToken,
  hashSearchShareToken,
  isValidSearchShareToken,
} from "@/lib/search-share";

test("search share tokens are strong, URL-safe, and stored only as a hash", () => {
  const token = createSearchShareToken();
  assert.equal(isValidSearchShareToken(token), true);
  assert.equal(token.length, 43);
  assert.match(hashSearchShareToken(token), /^[a-f0-9]{64}$/);
  assert.notEqual(hashSearchShareToken(token), token);
});
