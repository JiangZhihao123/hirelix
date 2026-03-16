import type { SupabaseClient } from "@supabase/supabase-js";
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

type SettingsBillingRow = {
  subscription_plan: string | null;
  subscription_status: string | null;
  billing_cycle: string | null;
  subscription_started_at: string | null;
  subscription_renews_at: string | null;
  extra_search_credits: number | null;
  extra_enrich_credits: number | null;
};

export async function getBillingSummaryForUser(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<BillingSummary> {
  const { startIso, endIso } = getBillingPeriodBounds();

  const [{ data: settings }, { count: searchesUsed }, { count: enrichesUsed }] =
    await Promise.all([
      supabaseAdmin
        .from("hirelix_user_settings")
        .select(
          "subscription_plan, subscription_status, billing_cycle, subscription_started_at, subscription_renews_at, extra_search_credits, extra_enrich_credits",
        )
        .eq("user_id", userId)
        .maybeSingle<SettingsBillingRow>(),
      supabaseAdmin
        .from("hirelix_usage_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("event_type", "search_created")
        .gte("created_at", startIso)
        .lt("created_at", endIso),
      supabaseAdmin
        .from("hirelix_usage_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("event_type", "candidate_enriched")
        .gte("created_at", startIso)
        .lt("created_at", endIso),
    ]);

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

  return {
    plan,
    subscription: {
      planCode,
      status: normalizedStatus,
      billingCycle:
        settings?.billing_cycle === "month" || settings?.billing_cycle === "year"
          ? settings.billing_cycle
          : plan.billingCycle,
      startedAt: settings?.subscription_started_at ?? null,
      renewsAt: settings?.subscription_renews_at ?? null,
    },
    usage: {
      periodStart: startIso,
      periodEnd: endIso,
      searchesUsed: searchesUsed ?? 0,
      searchesLimit: searchLimit,
      searchesRemaining: clampRemaining(searchLimit, searchesUsed ?? 0),
      enrichesUsed: enrichesUsed ?? 0,
      enrichesLimit: enrichLimit,
      enrichesRemaining: clampRemaining(enrichLimit, enrichesUsed ?? 0),
      candidateLimitPerSearch: plan.candidateLimitPerSearch,
      exportEnabled: plan.exportEnabled,
      extraSearchCredits,
      extraEnrichCredits,
    },
    checkout: {
      paddleEnabled: checkout.enabled,
      monthlyPriceIdConfigured: Boolean(checkout.monthlyPriceId),
      annualPriceIdConfigured: Boolean(checkout.annualPriceId),
      searchPackPriceIdConfigured: Boolean(checkout.searchPackPriceId),
      contactPackPriceIdConfigured: Boolean(checkout.contactPackPriceId),
    },
  };
}
