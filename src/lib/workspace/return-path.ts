import { isAgentPlan, type AgentPlanCode } from "@/lib/agent-plan";

// Settings/checkout may return only to a known local workspace surface.
export function workspaceReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/app") || /[\\\r\n]/.test(value)) return null;
  try {
    const url = new URL(value, "https://workspace.invalid");
    if (url.origin !== "https://workspace.invalid" || !/^\/app(?:\/(?:candidates|roles\/[a-f0-9-]{36}|submissions\/[a-f0-9-]{36}))?$/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}

export function billingSettingsHref(returnTo: string, selectedPlan?: AgentPlanCode) {
  let path = workspaceReturnPath(returnTo);
  const query = new URLSearchParams({section: "billing"});
  if (selectedPlan && isAgentPlan(selectedPlan)) query.set("plan", selectedPlan);
  if (path) {
    const work = new URL(path, "https://workspace.invalid");
    if (selectedPlan && isAgentPlan(selectedPlan)) {
      work.searchParams.set("plan", selectedPlan);
      path = `${work.pathname}${work.search}${work.hash}`;
    }
    query.set("returnTo", path);
    const plan = work.searchParams.get("plan");
    if (plan === "agent_monthly" || plan === "agent_annual") query.set("plan", plan);
  }
  return `/app/settings?${query.toString()}`;
}

export function checkoutReturnUrl(origin: string, returnTo: string | null, selectedPlan?: AgentPlanCode) {
  const url = new URL(billingSettingsHref(returnTo || "", selectedPlan), origin);
  url.searchParams.set("checkout", "pending");
  return url.toString();
}
