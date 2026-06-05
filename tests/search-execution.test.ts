import assert from "node:assert/strict";
import test from "node:test";

import { BILLING_PLANS } from "@/lib/billing";
import {
  FINAL_SHORTLIST_TARGET,
  DEFAULT_SEARCH_PROFILE_SCAN_EXPAND_INCREMENT,
  getInitialSearchExecutionProfile,
  getInitialSearchTargets,
  getSearchExecutionProfile,
  normalizeSearchExecutionProfileName,
  resolveExpandedProfileScanBudget,
} from "@/lib/search-execution";

function withProductionEnv<T>(fn: () => T): T {
  const previous = process.env.SEARCH_EXECUTION_MODE;
  process.env.SEARCH_EXECUTION_MODE = "production";
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env.SEARCH_EXECUTION_MODE;
    } else {
      process.env.SEARCH_EXECUTION_MODE = previous;
    }
  }
}

function withDefaultFreeScanEnv<T>(fn: () => T): T {
  const keys = [
    "SEARCH_FREE_BRIGHTDATA_STANDARD_LIMIT",
    "SEARCH_FREE_BRIGHTDATA_HIDDEN_GEM_LIMIT",
    "SEARCH_FREE_BRIGHTDATA_COMPANY_TARGET_LIMIT",
  ] as const;
  const previous = new Map<string, string | undefined>(
    keys.map((key) => [key, process.env[key]]),
  );
  for (const key of keys) delete process.env[key];
  try {
    return fn();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("free searches use a constrained real-production preview profile", () => {
  const profile = withDefaultFreeScanEnv(() => getInitialSearchExecutionProfile("free"));

  assert.equal(profile.name, "bright_free_preview");
  assert.equal(profile.mode, "production");
  assert.ok(profile.filterLimit >= FINAL_SHORTLIST_TARGET);
  assert.ok(profile.hiddenGemLimit > 0);
  assert.ok(profile.companyTargetLimit > 0);

  const targets = withDefaultFreeScanEnv(() => getInitialSearchTargets("free"));
  assert.equal(targets.executionProfile, "bright_free_preview");
  assert.equal(targets.candidateCount, FINAL_SHORTLIST_TARGET);
  assert.equal(targets.highlightCount, 3);
  assert.equal(targets.profileScanBudget, BILLING_PLANS.free.profileScansPerMonth);
  assert.equal(
    targets.profileScanBudget,
    profile.filterLimit + profile.hiddenGemLimit + profile.companyTargetLimit,
  );
});

test("paid searches keep the full production profile in production mode", () => {
  const profile = withProductionEnv(() => getInitialSearchExecutionProfile("pro_monthly"));

  assert.equal(profile.name, "bright_production_full");
  assert.equal(profile.mode, "production");
  assert.ok(profile.filterLimit >= 100);
  assert.ok(profile.hiddenGemLimit > 0);
  assert.ok(profile.companyTargetLimit > 0);

  const targets = withProductionEnv(() => getInitialSearchTargets("agency_monthly"));
  assert.equal(targets.executionProfile, "bright_production_full");
  assert.equal(targets.candidateCount, FINAL_SHORTLIST_TARGET);
  assert.equal(
    targets.profileScanBudget,
    profile.filterLimit + profile.hiddenGemLimit + profile.companyTargetLimit,
  );
});

test("free plans use the same candidate quality target while constraining targeted profile scans", () => {
  const freeTargets = getInitialSearchTargets("free");
  assert.equal(freeTargets.candidateCount, FINAL_SHORTLIST_TARGET);
  assert.equal(freeTargets.displayCount, FINAL_SHORTLIST_TARGET);

  const paidPlanCodes = [
    "starter_monthly",
    "starter_annual",
    "pro_monthly",
    "pro_annual",
    "business_monthly",
    "agency_monthly",
  ] as const;

  for (const planCode of paidPlanCodes) {
    const targets = getInitialSearchTargets(planCode);
    assert.equal(targets.candidateCount, FINAL_SHORTLIST_TARGET);
    assert.equal(targets.displayCount, FINAL_SHORTLIST_TARGET);
  }
});

test("stored profile normalization accepts the free preview profile", () => {
  assert.equal(normalizeSearchExecutionProfileName("bright_free_preview"), "bright_free_preview");
  assert.ok(getSearchExecutionProfile("bright_free_preview").filterLimit >= FINAL_SHORTLIST_TARGET);
});

test("expanded profile scan budgets use one paid batch or remaining scans", () => {
  assert.equal(DEFAULT_SEARCH_PROFILE_SCAN_EXPAND_INCREMENT, 500);
  assert.deepEqual(
    resolveExpandedProfileScanBudget({
      currentBudget: 500,
      remainingScans: 3500,
    }),
    {
      currentBudget: 500,
      additionalBudget: 500,
      nextBudget: 1000,
    },
  );
  assert.deepEqual(
    resolveExpandedProfileScanBudget({
      currentBudget: 3800,
      remainingScans: 200,
    }),
    {
      currentBudget: 3800,
      additionalBudget: 200,
      nextBudget: 4000,
    },
  );
  assert.deepEqual(
    resolveExpandedProfileScanBudget({
      currentBudget: 4000,
      remainingScans: 200,
      returnedProfiles: 2000,
    }),
    {
      currentBudget: 4000,
      additionalBudget: 0,
      nextBudget: 4000,
    },
  );
});
