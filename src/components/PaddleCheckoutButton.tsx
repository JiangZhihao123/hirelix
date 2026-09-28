"use client";


import { useT, useLanguage } from "@/components/LanguageProvider";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  ANALYTICS_EVENTS,
  getAnalyticsContextFromBrowser,
  trackEvent,
} from "@/lib/analytics";
import { getCheckoutConfig, type BillingPlanCode } from "@/lib/billing";
import { isAgentPlan } from "@/lib/agent-plan";
import { fetchWithUserSession } from "@/lib/client-auth";
import { loadPaddle } from "@/lib/paddle";

type CheckoutKind = { type: "plan"; planCode: Exclude<BillingPlanCode, "free"> };

type PaddleCheckoutButtonProps = {
  checkout: CheckoutKind;
  className: string;
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  onError?: (message: string) => void;
};

export function PaddleCheckoutButton({
  checkout,
  className,
  label,
  disabled = false,
  onClick,
  onError,
}: PaddleCheckoutButtonProps) {
  const t = useT();
  const { locale } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const config = getCheckoutConfig();

  const priceId =
    checkout.type === "plan"
      ? checkout.planCode === "agent_monthly" ? config.agentMonthlyPriceId
        : checkout.planCode === "agent_annual" ? config.agentAnnualPriceId
        : checkout.planCode === "starter_monthly"
        ? config.starterMonthlyPriceId
        : checkout.planCode === "starter_annual"
          ? config.starterAnnualPriceId
          : checkout.planCode === "pro_monthly"
            ? config.proMonthlyPriceId
            : config.proAnnualPriceId
      : "";

  async function handleCheckout() {
    onError?.("");
    onClick?.();
    const purchaseType = checkout.planCode;
    trackEvent(ANALYTICS_EVENTS.checkoutStart, {
      ...getAnalyticsContextFromBrowser(),
      purchase_type: purchaseType,
      checkout_kind: checkout.type,
    });

    if (!user) {
      trackEvent(ANALYTICS_EVENTS.checkoutError, {
        ...getAnalyticsContextFromBrowser(),
        purchase_type: purchaseType,
        checkout_kind: checkout.type,
        error_reason: "not_signed_in",
      });
      onError?.("Sign in to purchase a plan.");
      return;
    }
    if (!config.enabled || !priceId) {
      trackEvent(ANALYTICS_EVENTS.checkoutError, {
        ...getAnalyticsContextFromBrowser(),
        purchase_type: purchaseType,
        checkout_kind: checkout.type,
        error_reason: "missing_price_id",
      });
      onError?.("Checkout is not configured yet.");
      return;
    }

    setLoading(true);
    try {
      const paddle = await loadPaddle(config.clientToken, config.environment, onError);
      if (!paddle) {
        trackEvent(ANALYTICS_EVENTS.checkoutError, {
          ...getAnalyticsContextFromBrowser(),
          purchase_type: purchaseType,
          checkout_kind: checkout.type,
          error_reason: "paddle_load_failed",
        });
        onError?.("Checkout failed to load.");
        return;
      }

      const successUrl = `${window.location.origin}/app/settings?section=billing&checkout=pending`;
      if (isAgentPlan(checkout.planCode)) {
        const response = await fetchWithUserSession("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan: checkout.planCode }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not prepare checkout.");
        paddle.Checkout.open({ items: [{ priceId: result.priceId, quantity: 1 }], customer: result.customer, customData: result.customData, settings: { displayMode: "overlay", locale: locale === "zh" ? "zh-Hans" : "en", successUrl } });
      } else {
        paddle.Checkout.open({ items: [{ priceId, quantity: 1 }], customer: { email: user.email }, customData: { user_id: user.id, purchase_type: purchaseType }, settings: { displayMode: "overlay", locale: locale === "zh" ? "zh-Hans" : "en", successUrl } });
      }

    } catch (err) {
      trackEvent(ANALYTICS_EVENTS.checkoutError, {
        ...getAnalyticsContextFromBrowser(),
        purchase_type: purchaseType,
        checkout_kind: checkout.type,
        error_reason: err instanceof Error ? err.message : "unknown",
      });
      onError?.(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setLoading(false);
    }
  }


  return (
    <button
      type="button"
      onClick={handleCheckout}
      disabled={disabled || loading}
      className={className}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("Opening checkout...")}
        </>
      ) : (
        label
      )}
    </button>
  );
}
