export type BillingPlanCode =
  | "free"
  | "starter_monthly"
  | "starter_annual"
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
  clientBriefEnabled: boolean;
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
  clientBriefEnabled: boolean;
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
    starterMonthlyPriceIdConfigured: boolean;
    starterAnnualPriceIdConfigured: boolean;
    businessPriceIdConfigured: boolean;
    agencyPriceIdConfigured: boolean;
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

export const CUSTOMER_BILLING_PLAN_CODES = ["starter_monthly", "starter_annual"] as const;

export function formatCountLabel(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

export const BILLING_PLANS: Record<BillingPlanCode, BillingPlan> = {
  free: {
    code: "free",
    name: "Free",
    description: "Run one complete 25-candidate shortlist before you pay.",
    priceLabel: "$0",
    cadenceLabel: "one complete trial",
    billingCycle: null,
    searchesPerMonth: 1,
    candidateLimitPerSearch: 25,
    enrichesPerMonth: 0,
    exportEnabled: false,
    clientBriefEnabled: false,
    priceCents: 0,
    ctaLabel: "Current plan",
  },
  starter_monthly: {
    code: "starter_monthly",
    name: "Monthly",
    description: "Everything unlocked, paid month to month.",
    priceLabel: "$149",
    cadenceLabel: "per month",
    billingCycle: "month",
    searchesPerMonth: 10,
    candidateLimitPerSearch: 25,
    enrichesPerMonth: 250,
    exportEnabled: true,
    clientBriefEnabled: true,
    priceCents: 14900,
    ctaLabel: "Start monthly",
  },
  starter_annual: {
    code: "starter_annual",
    name: "Annual",
    description: "Everything unlocked at the best monthly rate.",
    priceLabel: "$99",
    cadenceLabel: "per month, billed annually",
    billingCycle: "year",
    searchesPerMonth: 10,
    candidateLimitPerSearch: 25,
    enrichesPerMonth: 250,
    exportEnabled: true,
    clientBriefEnabled: true,
    priceCents: 118800,
    ctaLabel: "Start annual",
    featured: true,
  },
  pro_monthly: {
    code: "pro_monthly",
    name: "Monthly",
    description: "Legacy monthly subscription.",
    priceLabel: "$149",
    cadenceLabel: "per month",
    billingCycle: "month",
    searchesPerMonth: 25,
    candidateLimitPerSearch: 25,
    enrichesPerMonth: 625,
    exportEnabled: true,
    clientBriefEnabled: true,
    priceCents: 14900,
    ctaLabel: "Start monthly",
  },
  pro_annual: {
    code: "pro_annual",
    name: "Annual",
    description: "Legacy annual subscription.",
    priceLabel: "$99",
    cadenceLabel: "per month, billed annually",
    billingCycle: "year",
    searchesPerMonth: 25,
    candidateLimitPerSearch: 25,
    enrichesPerMonth: 625,
    exportEnabled: true,
    clientBriefEnabled: true,
    priceCents: 118800,
    ctaLabel: "Start annual",
  },
  business_monthly: {
    code: "business_monthly",
    name: "Business",
    description: "For small teams. Higher volume, shared workspace, priority support.",
    priceLabel: "$799",
    cadenceLabel: "up to 3 seats / month",
    billingCycle: "month",
    searchesPerMonth: 100,
    candidateLimitPerSearch: 25,
    enrichesPerMonth: 2500,
    exportEnabled: true,
    clientBriefEnabled: true,
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
    candidateLimitPerSearch: 25,
    enrichesPerMonth: 7500,
    exportEnabled: true,
    clientBriefEnabled: true,
    priceCents: 199900,
    ctaLabel: "Contact us",
  },
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
    "starter_monthly",
    "starter_annual",
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
      ? "No shortlist builds left this cycle"
      : `${searchesRemaining} / ${searchesLimit} shortlist builds left`,
    capabilityLabel: isFreePlan
      ? "Includes one complete 25-candidate shortlist with fit evidence, risks, and outreach drafts"
      : "Everything is unlocked: 25-candidate shortlists, email lookup, export, outreach, and client-ready briefs",
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
  starterMonthlyPriceId: string;
  starterAnnualPriceId: string;
  businessPriceId: string;
  agencyPriceId: string;
} {
  const clientToken = (process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "").trim();
  const monthlyPriceId = (process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID || "").trim();
  const annualPriceId = (process.env.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID || "").trim();
  const starterMonthlyPriceId = (process.env.NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID || "").trim();
  const starterAnnualPriceId = (process.env.NEXT_PUBLIC_PADDLE_STARTER_ANNUAL_PRICE_ID || "").trim();
  const businessPriceId = (process.env.NEXT_PUBLIC_PADDLE_BUSINESS_PRICE_ID || "").trim();
  const agencyPriceId = (process.env.NEXT_PUBLIC_PADDLE_AGENCY_PRICE_ID || "").trim();

  return {
    enabled: Boolean(
      clientToken &&
        (starterMonthlyPriceId || monthlyPriceId) &&
        (starterAnnualPriceId || annualPriceId),
    ),
    environment:
      process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox",
    clientToken,
    monthlyPriceId,
    annualPriceId,
    starterMonthlyPriceId,
    starterAnnualPriceId,
    businessPriceId,
    agencyPriceId,
  };
}
