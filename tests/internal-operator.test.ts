import assert from "node:assert/strict";
import test from "node:test";

import {
  getInternalProfileScanBudget,
  isInternalOperatorEmail,
} from "@/lib/internal-operator";

test("internal operator access is email allowlisted and case insensitive", () => {
  const env = { HIRELIX_INTERNAL_OPERATOR_EMAILS: "operator@example.com, TEAM@example.com" };
  assert.equal(isInternalOperatorEmail("team@example.com", env), true);
  assert.equal(isInternalOperatorEmail("customer@example.com", env), false);
});

test("internal profile scan budget is bounded", () => {
  assert.equal(getInternalProfileScanBudget({}), 500);
  assert.equal(getInternalProfileScanBudget({ HIRELIX_INTERNAL_PROFILE_SCAN_BUDGET: "10" }), 50);
  assert.equal(getInternalProfileScanBudget({ HIRELIX_INTERNAL_PROFILE_SCAN_BUDGET: "9000" }), 2000);
});
