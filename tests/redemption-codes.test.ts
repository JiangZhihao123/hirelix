import test from "node:test";
import assert from "node:assert/strict";

import {
  addRedemptionDays,
  generateRedemptionCode,
  getRedemptionCodePrefix,
  hashRedemptionCode,
  normalizeRedemptionCode,
} from "../src/lib/redemption-codes";
import { getRedemptionErrorMessage } from "../src/lib/redemption-server";

test("redemption codes are readable, normalized, and hashed", () => {
  const code = generateRedemptionCode();
  assert.match(code, /^HIRELIX-BETA-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(normalizeRedemptionCode(` ${code.toLowerCase()} `), code);
  assert.equal(getRedemptionCodePrefix(code), code.slice(0, -5));
  assert.match(hashRedemptionCode(code), /^[a-f0-9]{64}$/);
  assert.notEqual(hashRedemptionCode(code), code);
});

test("redemption code normalization rejects malformed values", () => {
  assert.equal(normalizeRedemptionCode(null), null);
  assert.equal(normalizeRedemptionCode("HIRELIX-BETA-BAD"), null);
  assert.equal(normalizeRedemptionCode("HIRELIX-BETA-0000-0000"), null);
});

test("starter redemption lasts exactly 30 days", () => {
  const startsAt = new Date("2026-08-25T10:00:00.000Z");
  assert.equal(addRedemptionDays(startsAt, 30).toISOString(), "2026-09-24T10:00:00.000Z");
});

test("redemption failures return safe customer-facing messages", () => {
  assert.match(getRedemptionErrorMessage("invalid_code"), /valid/i);
  assert.match(getRedemptionErrorMessage("already_redeemed"), /already/i);
  assert.match(getRedemptionErrorMessage("paid_subscription_active"), /paid subscription/i);
  assert.match(getRedemptionErrorMessage("code_unavailable"), /unavailable/i);
});
