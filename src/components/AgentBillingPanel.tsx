"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AGENT_PLAN, type AgentPlanCode } from "@/lib/agent-plan";
import type { BillingSummary } from "@/lib/billing";
import { PaddleCheckoutButton } from "./PaddleCheckoutButton";
import { fetchWithUserSession } from "@/lib/client-auth";

export function AgentBillingPanel({ billing }: { billing: BillingSummary }) {
  const params = useSearchParams();
  const [error, setError] = useState("");
  const selected = params.get("plan") === "agent_annual" ? "agent_annual" : "agent_monthly";
  const [plan, setPlan] = useState<AgentPlanCode>(selected);
  const access = billing.agent;
  const paid = access?.state === "paid";
  const pending = ["pending", "success"].includes(params.get("checkout") || "");
  async function manage(action: "portalUrl" | "updatePaymentMethodUrl" | "cancelUrl") {
    setError("");
    try {
      const response = await fetchWithUserSession("/api/billing", { method: "POST" });
      const data = await response.json();
      if (!response.ok || typeof data[action] !== "string" || !data[action]) throw new Error(data.error || "Could not open subscription settings.");
      window.location.assign(data[action]);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open billing."); }
  }
  return <section id="billing" className="agent-billing">
    <p className="ws-eyebrow">PERSONAL AGENT</p><h2>Subscription and AI usage</h2>
    {pending && <p role="status">{paid ? "Your subscription is active. Your agent is ready." : "Waiting for payment confirmation from Paddle. Your access will update here after confirmation. If this takes longer than a minute, refresh or contact support."}</p>}
    <div className="agent-billing-summary"><strong>{paid ? "Personal Agent subscription" : access?.state === "expired" ? "Your trial has ended" : "7-day Personal Agent trial"}</strong><p>{access?.remaining ?? AGENT_PLAN.trialTasks} of {access?.limit ?? AGENT_PLAN.trialTasks} AI tasks remaining.</p><p>{access?.periodEnd ? `Current allowance ends ${new Date(access.periodEnd).toLocaleDateString()}.` : "Your trial starts with your first AI task. No card required."}</p></div>
    <p>One AI message, direct document import, assessment, draft, revision, or semantic search is one task. Automatic indexing and follow-on imports are included. Failed tasks are not charged. Paid allowances reset on the first of each month (UTC); unused tasks do not roll over.</p>
    {paid ? <><p>{billing.plan.priceLabel} {billing.plan.cadenceLabel}. Renews automatically until canceled.</p>{billing.checkout.paddlePortalConfigured ? <><button className="ws-button" onClick={() => manage("portalUrl")}>View subscription</button><button className="ws-button" onClick={() => manage("updatePaymentMethodUrl")}>Update payment method</button><button className="ws-button" onClick={() => manage("cancelUrl")}>Cancel subscription</button></> : <a href="mailto:support@hirelix.online?subject=Manage%20my%20Hirelix%20subscription">Contact support to manage or cancel your subscription</a>}<Link className="ws-button" href="/app">Back to your agent</Link></> : <>
      <div className="agent-billing-cycle"><button aria-pressed={plan === "agent_monthly"} onClick={() => setPlan("agent_monthly")}>$49 / month</button><button aria-pressed={plan === "agent_annual"} onClick={() => setPlan("agent_annual")}>$490 / year · save $98</button></div>
      <p>Includes {AGENT_PLAN.monthlyTasks} AI tasks each calendar month. One personal workspace. Candidate records, ongoing roles, client drafts, and document exports.</p>
      <PaddleCheckoutButton checkout={{ type: "plan", planCode: plan }} label={plan === "agent_monthly" ? "Subscribe for $49 / month" : "Subscribe for $490 / year"} className="ws-button ws-button-primary" onError={setError} />
      <p className="agent-billing-terms">USD, plus applicable tax shown at checkout. Payment is collected now when you subscribe. Renews {plan === "agent_monthly" ? "monthly" : "annually"} until canceled. Your saved work remains available when AI access ends. <Link href="/refund-policy">Refund policy</Link>.</p>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
