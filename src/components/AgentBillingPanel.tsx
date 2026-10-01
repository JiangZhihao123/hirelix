"use client";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AGENT_PLAN, formatCredits, type AgentPlanCode } from "@/lib/agent-plan";
import type { BillingSummary } from "@/lib/billing";
import { PaddleCheckoutButton } from "./PaddleCheckoutButton";
import { fetchWithUserSession } from "@/lib/client-auth";
import { useLanguage, useT } from "./LanguageProvider";

export function AgentBillingPanel({ billing }: { billing: BillingSummary }) {
  const params = useSearchParams();
  const t = useT();
  const { locale } = useLanguage();
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
    } catch (e) { setError(e instanceof Error ? t(e.message) : t("Could not open billing.")); }
  }
  return (
    <section id="billing" className="agent-billing">
      <p className="ws-eyebrow">{t("PERSONAL AGENT")}</p>
      <h2>{t("Subscription and AI usage")}</h2>
      {pending && <p role="status">{paid
        ? t("Your subscription is active. Your agent is ready.")
        : t("Waiting for payment confirmation from Paddle. Your access will update here after confirmation. If this takes longer than a minute, refresh or contact support.")}</p>}
      <div className="agent-billing-summary">
        <strong>{paid ? t("Personal Agent subscription") : access?.state === "expired" ? t("Your trial has ended") : t("7-day Personal Agent trial")}</strong>
        <p>{t("{remaining} of {limit} AI credits remaining.")
          .replace("{remaining}", formatCredits(access?.remaining ?? AGENT_PLAN.trialCredits,locale))
          .replace("{limit}", formatCredits(access?.limit ?? AGENT_PLAN.trialCredits,locale))}</p>
        <p>{t("Used {used} AI credits. {reserved} reserved for work in progress.")
          .replace("{used}",formatCredits(access?.used ?? 0,locale))
          .replace("{reserved}",formatCredits(access?.reserved ?? 0,locale))}</p>
        <p>{access?.periodEnd
          ? t("Current allowance ends {date}.").replace("{date}", new Date(access.periodEnd).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US"))
          : t("Your trial starts with your first AI task. No card required.")}</p>
      </div>
      <p>{t("AI work uses credits based on the services consumed. Longer or more complex work may use more credits. Credits are reserved while work is running; only completed work is charged. System retries, automatic indexing and follow-on imports are included. Paid credits reset on the first of each month (UTC); unused credits do not roll over.")}</p>
      {paid ? (
        <>
          <p>{billing.plan.priceLabel} {t(billing.plan.cadenceLabel)}. {t("Renews automatically until canceled.")}</p>
          {billing.checkout.paddlePortalConfigured ? (
            <>
              <button className="ws-button" onClick={() => manage("portalUrl")}>{t("View subscription")}</button>
              <button className="ws-button" onClick={() => manage("updatePaymentMethodUrl")}>{t("Update payment method")}</button>
              <button className="ws-button" onClick={() => manage("cancelUrl")}>{t("Cancel subscription")}</button>
            </>
          ) : <a href="mailto:support@hirelix.online?subject=Manage%20my%20Hirelix%20subscription">{t("Contact support to manage or cancel your subscription")}</a>}
          <Link className="ws-button" href="/app">{t("Back to your agent")}</Link>
        </>
      ) : (
        <>
          <div className="agent-billing-cycle">
            <button aria-pressed={plan === "agent_monthly"} onClick={() => setPlan("agent_monthly")}>{t("$49 / month")}</button>
            <button aria-pressed={plan === "agent_annual"} onClick={() => setPlan("agent_annual")}>{t("$490 / year · save $98")}</button>
          </div>
          <p>{t("Includes {count} AI credits each calendar month. One personal workspace. Candidate records, ongoing roles, client drafts, and document exports.").replace("{count}", formatCredits(AGENT_PLAN.monthlyCredits,locale))}</p>
          <PaddleCheckoutButton checkout={{ type: "plan", planCode: plan }} label={plan === "agent_monthly" ? t("Subscribe for $49 / month") : t("Subscribe for $490 / year")} className="ws-button ws-button-primary" onError={setError} />
          <p className="agent-billing-terms">
            {t("USD, plus applicable tax shown at checkout. Payment is collected now when you subscribe.")} {plan === "agent_monthly" ? t("Renews monthly until canceled.") : t("Renews annually until canceled.")} {t("Your saved work remains available when AI access ends.")} <Link href="/refund-policy">{t("Refund policy")}</Link>.
          </p>
        </>
      )}
      {error && <p role="alert">{t(error)}</p>}
    </section>
  );
}
