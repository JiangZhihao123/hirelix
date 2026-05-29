import test from "node:test";
import assert from "node:assert/strict";

import {
  BILLING_PLANS,
  CUSTOMER_BILLING_PLAN_CODES,
  formatCountLabel,
  getCheckoutConfig,
  getPlanStatusCopy,
  type BillingSummary,
} from "../src/lib/billing";

function makeBillingSummary(
  planCode: keyof typeof BILLING_PLANS,
  overrides: Partial<BillingSummary["usage"]> = {},
): BillingSummary {
  const plan = BILLING_PLANS[planCode];
  const profileScansUsed = overrides.profileScansUsed ?? overrides.searchesUsed ?? 0;
  const emailLookupsUsed = overrides.emailLookupsUsed ?? overrides.enrichesUsed ?? 0;
  const publicEvidenceDeepDivesUsed = overrides.publicEvidenceDeepDivesUsed ?? 0;
  const profileScansLimit =
    overrides.profileScansLimit ?? overrides.searchesLimit ?? plan.profileScansPerMonth;
  const emailLookupsLimit =
    overrides.emailLookupsLimit ?? overrides.enrichesLimit ?? plan.emailLookupsPerMonth;
  const publicEvidenceDeepDivesLimit =
    overrides.publicEvidenceDeepDivesLimit ?? plan.publicEvidenceDeepDivesPerMonth;
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
      profileScansUsed,
      profileScansLimit,
      profileScansRemaining:
        overrides.profileScansRemaining ?? overrides.searchesRemaining ?? Math.max(profileScansLimit - profileScansUsed, 0),
      emailLookupsUsed,
      emailLookupsLimit,
      emailLookupsRemaining:
        overrides.emailLookupsRemaining ?? overrides.enrichesRemaining ?? Math.max(emailLookupsLimit - emailLookupsUsed, 0),
      publicEvidenceDeepDivesUsed,
      publicEvidenceDeepDivesLimit,
      publicEvidenceDeepDivesRemaining:
        overrides.publicEvidenceDeepDivesRemaining ?? Math.max(publicEvidenceDeepDivesLimit - publicEvidenceDeepDivesUsed, 0),
      searchesUsed: profileScansUsed,
      searchesLimit: profileScansLimit,
      searchesRemaining:
        overrides.searchesRemaining ?? overrides.profileScansRemaining ?? Math.max(profileScansLimit - profileScansUsed, 0),
      enrichesUsed: emailLookupsUsed,
      enrichesLimit: emailLookupsLimit,
      enrichesRemaining:
        overrides.enrichesRemaining ?? overrides.emailLookupsRemaining ?? Math.max(emailLookupsLimit - emailLookupsUsed, 0),
      candidateLimitPerSearch:
        overrides.candidateLimitPerSearch ?? plan.candidateLimitPerSearch,
      exportEnabled: overrides.exportEnabled ?? plan.exportEnabled,
      clientBriefEnabled: overrides.clientBriefEnabled ?? plan.clientBriefEnabled,
      extraSearchCredits: overrides.extraSearchCredits ?? 0,
      extraEnrichCredits: overrides.extraEnrichCredits ?? 0,
      extraProfileScans: overrides.extraProfileScans ?? overrides.extraSearchCredits ?? 0,
      extraEmailLookups: overrides.extraEmailLookups ?? overrides.extraEnrichCredits ?? 0,
    },
    checkout: {
      paddleEnabled: false,
      monthlyPriceIdConfigured: false,
      annualPriceIdConfigured: false,
      starterMonthlyPriceIdConfigured: false,
      starterAnnualPriceIdConfigured: false,
      businessPriceIdConfigured: false,
      agencyPriceIdConfigured: false,
    },
  };
}

test("MVP billing plans expose a free preview and two paid choices", () => {
  assert.equal(BILLING_PLANS.free.profileScansPerMonth, 150);
  assert.equal(BILLING_PLANS.free.clientBriefEnabled, false);
  assert.equal(BILLING_PLANS.free.candidateLimitPerSearch, 5);
  assert.equal(BILLING_PLANS.free.emailLookupsPerMonth, 0);
  assert.deepEqual([...CUSTOMER_BILLING_PLAN_CODES], ["starter_monthly", "starter_annual"]);
  assert.equal(BILLING_PLANS.starter_monthly.name, "Monthly");
  assert.equal(BILLING_PLANS.starter_monthly.priceLabel, "$149");
  assert.equal(BILLING_PLANS.starter_monthly.candidateLimitPerSearch, 25);
  assert.equal(BILLING_PLANS.starter_monthly.profileScansPerMonth, 4000);
  assert.equal(BILLING_PLANS.starter_monthly.emailLookupsPerMonth, 50);
  assert.equal(BILLING_PLANS.starter_monthly.publicEvidenceDeepDivesPerMonth, 25);
  assert.equal(BILLING_PLANS.starter_monthly.exportEnabled, true);
  assert.equal(BILLING_PLANS.starter_monthly.clientBriefEnabled, true);
  assert.equal(BILLING_PLANS.starter_annual.name, "Annual");
  assert.equal(BILLING_PLANS.starter_annual.priceLabel, "$99");
  assert.equal(BILLING_PLANS.starter_annual.priceCents, 118800);
  assert.equal(BILLING_PLANS.starter_annual.candidateLimitPerSearch, 25);
  assert.equal(BILLING_PLANS.starter_annual.emailLookupsPerMonth, 50);
  assert.equal(
    BILLING_PLANS.starter_annual.profileScansPerMonth,
    BILLING_PLANS.starter_monthly.profileScansPerMonth,
  );
  assert.equal(
    BILLING_PLANS.starter_annual.candidateLimitPerSearch,
    BILLING_PLANS.starter_monthly.candidateLimitPerSearch,
  );
  assert.equal(
    BILLING_PLANS.starter_annual.emailLookupsPerMonth,
    BILLING_PLANS.starter_monthly.emailLookupsPerMonth,
  );
  assert.equal(BILLING_PLANS.starter_annual.exportEnabled, true);
  assert.equal(BILLING_PLANS.starter_annual.clientBriefEnabled, true);
});

test("plan status copy describes shortlist actions for free and paid plans", () => {
  const freeCopy = getPlanStatusCopy(makeBillingSummary("free"));
  assert.equal(freeCopy.title, "Free plan");
  assert.match(freeCopy.usageLabel, /profile scans left/);
  assert.match(freeCopy.capabilityLabel, /up to 5 ranked candidates/);

  const monthlyCopy = getPlanStatusCopy(makeBillingSummary("starter_monthly"));
  assert.equal(monthlyCopy.title, "Monthly");
  assert.match(monthlyCopy.capabilityLabel, /profile scans/);
  assert.match(monthlyCopy.capabilityLabel, /client-ready briefs/);
});

test("plan status copy marks exhausted paid plan", () => {
  const copy = getPlanStatusCopy(
    makeBillingSummary("starter_monthly", {
      profileScansUsed: 4000,
      profileScansRemaining: 0,
    }),
  );
  assert.equal(copy.state, "warning");
  assert.equal(copy.usageLabel, "No profile scans left this cycle");
  assert.match(copy.capabilityLabel, /client-ready briefs/);
});

test("count labels use singular copy for one remaining unit", () => {
  assert.equal(formatCountLabel(1, "shortlist build", "shortlist builds"), "shortlist build");
  assert.equal(formatCountLabel(10, "shortlist build", "shortlist builds"), "shortlist builds");
});

test("getCheckoutConfig trims configured Paddle values", () => {
  const originalEnv = {
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
    NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID:
      process.env.NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID,
    NEXT_PUBLIC_PADDLE_STARTER_ANNUAL_PRICE_ID:
      process.env.NEXT_PUBLIC_PADDLE_STARTER_ANNUAL_PRICE_ID,
    NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID: process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID,
    NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID: process.env.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID,
  };

  process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = " token \n";
  process.env.NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID = " starter_monthly \n";
  process.env.NEXT_PUBLIC_PADDLE_STARTER_ANNUAL_PRICE_ID = " starter_annual \t";
  delete process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID;
  delete process.env.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID;

  try {
    const config = getCheckoutConfig();
    assert.equal(config.clientToken, "token");
    assert.equal(config.starterMonthlyPriceId, "starter_monthly");
    assert.equal(config.starterAnnualPriceId, "starter_annual");
    assert.equal(config.enabled, true);
  } finally {
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN = originalEnv.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    process.env.NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID =
      originalEnv.NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID;
    process.env.NEXT_PUBLIC_PADDLE_STARTER_ANNUAL_PRICE_ID =
      originalEnv.NEXT_PUBLIC_PADDLE_STARTER_ANNUAL_PRICE_ID;
    process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID = originalEnv.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID;
    process.env.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID = originalEnv.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID;
  }
});
