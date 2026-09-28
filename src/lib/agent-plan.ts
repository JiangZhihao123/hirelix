export const AGENT_PLAN = {
  name: "Personal Agent",
  monthlyCents: 4900,
  annualCents: 49000,
  currency: "USD",
  monthlyTasks: 300,
  trialTasks: 20,
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
  periodStart: string | null;
  periodEnd: string | null;
};
