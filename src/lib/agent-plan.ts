export const AGENT_PLAN = {
  name: "Personal Agent",
  monthlyCents: 4900,
  annualCents: 49000,
  currency: "USD",
  monthlyCredits: 3000,
  trialCredits: 200,
  trialDays: 7,
} as const;
export type AgentPlanCode = "agent_monthly" | "agent_annual";
export function isAgentPlan(value: string): value is AgentPlanCode {
  return value === "agent_monthly" || value === "agent_annual";
}
export type AgentAccess = {
  state: "trial_ready" | "trial" | "expired" | "paid" | "legacy";
  used: number;
  limit: number;
  remaining: number;
  reserved: number;
  periodStart: string | null;
  periodEnd: string | null;
};

// Integer ten-thousandths of a credit keep the ledger exact. Credits are product
// compute units, not dollars, task counts, or a promise of a fixed token quota.
export const CREDIT_UNITS = 10_000;
export const CREDIT_RETAIL_USD = 0.01;
export function formatCredits(value: number, locale: "en" | "zh" = "en") {
  if (value > 0 && value < 0.01) return locale === "zh" ? "不足 0.01" : "<0.01";
  return value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { maximumFractionDigits: 2 });
}
