"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AGENT_PLAN, formatCredits, type AgentPlanCode } from "@/lib/agent-plan";
import type { BillingSummary } from "@/lib/billing";
import { PaddleCheckoutButton } from "./PaddleCheckoutButton";
import { fetchWithUserSession } from "@/lib/client-auth";
import { useLanguage, useT } from "./LanguageProvider";
import { billingSettingsHref } from "@/lib/workspace/return-path";

export function AgentBillingPanel({ billing }: { billing: BillingSummary }) {
  const params = useSearchParams();
  const router = useRouter();
  const t = useT();
  const { locale } = useLanguage();
  const [error, setError] = useState("");
  const plan: AgentPlanCode = params.get("plan") === "agent_annual" ? "agent_annual" : "agent_monthly";
  function setPlan(value: AgentPlanCode) {
    router.replace(billingSettingsHref(params.get("returnTo") || "", value), {scroll:false});
  }
  const access = billing.agent;
  const paid = access?.state === "paid";
  const awaitingPayment = !paid && billing.access.source === "paddle";
  const ending = paid && access.autoRenews === false;
  const lastAllowance = ending && access.periodEnd === access.paidThrough;
  const [managing, setManaging] = useState(false);
  const used = access?.used ?? 0;
  const limit = access?.limit ?? AGENT_PLAN.trialCredits;
  const percent = limit > 0 ? Math.min(100, Math.max(0, used / limit * 100)) : 0;
  const annual = billing.subscription.billingCycle === "year";
  function dateLabel(value: string | null, withTime = false) {
    if (!value || Number.isNaN(new Date(value).getTime())) return null;
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
      year: "numeric", month: "short", day: "numeric",
      ...(withTime ? { hour: "2-digit", minute: "2-digit", timeZoneName: "short" } as const : {}),
    }).format(new Date(value));
  }
  const renewalDate = dateLabel(billing.subscription.renewsAt);
  const resetDate = dateLabel(access?.periodEnd ?? null, true);
  const pending = ["pending", "success"].includes(params.get("checkout") || "");
  async function manage(action: "portalUrl" | "updatePaymentMethodUrl" | "cancelUrl") {
    setError("");
    setManaging(true);
    try {
      const response = await fetchWithUserSession("/api/billing", { method: "POST" });
      const data = await response.json();
      if (!response.ok || typeof data[action] !== "string" || !data[action]) throw new Error(data.error || "Could not open subscription settings.");
      window.location.assign(data[action]);
    } catch (e) { setError(e instanceof Error ? t(e.message) : t("Could not open billing.")); }
    finally { setManaging(false); }
  }
  return (
    <section id="billing" className="agent-billing">
      {pending && <p role="status">{paid
        ? t("Your subscription is active. Your agent is ready.")
        : t("Waiting for payment confirmation from Paddle. Your access will update here after confirmation. If this takes longer than a minute, refresh or contact support.")}</p>}
      <div className="agent-billing-plan">
        <div>
          <h2>{AGENT_PLAN.name} <span className="agent-billing-badge">{paid ? t("Subscription active") : awaitingPayment ? t("Payment confirmation needed") : access?.state === "expired" ? t("AI access ended") : t("7-day free trial")}</span></h2>
          <p>{paid ? t("{count} AI credits included each month").replace("{count}", formatCredits(AGENT_PLAN.monthlyCredits, locale)) : awaitingPayment ? t("Check payment status in Manage subscription. Credits become available after payment confirmation.") : access?.state === "expired" ? t("AI access has ended. Check your subscription or subscribe to continue.") : access?.state === "trial" ? t("7-day free trial") : t("Your trial starts with your first AI task. No card required.")}</p>
        </div>
        {paid && <div className="agent-billing-price">
          <strong>US${(billing.plan.priceCents / 100).toLocaleString("en-US")} <span>{annual ? t("/ year") : t("/ month")}</span></strong>
          <p>{annual ? t("Billed annually") : t("Billed monthly")}</p>
          <p>{ending ? t("Access ends: {date}").replace("{date}", dateLabel(access.paidThrough ?? null) || "—") : renewalDate ? t("Next renewal: {date}").replace("{date}", renewalDate) : t("Check renewal details in Manage subscription.")}</p>
        </div>}
      </div>
      <div className="agent-billing-summary">
        <div className="agent-billing-usage-heading"><h3>{paid ? t("AI usage this period") : t("AI usage")}</h3><span>{t("{percent}% used").replace("{percent}", percent.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", { maximumFractionDigits: 2 }))}</span></div>
        <p className="agent-billing-used">{formatCredits(used, locale)} <span>/ {formatCredits(limit, locale)} {t("AI credits")}</span></p>
        <div className="agent-billing-track" role="progressbar" aria-label={t("AI usage")} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}><div style={{ width: `${percent}%` }} /></div>
        <div className="agent-billing-usage-footer">
          <span>{t("{count} AI credits remaining").replace("{count}", formatCredits(access?.remaining ?? limit, locale))}</span>
          {resetDate && <span>{t(paid ? lastAllowance ? "Allowance ends {date}" : "Resets {date}" : "Trial ends {date}").replace("{date}", resetDate)}</span>}
        </div>
        {(access?.reserved ?? 0) > 0 && <p className="agent-billing-reserved">{t("{count} credits reserved for work in progress").replace("{count}", formatCredits(access!.reserved, locale))}</p>}
        <details><summary>{t("How credits work")}</summary><p>{t("AI work uses credits based on the services consumed. Longer or more complex work may use more credits. Credits are reserved while work is running; only completed work is charged. System retries, automatic indexing and follow-on imports are included. Monthly credits reset after a successful renewal. Annual credits reset each month on your subscription anniversary. For shorter months, the last day is used; unused credits do not roll over.")}</p></details>
      </div>
      {paid || awaitingPayment ? (
        <>
          {billing.checkout.paddlePortalConfigured ? (
            <div className="agent-billing-actions">
              <button className="ws-button ws-button-primary" disabled={managing} onClick={() => manage("portalUrl")}>{t("Manage subscription")} ↗</button>
              {ending ? <p role="status">{t("Auto-renewal is off. Your access continues until the date shown above.")}</p> : <button className="agent-billing-cancel" disabled={managing} onClick={() => manage("cancelUrl")}>{t("Cancel subscription")}</button>}
              <p>{t("View invoices and update your payment method in Manage subscription.")}</p>
            </div>
          ) : <a href="mailto:support@hirelix.online?subject=Manage%20my%20Hirelix%20subscription">{t("Contact support to manage or cancel your subscription")}</a>}
        </>
      ) : (
        <>
          <div className="agent-billing-cycle">
            <button aria-pressed={plan === "agent_monthly"} onClick={() => setPlan("agent_monthly")}>{t("$49 / month")}</button>
            <button aria-pressed={plan === "agent_annual"} onClick={() => setPlan("agent_annual")}>{t("$490 / year · save $98")}</button>
          </div>
          <p>{t("Includes {count} AI credits each monthly subscription period. One personal workspace. Candidate records, ongoing roles, client drafts, and document exports.").replace("{count}", formatCredits(AGENT_PLAN.monthlyCredits,locale))}</p>
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
