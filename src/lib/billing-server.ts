import { and, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_usage_events, hirelix_user_settings } from "@/db/schema";
import {
  clampRemaining,
  getBillingPeriodBounds,
  getCheckoutConfig,
  getEffectivePlanCode,
  getPlan,
  normalizeBillingStatus,
  type BillingSummary,
  type BillingStatus,
} from "@/lib/billing";
import { getLogger } from "@/lib/logger";

const billingLogger = getLogger({ component: "billing_server" });

export async function getBillingSummaryForUser(userId: string): Promise<BillingSummary> {
  const { startIso, endIso } = getBillingPeriodBounds();
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);

  const [settingsRows, searchesUsedRows, enrichesUsedRows] = await Promise.all([
    db
      .select({
        subscription_plan: hirelix_user_settings.subscription_plan,
        subscription_status: hirelix_user_settings.subscription_status,
        billing_cycle: hirelix_user_settings.billing_cycle,
        subscription_started_at: hirelix_user_settings.subscription_started_at,
        subscription_renews_at: hirelix_user_settings.subscription_renews_at,
        extra_search_credits: hirelix_user_settings.extra_search_credits,
        extra_enrich_credits: hirelix_user_settings.extra_enrich_credits,
      })
      .from(hirelix_user_settings)
      .where(eq(hirelix_user_settings.user_id, userId))
      .limit(1),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(hirelix_usage_events)
      .where(
        and(
          eq(hirelix_usage_events.user_id, userId),
          eq(hirelix_usage_events.event_type, "search_created"),
          gte(hirelix_usage_events.created_at, startDate),
          lt(hirelix_usage_events.created_at, endDate),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(hirelix_usage_events)
      .where(
        and(
          eq(hirelix_usage_events.user_id, userId),
          eq(hirelix_usage_events.event_type, "candidate_enriched"),
          gte(hirelix_usage_events.created_at, startDate),
          lt(hirelix_usage_events.created_at, endDate),
        ),
      ),
  ]);

  const settings = settingsRows[0] ?? null;
  const searchesUsed = searchesUsedRows[0]?.count ?? 0;
  const enrichesUsed = enrichesUsedRows[0]?.count ?? 0;

  const planCode = getEffectivePlanCode(
    settings?.subscription_plan,
    settings?.subscription_status,
  );
  const plan = getPlan(planCode);
  const extraSearchCredits = settings?.extra_search_credits ?? 0;
  const extraEnrichCredits = settings?.extra_enrich_credits ?? 0;
  const searchLimit = plan.searchesPerMonth + extraSearchCredits;
  const enrichLimit = plan.enrichesPerMonth + extraEnrichCredits;
  const normalizedStatus: BillingStatus = normalizeBillingStatus(
    settings?.subscription_status,
  );
  const checkout = getCheckoutConfig();
  const missingConfiguredPrices = [
    ["starter_monthly", checkout.starterMonthlyPriceId],
    ["starter_annual", checkout.starterAnnualPriceId],
    ["pro_monthly", checkout.monthlyPriceId],
    ["pro_annual", checkout.annualPriceId],
    ["business_monthly", checkout.businessPriceId],
    ["agency_monthly", checkout.agencyPriceId],
    ["search_pack", checkout.searchPackPriceId],
    ["contact_pack", checkout.contactPackPriceId],
  ]
    .filter(([, priceId]) => !priceId)
    .map(([key]) => key);

  if (
    missingConfiguredPrices.length > 0 &&
    (checkout.enabled || process.env.NODE_ENV === "production")
  ) {
    billingLogger.warn(
      { missing_prices: missingConfiguredPrices },
      "Paddle checkout is enabled but some price ids are missing",
    );
  }

  const summary: BillingSummary = {
    plan,
    subscription: {
      planCode,
      status: normalizedStatus,
      billingCycle:
        settings?.billing_cycle === "month" || settings?.billing_cycle === "year"
          ? settings.billing_cycle
          : plan.billingCycle,
      startedAt: settings?.subscription_started_at
        ? settings.subscription_started_at.toISOString()
        : null,
      renewsAt: settings?.subscription_renews_at
        ? settings.subscription_renews_at.toISOString()
        : null,
    },
    usage: {
      periodStart: startIso,
      periodEnd: endIso,
      searchesUsed,
      searchesLimit: searchLimit,
      searchesRemaining: clampRemaining(searchLimit, searchesUsed),
      enrichesUsed,
      enrichesLimit: enrichLimit,
      enrichesRemaining: clampRemaining(enrichLimit, enrichesUsed),
      candidateLimitPerSearch: plan.candidateLimitPerSearch,
      exportEnabled: plan.exportEnabled,
      clientBriefEnabled: plan.clientBriefEnabled,
      extraSearchCredits,
      extraEnrichCredits,
    },
    checkout: {
      paddleEnabled: checkout.enabled,
      monthlyPriceIdConfigured: Boolean(checkout.monthlyPriceId),
      annualPriceIdConfigured: Boolean(checkout.annualPriceId),
      starterMonthlyPriceIdConfigured: Boolean(checkout.starterMonthlyPriceId),
      starterAnnualPriceIdConfigured: Boolean(checkout.starterAnnualPriceId),
      businessPriceIdConfigured: Boolean(checkout.businessPriceId),
      agencyPriceIdConfigured: Boolean(checkout.agencyPriceId),
      searchPackPriceIdConfigured: Boolean(checkout.searchPackPriceId),
      contactPackPriceIdConfigured: Boolean(checkout.contactPackPriceId),
    },
  };

  return summary;
}
