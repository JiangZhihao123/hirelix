export type BillingPlanCode =
  | "free"
  | "starter_monthly"
  | "starter_annual"
  | "pro_monthly"
  | "pro_annual";
export type BillingStatus = "active" | "trialing" | "past_due" | "canceled";
export type BillingCycle = "month" | "year" | null;

export type BillingPlan = {
  code: BillingPlanCode;
  name: string;
  description: string;
  priceLabel: string;
  cadenceLabel: string;
  billingCycle: BillingCycle;
  profileScansPerMonth: number;
  emailLookupsPerMonth: number;
  publicEvidenceDeepDivesPerMonth: number;
  searchesPerMonth: number;
  enrichesPerMonth: number;
  exportEnabled: boolean;
  clientBriefEnabled: boolean;
  priceCents: number;
  ctaLabel: string;
  featured?: boolean;
};

export function getPlanProfileScansPerMonth(plan: Pick<BillingPlan, "profileScansPerMonth" | "searchesPerMonth">) {
  return Number.isFinite(plan.profileScansPerMonth)
    ? plan.profileScansPerMonth
    : plan.searchesPerMonth;
}

export function getPlanEmailLookupsPerMonth(plan: Pick<BillingPlan, "emailLookupsPerMonth" | "enrichesPerMonth">) {
  return Number.isFinite(plan.emailLookupsPerMonth)
    ? plan.emailLookupsPerMonth
    : plan.enrichesPerMonth;
}

export function getPlanPublicEvidenceDeepDivesPerMonth(
  plan: Pick<BillingPlan, "publicEvidenceDeepDivesPerMonth">,
) {
  return Number.isFinite(plan.publicEvidenceDeepDivesPerMonth)
    ? plan.publicEvidenceDeepDivesPerMonth
    : 0;
}

export function getPlanSearchBatchProfileScanLimit(
  plan: Pick<BillingPlan, "code" | "profileScansPerMonth" | "searchesPerMonth">,
  fallbackLimit: number,
) {
  if (plan.code === "free") return getPlanProfileScansPerMonth(plan);
  return fallbackLimit;
}

export type UsageSummary = {
  periodStart: string;
  periodEnd: string;
  profileScansUsed: number;
  profileScansLimit: number;
  profileScansRemaining: number;
  emailLookupsUsed: number;
  emailLookupsLimit: number;
  emailLookupsRemaining: number;
  publicEvidenceDeepDivesUsed: number;
  publicEvidenceDeepDivesLimit: number;
  publicEvidenceDeepDivesRemaining: number;
  clientRolesUsed: number;
  clientRolesLimit: number;
  clientRolesRemaining: number;
  searchesUsed: number;
  searchesLimit: number;
  searchesRemaining: number;
  enrichesUsed: number;
  enrichesLimit: number;
  enrichesRemaining: number;
  exportEnabled: boolean;
  clientBriefEnabled: boolean;
  extraSearchCredits: number;
  extraEnrichCredits: number;
  extraProfileScans: number;
  extraEmailLookups: number;
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
    paddlePortalConfigured: boolean;
    proMonthlyPriceIdConfigured: boolean;
    proAnnualPriceIdConfigured: boolean;
    starterMonthlyPriceIdConfigured: boolean;
    starterAnnualPriceIdConfigured: boolean;
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

export const CUSTOMER_BILLING_PLAN_CODES = [
  "starter_annual",
  "starter_monthly",
  "pro_annual",
  "pro_monthly",
] as const;

export function formatCountLabel(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural;
}

export const BILLING_PLANS: Record<BillingPlanCode, BillingPlan> = {
  free: {
    code: "free",
    name: "Free",
    description: "Preview one client role with a real AI sourcing budget.",
    priceLabel: "$0",
    cadenceLabel: "1 AI sourcing preview",
    billingCycle: null,
    profileScansPerMonth: 250,
    emailLookupsPerMonth: 0,
    publicEvidenceDeepDivesPerMonth: 0,
    searchesPerMonth: 1,
    enrichesPerMonth: 0,
    exportEnabled: false,
    clientBriefEnabled: false,
    priceCents: 0,
    ctaLabel: "Current plan",
  },
  starter_monthly: {
    code: "starter_monthly",
    name: "Starter",
    description: "For technical headhunters covering a few active client roles.",
    priceLabel: "$149",
    cadenceLabel: "per month",
    billingCycle: "month",
    profileScansPerMonth: 4000,
    emailLookupsPerMonth: 100,
    publicEvidenceDeepDivesPerMonth: 50,
    searchesPerMonth: 3,
    enrichesPerMonth: 100,
    exportEnabled: true,
    clientBriefEnabled: true,
    priceCents: 14900,
    ctaLabel: "Start Starter monthly",
  },
  starter_annual: {
    code: "starter_annual",
    name: "Starter",
    description: "For technical headhunters covering a few active client roles.",
    priceLabel: "$99",
    cadenceLabel: "per month, billed annually",
    billingCycle: "year",
    profileScansPerMonth: 4000,
    emailLookupsPerMonth: 100,
    publicEvidenceDeepDivesPerMonth: 50,
    searchesPerMonth: 3,
    enrichesPerMonth: 100,
    exportEnabled: true,
    clientBriefEnabled: true,
    priceCents: 118800,
    ctaLabel: "Start Starter",
    featured: true,
  },
  pro_monthly: {
    code: "pro_monthly",
    name: "Pro",
    description: "For recruiters running a larger active client-role desk.",
    priceLabel: "$399",
    cadenceLabel: "per month",
    billingCycle: "month",
    profileScansPerMonth: 15000,
    emailLookupsPerMonth: 500,
    publicEvidenceDeepDivesPerMonth: 250,
    searchesPerMonth: 10,
    enrichesPerMonth: 500,
    exportEnabled: true,
    clientBriefEnabled: true,
    priceCents: 39900,
    ctaLabel: "Start Pro monthly",
  },
  pro_annual: {
    code: "pro_annual",
    name: "Pro",
    description: "For recruiters running a larger active client-role desk.",
    priceLabel: "$299",
    cadenceLabel: "per month, billed annually",
    billingCycle: "year",
    profileScansPerMonth: 15000,
    emailLookupsPerMonth: 500,
    publicEvidenceDeepDivesPerMonth: 250,
    searchesPerMonth: 10,
    enrichesPerMonth: 500,
    exportEnabled: true,
    clientBriefEnabled: true,
    priceCents: 358800,
    ctaLabel: "Start Pro",
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
  const profileScansRemaining = billing.usage.profileScansRemaining;
  const profileScansLimit = billing.usage.profileScansLimit;
  const clientRolesRemaining = billing.usage.clientRolesRemaining;
  const clientRolesLimit = billing.usage.clientRolesLimit;
  const renewalDate = formatMonthDay(billing.subscription.renewsAt);
  const isExhausted = profileScansRemaining === 0 || clientRolesRemaining === 0;

  return {
    title: isFreePlan ? "Free plan" : billing.plan.name,
    usageLabel: clientRolesRemaining === 0
      ? "No client roles left this cycle"
      : profileScansRemaining === 0
      ? "No targeted profile scans left this cycle"
      : `${clientRolesRemaining} / ${clientRolesLimit} client roles and ${profileScansRemaining} / ${profileScansLimit} targeted scans left`,
    capabilityLabel: isFreePlan
      ? "Includes one ranked candidate pool from 250 targeted profile scans"
      : `Includes ${billing.plan.searchesPerMonth} client roles, AI sourcing budget, contact lookup, on-demand candidate research, export, and client-ready briefs`,
    renewalLabel: renewalDate ? `Cycle resets ${renewalDate}` : null,
    actionLabel: billing ? "Manage" : "Open",
    state: isExhausted ? "warning" : "default",
  };
}

export function getCheckoutConfig(): {
  enabled: boolean;
  environment: "sandbox" | "production";
  clientToken: string;
  proMonthlyPriceId: string;
  proAnnualPriceId: string;
  starterMonthlyPriceId: string;
  starterAnnualPriceId: string;
} {
  const clientToken = (process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || "").trim();
  const proMonthlyPriceId = (process.env.NEXT_PUBLIC_PADDLE_PRO_MONTHLY_PRICE_ID || "").trim();
  const proAnnualPriceId = (process.env.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID || "").trim();
  const starterMonthlyPriceId = (process.env.NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID || "").trim();
  const starterAnnualPriceId = (process.env.NEXT_PUBLIC_PADDLE_STARTER_ANNUAL_PRICE_ID || "").trim();

  return {
    enabled: Boolean(clientToken),
    environment:
      process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox",
    clientToken,
    proMonthlyPriceId,
    proAnnualPriceId,
    starterMonthlyPriceId,
    starterAnnualPriceId,
  };
}
