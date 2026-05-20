import test from "node:test";
import assert from "node:assert/strict";

import {
  BILLING_PLANS,
  CONTACT_PACK,
  getPlanStatusCopy,
  SEARCH_PACK,
  type BillingSummary,
} from "../src/lib/billing";

function makeBillingSummary(
  planCode: keyof typeof BILLING_PLANS,
  overrides: Partial<BillingSummary["usage"]> = {},
): BillingSummary {
  const plan = BILLING_PLANS[planCode];
  const searchesUsed = overrides.searchesUsed ?? 0;
  const enrichesUsed = overrides.enrichesUsed ?? 0;
  return {
    plan,
    subscription: {
      planCode,
      status: "active",
      billingCycle: plan.billingCycle,
      startedAt: null,
      renewsAt: null,
    },
    usage: {
      periodStart: "2026-05-01T00:00:00.000Z",
      periodEnd: "2026-06-01T00:00:00.000Z",
      searchesUsed,
      searchesLimit: overrides.searchesLimit ?? plan.searchesPerMonth,
      searchesRemaining:
        overrides.searchesRemaining ?? Math.max(plan.searchesPerMonth - searchesUsed, 0),
      enrichesUsed,
      enrichesLimit: overrides.enrichesLimit ?? plan.enrichesPerMonth,
      enrichesRemaining:
        overrides.enrichesRemaining ?? Math.max(plan.enrichesPerMonth - enrichesUsed, 0),
      candidateLimitPerSearch:
        overrides.candidateLimitPerSearch ?? plan.candidateLimitPerSearch,
      exportEnabled: overrides.exportEnabled ?? plan.exportEnabled,
      clientBriefEnabled: overrides.clientBriefEnabled ?? plan.clientBriefEnabled,
      extraSearchCredits: overrides.extraSearchCredits ?? 0,
      extraEnrichCredits: overrides.extraEnrichCredits ?? 0,
    },
    checkout: {
      paddleEnabled: false,
      monthlyPriceIdConfigured: false,
      annualPriceIdConfigured: false,
      starterMonthlyPriceIdConfigured: false,
      starterAnnualPriceIdConfigured: false,
      businessPriceIdConfigured: false,
      agencyPriceIdConfigured: false,
      searchPackPriceIdConfigured: false,
      contactPackPriceIdConfigured: false,
    },
  };
}

test("MVP billing plans match solo headhunter packaging", () => {
  assert.equal(BILLING_PLANS.free.searchesPerMonth, 1);
  assert.equal(BILLING_PLANS.free.clientBriefEnabled, false);
  assert.equal(BILLING_PLANS.starter_monthly.name, "Solo");
  assert.equal(BILLING_PLANS.starter_monthly.priceLabel, "$149");
  assert.equal(BILLING_PLANS.starter_monthly.exportEnabled, true);
  assert.equal(BILLING_PLANS.starter_monthly.clientBriefEnabled, false);
  assert.equal(BILLING_PLANS.pro_monthly.priceLabel, "$249");
  assert.equal(BILLING_PLANS.pro_monthly.searchesPerMonth, 25);
  assert.equal(BILLING_PLANS.pro_monthly.clientBriefEnabled, true);
  assert.equal(BILLING_PLANS.pro_annual.priceLabel, "$199");
  assert.equal(SEARCH_PACK.credits, 3);
  assert.equal(SEARCH_PACK.priceLabel, "$49");
  assert.equal(CONTACT_PACK.credits, 50);
  assert.equal(CONTACT_PACK.priceLabel, "$49");
});

test("plan status copy describes shortlist actions for free and solo plans", () => {
  const freeCopy = getPlanStatusCopy(makeBillingSummary("free"));
  assert.equal(freeCopy.title, "Free plan");
  assert.match(freeCopy.usageLabel, /shortlist builds left/);
  assert.match(freeCopy.capabilityLabel, /real shortlist preview/);

  const soloCopy = getPlanStatusCopy(makeBillingSummary("starter_monthly"));
  assert.equal(soloCopy.title, "Solo");
  assert.match(soloCopy.capabilityLabel, /export/);
  assert.doesNotMatch(soloCopy.capabilityLabel, /client-ready briefs/);
});

test("plan status copy marks exhausted pro plan and includes client briefs", () => {
  const copy = getPlanStatusCopy(
    makeBillingSummary("pro_monthly", {
      searchesUsed: 25,
      searchesRemaining: 0,
    }),
  );
  assert.equal(copy.state, "warning");
  assert.equal(copy.usageLabel, "No shortlist builds left this cycle");
  assert.match(copy.capabilityLabel, /client-ready briefs/);
});
