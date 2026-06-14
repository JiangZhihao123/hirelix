import { and, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_searches, hirelix_usage_events, hirelix_user_settings } from "@/db/schema";
import {
  clampRemaining,
  getBillingPeriodBounds,
  getCheckoutConfig,
  getEffectivePlanCode,
  getPlanEmailLookupsPerMonth,
  getPlanProfileScansPerMonth,
  getPlanPublicEvidenceDeepDivesPerMonth,
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

  const [settingsRows, usageEventRows, searchCountRows] = await Promise.all([
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
      .select({
        event_type: hirelix_usage_events.event_type,
        metadata: hirelix_usage_events.metadata,
      })
      .from(hirelix_usage_events)
      .where(
        and(
          eq(hirelix_usage_events.user_id, userId),
          gte(hirelix_usage_events.created_at, startDate),
          lt(hirelix_usage_events.created_at, endDate),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(hirelix_searches)
      .where(
        and(
          eq(hirelix_searches.user_id, userId),
          gte(hirelix_searches.created_at, startDate),
          lt(hirelix_searches.created_at, endDate),
        ),
      ),
  ]);

  const settings = settingsRows[0] ?? null;
  let profileScansUsed = 0;
  let emailLookupsUsed = 0;
  let publicEvidenceDeepDivesUsed = 0;

  for (const row of usageEventRows) {
    const metadata =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    const profileScans = getMetadataCount(metadata.profile_scans_used);
    const reservedProfileScans = getMetadataCount(metadata.profile_scans_reserved);
    const emailLookupCount = getMetadataCount(metadata.email_lookup_count);
    const publicEvidenceCount = getMetadataCount(metadata.public_evidence_deep_dive_count);

    if (row.event_type === "search_created") {
      const profileScanCount = Math.max(profileScans ?? 0, reservedProfileScans ?? 0);
      profileScansUsed += profileScanCount;
    } else if (row.event_type === "candidate_enriched") {
      emailLookupsUsed += emailLookupCount ?? 1;
    } else if (row.event_type === "public_evidence_deep_dive") {
      publicEvidenceDeepDivesUsed += publicEvidenceCount ?? 1;
    }
  }

  const planCode = getEffectivePlanCode(
    settings?.subscription_plan,
    settings?.subscription_status,
  );
  const plan = getPlan(planCode);
  const extraProfileScans = settings?.extra_search_credits ?? 0;
  const extraEmailLookups = settings?.extra_enrich_credits ?? 0;
  const baseProfileScansLimit = getPlanProfileScansPerMonth(plan);
  const emailLookupsLimit = getPlanEmailLookupsPerMonth(plan) + extraEmailLookups;
  const publicEvidenceDeepDivesLimit = getPlanPublicEvidenceDeepDivesPerMonth(plan);
  const clientRolesUsed = Math.max(0, searchCountRows[0]?.count ?? 0);
  const clientRolesLimit = plan.searchesPerMonth;
  const freePreviewUsed = plan.code === "free" && profileScansUsed > 0;
  const profileScansLimit = freePreviewUsed
    ? Math.min(profileScansUsed, baseProfileScansLimit + extraProfileScans)
    : baseProfileScansLimit + extraProfileScans;
  const normalizedStatus: BillingStatus = normalizeBillingStatus(
    settings?.subscription_status,
  );
  const checkout = getCheckoutConfig();
  const missingConfiguredPrices = [
    ["starter_monthly", checkout.starterMonthlyPriceId],
    ["starter_annual", checkout.starterAnnualPriceId],
    ["pro_monthly", checkout.proMonthlyPriceId],
    ["pro_annual", checkout.proAnnualPriceId],
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
      profileScansUsed,
      profileScansLimit,
      profileScansRemaining: clampRemaining(profileScansLimit, profileScansUsed),
      emailLookupsUsed,
      emailLookupsLimit,
      emailLookupsRemaining: clampRemaining(emailLookupsLimit, emailLookupsUsed),
      publicEvidenceDeepDivesUsed,
      publicEvidenceDeepDivesLimit,
      publicEvidenceDeepDivesRemaining: clampRemaining(
        publicEvidenceDeepDivesLimit,
        publicEvidenceDeepDivesUsed,
      ),
      clientRolesUsed,
      clientRolesLimit,
      clientRolesRemaining: clampRemaining(clientRolesLimit, clientRolesUsed),
      searchesUsed: clientRolesUsed,
      searchesLimit: clientRolesLimit,
      searchesRemaining: clampRemaining(clientRolesLimit, clientRolesUsed),
      enrichesUsed: emailLookupsUsed,
      enrichesLimit: emailLookupsLimit,
      enrichesRemaining: clampRemaining(emailLookupsLimit, emailLookupsUsed),
      exportEnabled: plan.exportEnabled,
      clientBriefEnabled: plan.clientBriefEnabled,
      extraSearchCredits: extraProfileScans,
      extraEnrichCredits: extraEmailLookups,
      extraProfileScans,
      extraEmailLookups,
    },
    checkout: {
      paddleEnabled: checkout.enabled,
      proMonthlyPriceIdConfigured: Boolean(checkout.proMonthlyPriceId),
      proAnnualPriceIdConfigured: Boolean(checkout.proAnnualPriceId),
      starterMonthlyPriceIdConfigured: Boolean(checkout.starterMonthlyPriceId),
      starterAnnualPriceIdConfigured: Boolean(checkout.starterAnnualPriceId),
    },
  };

  return summary;
}

function getMetadataCount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}
