import { and, eq, gt, gte, lt, lte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  hirelix_redemptions,
  hirelix_searches,
  hirelix_usage_events,
  hirelix_user_settings,
} from "@/db/schema";
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

type PaddlePortalSessionResponse = {
  data?: {
    urls?: {
      general?: {
        overview?: unknown;
      };
      subscriptions?: Array<{
        id?: unknown;
        cancel_subscription?: unknown;
        update_subscription_payment_method?: unknown;
      }>;
    };
  };
  error?: {
    detail?: unknown;
    message?: unknown;
  };
};

export async function getBillingSummaryForUser(userId: string): Promise<BillingSummary> {
  const now = new Date();
  const [settingsRows, redemptionRows] = await Promise.all([
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
        benefit_plan: hirelix_redemptions.benefit_plan,
        starts_at: hirelix_redemptions.starts_at,
        ends_at: hirelix_redemptions.ends_at,
      })
      .from(hirelix_redemptions)
      .where(
        and(
          eq(hirelix_redemptions.user_id, userId),
          eq(hirelix_redemptions.status, "active"),
          lte(hirelix_redemptions.starts_at, now),
          gt(hirelix_redemptions.ends_at, now),
        ),
      )
      .limit(1),
  ]);

  const settings = settingsRows[0] ?? null;
  const paidPlanCode = getEffectivePlanCode(
    settings?.subscription_plan,
    settings?.subscription_status,
  );
  const redemption = paidPlanCode === "free" ? redemptionRows[0] ?? null : null;
  const redemptionActive = redemption?.benefit_plan === "starter_monthly";
  const planCode = redemptionActive ? "starter_monthly" : paidPlanCode;
  const plan = getPlan(planCode);
  const calendarBounds = getBillingPeriodBounds(now);
  const startDate = redemptionActive ? redemption.starts_at : new Date(calendarBounds.startIso);
  const endDate = redemptionActive ? redemption.ends_at : new Date(calendarBounds.endIso);
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  const [usageEventRows, searchCountRows] = await Promise.all([
    db
      .select({
        related_id: hirelix_usage_events.related_id,
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
  let profileScansUsed = 0;
  let emailLookupsUsed = 0;
  let publicEvidenceDeepDivesUsed = 0;
  let billableClientRolesFromEvents = 0;
  const releasedSearchIds = new Set<string>();

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
      billableClientRolesFromEvents += getBillableClientRoleCount(metadata);
      if (isClientRoleReleased(metadata) && row.related_id) {
        releasedSearchIds.add(row.related_id);
      }
    } else if (row.event_type === "candidate_enriched") {
      emailLookupsUsed += emailLookupCount ?? 1;
    } else if (row.event_type === "public_evidence_deep_dive") {
      publicEvidenceDeepDivesUsed += publicEvidenceCount ?? 1;
    }
  }

  const extraProfileScans = redemptionActive ? 0 : settings?.extra_search_credits ?? 0;
  const extraEmailLookups = redemptionActive ? 0 : settings?.extra_enrich_credits ?? 0;
  const baseProfileScansLimit = getPlanProfileScansPerMonth(plan);
  const emailLookupsLimit = getPlanEmailLookupsPerMonth(plan) + extraEmailLookups;
  const publicEvidenceDeepDivesLimit = getPlanPublicEvidenceDeepDivesPerMonth(plan);
  const searchRowsUsed = Math.max(0, (searchCountRows[0]?.count ?? 0) - releasedSearchIds.size);
  const clientRolesUsed = Math.max(billableClientRolesFromEvents, searchRowsUsed);
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
      status: redemptionActive ? "active" : normalizedStatus,
      billingCycle: redemptionActive
        ? null
        : settings?.billing_cycle === "month" || settings?.billing_cycle === "year"
          ? settings.billing_cycle
          : plan.billingCycle,
      startedAt: redemptionActive
        ? redemption.starts_at.toISOString()
        : settings?.subscription_started_at
        ? settings.subscription_started_at.toISOString()
        : null,
      renewsAt: redemptionActive
        ? redemption.ends_at.toISOString()
        : settings?.subscription_renews_at
        ? settings.subscription_renews_at.toISOString()
        : null,
    },
    access: redemptionActive
      ? {
          source: "redemption",
          label: "Beta access",
          expiresAt: redemption.ends_at.toISOString(),
          autoRenews: false,
        }
      : paidPlanCode !== "free"
        ? {
            source: "paddle",
            label: "Paid subscription",
            expiresAt: settings?.subscription_renews_at?.toISOString() ?? null,
            autoRenews: true,
          }
        : {
            source: "free",
            label: "Free plan",
            expiresAt: null,
            autoRenews: false,
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
      paddlePortalConfigured: isPaddlePortalConfigured(),
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

export function getBillableClientRoleCount(metadata: Record<string, unknown>) {
  if (isClientRoleReleased(metadata)) {
    return 0;
  }
  const explicitCount = getMetadataCount(metadata.client_roles_used);
  if (explicitCount != null) return explicitCount;
  return 1;
}

function isClientRoleReleased(metadata: Record<string, unknown>) {
  return (
    metadata.client_role_billing_status === "released_after_failure" ||
    metadata.search_billing_status === "released_after_failure" ||
    metadata.profile_scans_billing_status === "released_after_failure"
  );
}

function getPaddleApiBaseUrl() {
  const checkout = getCheckoutConfig();
  return checkout.environment === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

export function isPaddlePortalConfigured() {
  return Boolean((process.env.PADDLE_API_KEY || "").trim());
}

function getPaddleErrorMessage(payload: PaddlePortalSessionResponse, status: number) {
  const detail = payload.error?.detail ?? payload.error?.message;
  if (typeof detail === "string" && detail.trim()) return "Unable to open the billing portal.";
  return `Billing portal request failed with status ${status}`;
}

export async function createBillingPortalSessionForUser(userId: string) {
  const apiKey = (process.env.PADDLE_API_KEY || "").trim();
  if (!isPaddlePortalConfigured()) {
    return {
      ok: false as const,
      status: 503,
      error: "Billing portal is not configured yet.",
    };
  }

  const [settings] = await db
    .select({
      paddle_customer_id: hirelix_user_settings.paddle_customer_id,
      paddle_subscription_id: hirelix_user_settings.paddle_subscription_id,
    })
    .from(hirelix_user_settings)
    .where(eq(hirelix_user_settings.user_id, userId))
    .limit(1);

  const customerId = settings?.paddle_customer_id?.trim();
  if (!customerId) {
    return {
      ok: false as const,
      status: 409,
      error: "No billing profile is linked to this account yet.",
    };
  }

  const subscriptionId = settings?.paddle_subscription_id?.trim();
  const response = await fetch(
    `${getPaddleApiBaseUrl()}/customers/${encodeURIComponent(customerId)}/portal-sessions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscription_ids: subscriptionId ? [subscriptionId] : [],
      }),
    },
  );
  const payload = await response.json().catch(() => ({})) as PaddlePortalSessionResponse;

  if (!response.ok) {
    billingLogger.warn(
      {
        user_id: userId,
        customer_id: customerId,
        paddle_status: response.status,
        paddle_error: payload.error,
      },
      "Paddle portal session request failed",
    );
    return {
      ok: false as const,
      status: response.status >= 500 ? 502 : 400,
      error: getPaddleErrorMessage(payload, response.status),
    };
  }

  const overviewUrl = payload.data?.urls?.general?.overview;
  const subscriptionLinks = payload.data?.urls?.subscriptions?.[0];
  const cancelUrl = subscriptionLinks?.cancel_subscription;
  const updatePaymentMethodUrl = subscriptionLinks?.update_subscription_payment_method;

  if (typeof overviewUrl !== "string" || !overviewUrl) {
    billingLogger.warn(
      { user_id: userId, customer_id: customerId, payload },
      "Paddle portal session response did not include an overview URL",
    );
    return {
      ok: false as const,
      status: 502,
      error: "Billing portal did not return a URL.",
    };
  }

  return {
    ok: true as const,
    portalUrl: overviewUrl,
    cancelUrl: typeof cancelUrl === "string" ? cancelUrl : null,
    updatePaymentMethodUrl:
      typeof updatePaymentMethodUrl === "string" ? updatePaymentMethodUrl : null,
  };
}
