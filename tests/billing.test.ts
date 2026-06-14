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
  const clientRolesUsed = overrides.clientRolesUsed ?? overrides.searchesUsed ?? 0;
  const clientRolesLimit = overrides.clientRolesLimit ?? overrides.searchesLimit ?? plan.searchesPerMonth;
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
      clientRolesUsed,
      clientRolesLimit,
      clientRolesRemaining:
        overrides.clientRolesRemaining ?? overrides.searchesRemaining ?? Math.max(clientRolesLimit - clientRolesUsed, 0),
      searchesUsed: clientRolesUsed,
      searchesLimit: clientRolesLimit,
      searchesRemaining:
        overrides.searchesRemaining ?? overrides.clientRolesRemaining ?? Math.max(clientRolesLimit - clientRolesUsed, 0),
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
      proMonthlyPriceIdConfigured: false,
      proAnnualPriceIdConfigured: false,
      starterMonthlyPriceIdConfigured: false,
      starterAnnualPriceIdConfigured: false,
    },
  };
}

test("billing plans expose free, starter, and pro client-role tiers", () => {
  assert.equal(BILLING_PLANS.free.profileScansPerMonth, 250);
  assert.equal(BILLING_PLANS.free.clientBriefEnabled, false);
  assert.equal(BILLING_PLANS.free.candidateLimitPerSearch, 25);
  assert.equal(BILLING_PLANS.free.emailLookupsPerMonth, 0);
  assert.equal(BILLING_PLANS.free.searchesPerMonth, 1);
  assert.deepEqual(
    [...CUSTOMER_BILLING_PLAN_CODES],
    ["starter_annual", "starter_monthly", "pro_annual", "pro_monthly"],
  );
  assert.equal(BILLING_PLANS.starter_monthly.name, "Starter");
  assert.equal(BILLING_PLANS.starter_monthly.priceLabel, "$149");
  assert.equal(BILLING_PLANS.starter_monthly.searchesPerMonth, 3);
  assert.equal(BILLING_PLANS.starter_monthly.candidateLimitPerSearch, 25);
  assert.equal(BILLING_PLANS.starter_monthly.profileScansPerMonth, 4000);
  assert.equal(BILLING_PLANS.starter_monthly.emailLookupsPerMonth, 100);
  assert.equal(BILLING_PLANS.starter_monthly.publicEvidenceDeepDivesPerMonth, 50);
  assert.equal(BILLING_PLANS.starter_monthly.exportEnabled, true);
  assert.equal(BILLING_PLANS.starter_monthly.clientBriefEnabled, true);
  assert.equal(BILLING_PLANS.starter_annual.name, "Starter");
  assert.equal(BILLING_PLANS.starter_annual.priceLabel, "$99");
  assert.equal(BILLING_PLANS.starter_annual.priceCents, 118800);
  assert.equal(BILLING_PLANS.starter_annual.candidateLimitPerSearch, 25);
  assert.equal(BILLING_PLANS.starter_annual.emailLookupsPerMonth, 100);
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
  assert.equal(BILLING_PLANS.pro_monthly.name, "Pro");
  assert.equal(BILLING_PLANS.pro_monthly.priceLabel, "$399");
  assert.equal(BILLING_PLANS.pro_monthly.searchesPerMonth, 10);
  assert.equal(BILLING_PLANS.pro_monthly.profileScansPerMonth, 15000);
  assert.equal(BILLING_PLANS.pro_monthly.emailLookupsPerMonth, 500);
  assert.equal(BILLING_PLANS.pro_monthly.publicEvidenceDeepDivesPerMonth, 250);
  assert.equal(BILLING_PLANS.pro_annual.priceLabel, "$299");
  assert.equal(BILLING_PLANS.pro_annual.priceCents, 358800);
  assert.equal(BILLING_PLANS.pro_annual.profileScansPerMonth, 15000);
  assert.equal(BILLING_PLANS.pro_annual.emailLookupsPerMonth, 500);
});

test("plan status copy describes candidate pool actions for free and paid plans", () => {
  const freeCopy = getPlanStatusCopy(makeBillingSummary("free"));
  assert.equal(freeCopy.title, "Free plan");
  assert.match(freeCopy.usageLabel, /targeted scans left/);
  assert.match(freeCopy.usageLabel, /client roles/);
  assert.match(freeCopy.capabilityLabel, /250 targeted profile scans/);
  assert.match(freeCopy.capabilityLabel, /ranked candidate pool/);

  const monthlyCopy = getPlanStatusCopy(makeBillingSummary("starter_monthly"));
  assert.equal(monthlyCopy.title, "Starter");
  assert.match(monthlyCopy.capabilityLabel, /AI sourcing budget/);
  assert.match(monthlyCopy.capabilityLabel, /client-ready briefs/);
  assert.match(monthlyCopy.capabilityLabel, /3 client roles/);
});

test("plan status copy marks exhausted paid plan", () => {
  const copy = getPlanStatusCopy(
    makeBillingSummary("starter_monthly", {
      profileScansUsed: 4000,
      profileScansRemaining: 0,
    }),
  );
  assert.equal(copy.state, "warning");
  assert.equal(copy.usageLabel, "No targeted profile scans left this cycle");
  assert.match(copy.capabilityLabel, /client-ready briefs/);
});

test("plan status copy marks exhausted client roles separately from scan pool", () => {
  const copy = getPlanStatusCopy(
    makeBillingSummary("starter_monthly", {
      clientRolesUsed: 3,
      clientRolesRemaining: 0,
      profileScansUsed: 500,
      profileScansRemaining: 3500,
    }),
  );
  assert.equal(copy.state, "warning");
  assert.equal(copy.usageLabel, "No client roles left this cycle");
});

test("count labels use singular copy for one remaining unit", () => {
  assert.equal(formatCountLabel(1, "candidate pool", "candidate pools"), "candidate pool");
  assert.equal(formatCountLabel(10, "candidate pool", "candidate pools"), "candidate pools");
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
  process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID = " pro_monthly \n";
  process.env.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID = " pro_annual \t";

  try {
    const config = getCheckoutConfig();
    assert.equal(config.clientToken, "token");
    assert.equal(config.starterMonthlyPriceId, "starter_monthly");
    assert.equal(config.starterAnnualPriceId, "starter_annual");
    assert.equal(config.proMonthlyPriceId, "pro_monthly");
    assert.equal(config.proAnnualPriceId, "pro_annual");
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
