"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { getCheckoutConfig, type BillingPlanCode } from "@/lib/billing";
import { loadPaddle } from "@/lib/paddle";

type CheckoutKind =
  | { type: "plan"; planCode: Exclude<BillingPlanCode, "free"> }
  | { type: "add_on"; addOn: "search_pack" | "contact_pack" };

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
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const config = getCheckoutConfig();

  const priceId =
    checkout.type === "plan"
      ? checkout.planCode === "pro_monthly"
        ? config.monthlyPriceId
        : config.annualPriceId
      : checkout.addOn === "search_pack"
        ? config.searchPackPriceId
        : config.contactPackPriceId;

  async function handleCheckout() {
    onClick?.();
    if (!user) {
      onError?.("Sign in to purchase a plan.");
      return;
    }
    if (!config.enabled || !priceId) {
      onError?.("Paddle checkout is not configured yet.");
      return;
    }

    setLoading(true);
    try {
      const paddle = await loadPaddle(config.clientToken, config.environment);
      if (!paddle) {
        onError?.("Paddle checkout failed to load.");
        return;
      }

      const successUrl = `${window.location.origin}/app/settings?checkout=success`;
      paddle.Checkout.open({
        items: [{ priceId, quantity: 1 }],
        customer: {
          email: user.email,
        },
        customData: {
          user_id: user.id,
          purchase_type: checkout.type === "plan" ? checkout.planCode : checkout.addOn,
        },
        settings: {
          displayMode: "overlay",
          successUrl,
        },
      });
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Paddle checkout failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCheckout}
      disabled={disabled || loading || !priceId}
      className={className}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening checkout...
        </>
      ) : (
        label
      )}
    </button>
  );
}
