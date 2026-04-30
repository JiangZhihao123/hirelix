export type BillingPlanCode =
  | "free"
  | "pro_monthly"
  | "pro_annual"
  | "business_monthly"
  | "agency_monthly";
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
    businessPriceIdConfigured: boolean;
    agencyPriceIdConfigured: boolean;
    searchPackPriceIdConfigured: boolean;
    contactPackPriceIdConfigured: boolean;
  };
};

export type PlanStatusCopy = {
  title: string;
  usageLabel: string;
  capabilityLabel: string;
  renewalLabel: string | null;
  actionLabel: string;
  state: "default" | "warning" | "unavailable";
};

export const BILLING_PLANS: Record<BillingPlanCode, BillingPlan> = {
  free: {
    code: "free",
    name: "Free",
    description: "Run 2 searches to see how AI sourcing with evidence works.",
    priceLabel: "$0",
    cadenceLabel: "free forever",
    billingCycle: null,
    searchesPerMonth: 2,
    candidateLimitPerSearch: 25,
    enrichesPerMonth: 5,
    exportEnabled: false,
    priceCents: 0,
    ctaLabel: "Current plan",
  },
  pro_monthly: {
    code: "pro_monthly",
    name: "Pro",
    description: "For independent technical headhunters sourcing active roles.",
    priceLabel: "$299",
    cadenceLabel: "per seat / month",
    billingCycle: "month",
    searchesPerMonth: 30,
    candidateLimitPerSearch: 25,
    enrichesPerMonth: 300,
    exportEnabled: true,
    priceCents: 29900,
    ctaLabel: "Upgrade monthly",
  },
  pro_annual: {
    code: "pro_annual",
    name: "Pro Annual",
    description: "Two months free. For headhunters with steady sourcing volume.",
    priceLabel: "$249",
    cadenceLabel: "per seat / month, billed annually",
    billingCycle: "year",
    searchesPerMonth: 30,
    candidateLimitPerSearch: 25,
    enrichesPerMonth: 500,
    exportEnabled: true,
    priceCents: 298800,
    ctaLabel: "Upgrade annually",
    featured: true,
  },
  business_monthly: {
    code: "business_monthly",
    name: "Business",
    description: "For small teams. Higher volume, shared workspace, priority support.",
    priceLabel: "$799",
    cadenceLabel: "up to 3 seats / month",
    billingCycle: "month",
    searchesPerMonth: 100,
    candidateLimitPerSearch: 50,
    enrichesPerMonth: 1000,
    exportEnabled: true,
    priceCents: 79900,
    ctaLabel: "Upgrade to Business",
  },
  agency_monthly: {
    code: "agency_monthly",
    name: "Agency",
    description: "For search firms. High volume, white-label export, API, dedicated onboarding.",
    priceLabel: "$1,999",
    cadenceLabel: "up to 10 seats / month",
    billingCycle: "month",
    searchesPerMonth: 300,
    candidateLimitPerSearch: 100,
    enrichesPerMonth: 3000,
    exportEnabled: true,
    priceCents: 199900,
    ctaLabel: "Contact us",
  },
};

export const SEARCH_PACK = {
  name: "Search Pack",
  description: "10 extra searches when you hit your monthly limit.",
  priceLabel: "$99",
  credits: 10,
};

export const CONTACT_PACK = {
  name: "Contact Pack",
  description: "100 extra contact unlocks with outreach drafts.",
  priceLabel: "$99",
  credits: 100,
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
  const validCodes = new Set<BillingPlanCode>([
    "pro_monthly",
    "pro_annual",
    "business_monthly",
    "agency_monthly",
  ]);
  const normalizedPlan = validCodes.has(planCode as BillingPlanCode)
    ? (planCode as BillingPlanCode)
    : "free";
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

function formatMonthDay(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function getPlanStatusCopy(
  billing: BillingSummary | null,
): PlanStatusCopy {
  if (!billing) {
    return {
      title: "Billing unavailable",
      usageLabel: "Open billing to check your current plan.",
      capabilityLabel: "Plan details and cycle limits are unavailable right now.",
      renewalLabel: null,
      actionLabel: "Open billing",
      state: "unavailable",
    };
  }

  const isFreePlan = billing.subscription.planCode === "free";
  const searchesRemaining = billing.usage.searchesRemaining;
  const searchesLimit = billing.usage.searchesLimit;
  const renewalDate = formatMonthDay(billing.subscription.renewsAt);
  const isExhausted = searchesRemaining === 0;

  return {
    title: isFreePlan ? "Free plan" : billing.plan.name,
    usageLabel: isExhausted
      ? "No searches left this cycle"
      : `${searchesRemaining} / ${searchesLimit} searches left this cycle`,
    capabilityLabel: isFreePlan
      ? "Includes limited contact unlocks; export is on Pro"
      : "Includes contact unlocks, export, and outreach",
    renewalLabel: renewalDate ? `Cycle resets ${renewalDate}` : null,
    actionLabel: billing ? "Manage" : "Open",
    state: isExhausted ? "warning" : "default",
  };
}

export function getCheckoutConfig(): {
  enabled: boolean;
  environment: "sandbox" | "production";
  clientToken: string;
  monthlyPriceId: string;
  annualPriceId: string;
  businessPriceId: string;
  agencyPriceId: string;
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
    businessPriceId: process.env.NEXT_PUBLIC_PADDLE_BUSINESS_PRICE_ID || "",
    agencyPriceId: process.env.NEXT_PUBLIC_PADDLE_AGENCY_PRICE_ID || "",
    searchPackPriceId: process.env.NEXT_PUBLIC_PADDLE_SEARCH_PACK_PRICE_ID || "",
    contactPackPriceId: process.env.NEXT_PUBLIC_PADDLE_CONTACT_PACK_PRICE_ID || "",
  };
}
