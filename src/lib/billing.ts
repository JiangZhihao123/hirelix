export type BillingPlanCode = "free" | "pro_monthly" | "pro_annual";
export type BillingStatus = "active" | "trialing" | "past_due" | "canceled";
export type BillingCycle = "month" | "year" | null;

export type BillingPlan = {
  code: BillingPlanCode;
  name: string;
  description: string;
  priceLabel: string;
  cadenceLabel: string;
  billingCycle: BillingCycle;
  searchesPerMonth: number;
  candidateLimitPerSearch: number;
  enrichesPerMonth: number;
  exportEnabled: boolean;
  priceCents: number;
  ctaLabel: string;
  featured?: boolean;
};

export type UsageSummary = {
  periodStart: string;
  periodEnd: string;
  searchesUsed: number;
  searchesLimit: number;
  searchesRemaining: number;
  enrichesUsed: number;
  enrichesLimit: number;
  enrichesRemaining: number;
  candidateLimitPerSearch: number;
  exportEnabled: boolean;
  extraSearchCredits: number;
  extraEnrichCredits: number;
};

export type BillingSummary = {
  plan: BillingPlan;
  subscription: {
    planCode: BillingPlanCode;
    status: BillingStatus;
    billingCycle: BillingCycle;
    startedAt: string | null;
    renewsAt: string | null;
  };
  usage: UsageSummary;
  checkout: {
    paddleEnabled: boolean;
    monthlyPriceIdConfigured: boolean;
    annualPriceIdConfigured: boolean;
    searchPackPriceIdConfigured: boolean;
    contactPackPriceIdConfigured: boolean;
  };
};

export const BILLING_PLANS: Record<BillingPlanCode, BillingPlan> = {
  free: {
    code: "free",
    name: "Free",
    description: "Validate the paid-beta workflow before you upgrade.",
    priceLabel: "$0",
    cadenceLabel: "free forever",
    billingCycle: null,
    searchesPerMonth: 3,
    candidateLimitPerSearch: 5,
    enrichesPerMonth: 0,
    exportEnabled: false,
    priceCents: 0,
    ctaLabel: "Current plan",
  },
  pro_monthly: {
    code: "pro_monthly",
    name: "Pro Monthly",
    description: "For recruiters, founders, and hiring teams who need reliable weekly throughput.",
    priceLabel: "$99",
    cadenceLabel: "per seat / month",
    billingCycle: "month",
    searchesPerMonth: 30,
    candidateLimitPerSearch: 25,
    enrichesPerMonth: 25,
    exportEnabled: true,
    priceCents: 9900,
    ctaLabel: "Upgrade monthly",
    featured: true,
  },
  pro_annual: {
    code: "pro_annual",
    name: "Pro Annual",
    description: "Same paid-beta limits, better payback and lower monthly equivalent.",
    priceLabel: "$79",
    cadenceLabel: "per seat / month, billed annually",
    billingCycle: "year",
    searchesPerMonth: 30,
    candidateLimitPerSearch: 25,
    enrichesPerMonth: 25,
    exportEnabled: true,
    priceCents: 94800,
    ctaLabel: "Upgrade annually",
  },
};

export const SEARCH_PACK = {
  name: "Search Pack",
  description: "10 extra searches for heavy months.",
  priceLabel: "$19",
  credits: 10,
};

export const CONTACT_PACK = {
  name: "Contact Pack",
  description: "25 extra email + draft enriches.",
  priceLabel: "$29",
  credits: 25,
};

const ACTIVE_BILLING_STATUSES = new Set<BillingStatus>(["active", "trialing"]);

export function normalizeBillingStatus(status: string | null | undefined): BillingStatus {
  if (status === "trialing" || status === "past_due" || status === "canceled") {
    return status;
  }
  return "active";
}

export function getEffectivePlanCode(
  planCode: string | null | undefined,
  status: string | null | undefined,
): BillingPlanCode {
  const normalizedPlan =
    planCode === "pro_monthly" || planCode === "pro_annual" ? planCode : "free";
  const normalizedStatus = normalizeBillingStatus(status);

  if (normalizedPlan === "free") return "free";
  return ACTIVE_BILLING_STATUSES.has(normalizedStatus) ? normalizedPlan : "free";
}

export function getPlan(planCode: BillingPlanCode): BillingPlan {
  return BILLING_PLANS[planCode];
}

export function getBillingPeriodBounds(now: Date = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function clampRemaining(limit: number, used: number) {
  return Math.max(limit - used, 0);
}

export function formatPlanLabel(plan: BillingPlan) {
  return `${plan.name} · ${plan.priceLabel}`;
}

export function getCheckoutConfig(): {
  enabled: boolean;
  environment: "sandbox" | "production";
  clientToken: string;
  monthlyPriceId: string;
  annualPriceId: string;
  searchPackPriceId: string;
  contactPackPriceId: string;
} {
  return {
    enabled: Boolean(
      process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN &&
        process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID &&
        process.env.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID,
    ),
    environment:
      process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox",
    clientToken: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "",
    monthlyPriceId: process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID || "",
    annualPriceId: process.env.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID || "",
    searchPackPriceId: process.env.NEXT_PUBLIC_PADDLE_SEARCH_PACK_PRICE_ID || "",
    contactPackPriceId: process.env.NEXT_PUBLIC_PADDLE_CONTACT_PACK_PRICE_ID || "",
  };
}
