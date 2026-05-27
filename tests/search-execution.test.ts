import assert from "node:assert/strict";
import test from "node:test";

import {
  FINAL_SHORTLIST_TARGET,
  getInitialSearchExecutionProfile,
  getInitialSearchTargets,
  getSearchExecutionProfile,
  normalizeSearchExecutionProfileName,
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

test("free searches use a constrained real-production preview profile", () => {
  const profile = getInitialSearchExecutionProfile("free");

  assert.equal(profile.name, "bright_free_preview");
  assert.equal(profile.mode, "production");
  assert.ok(profile.filterLimit >= FINAL_SHORTLIST_TARGET);
  assert.equal(profile.hiddenGemLimit, 0);
  assert.equal(profile.companyTargetLimit, 0);

  const targets = getInitialSearchTargets("free");
  assert.equal(targets.executionProfile, "bright_free_preview");
  assert.equal(targets.candidateCount, FINAL_SHORTLIST_TARGET);
  assert.equal(targets.highlightCount, 3);
});

test("paid searches keep the full production profile in production mode", () => {
  const profile = withProductionEnv(() => getInitialSearchExecutionProfile("pro_monthly"));

  assert.equal(profile.name, "bright_production_full");
  assert.equal(profile.mode, "production");
  assert.ok(profile.filterLimit >= 100);

  const targets = withProductionEnv(() => getInitialSearchTargets("agency_monthly"));
  assert.equal(targets.executionProfile, "bright_production_full");
  assert.equal(targets.candidateCount, FINAL_SHORTLIST_TARGET);
});

test("every plan resolves to the same final 25-person shortlist target", () => {
  const planCodes = [
    "free",
    "starter_monthly",
    "starter_annual",
    "pro_monthly",
    "pro_annual",
    "business_monthly",
    "agency_monthly",
  ] as const;

  for (const planCode of planCodes) {
    const targets = getInitialSearchTargets(planCode);
    assert.equal(targets.candidateCount, FINAL_SHORTLIST_TARGET);
    assert.equal(targets.displayCount, FINAL_SHORTLIST_TARGET);
  }
});

test("stored profile normalization accepts the free preview profile", () => {
  assert.equal(normalizeSearchExecutionProfileName("bright_free_preview"), "bright_free_preview");
  assert.ok(getSearchExecutionProfile("bright_free_preview").filterLimit >= FINAL_SHORTLIST_TARGET);
});
