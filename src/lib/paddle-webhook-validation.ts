import crypto from "node:crypto";
import { getCheckoutConfig } from "./billing";
const DEFAULT_SUBSCRIPTION_ALERT_RECIPIENT = "jzh_spring@163.com";

export function verifyPaddleSignature(rawBody: string, signature: string | null) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const parts = Object.fromEntries(
    signature.split(";").map((part) => {
      const [key, value] = part.trim().split("=");
      return [key, value];
    }),
  );

  if (!parts.ts || !parts.h1 || !/^\d+$/.test(parts.ts) || Math.abs(Date.now() / 1000 - Number(parts.ts)) > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parts.ts}:${rawBody}`)
    .digest("hex");
  if (parts.h1.length !== expected.length) return false;

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.h1));
}

export function getPaddlePriceIds(data: Record<string, unknown>) {
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const typedItem = item as Record<string, unknown>;
      const price = typedItem.price;
      if (price && typeof price === "object" && "id" in price) {
        return String((price as Record<string, unknown>).id);
      }
      if (typeof typedItem.price_id === "string") return typedItem.price_id;
      return null;
    })
    .filter((value): value is string => Boolean(value));
}

export function resolvePaddlePlanCode(priceIds: string[]) {
  const config = getCheckoutConfig();
  if (config.agentMonthlyPriceId && priceIds.includes(config.agentMonthlyPriceId)) return "agent_monthly";
  if (config.agentAnnualPriceId && priceIds.includes(config.agentAnnualPriceId)) return "agent_annual";
  if (priceIds.includes(config.starterMonthlyPriceId)) {
    return "starter_monthly";
  }
  if (priceIds.includes(config.starterAnnualPriceId)) {
    return "starter_annual";
  }
  if (priceIds.includes(config.proMonthlyPriceId)) return "pro_monthly";
  if (priceIds.includes(config.proAnnualPriceId)) return "pro_annual";
  return null;
}

export function isTestPayment(data: Record<string, unknown>) {
  const customData = data.custom_data;
  return (
    Boolean(customData) &&
    typeof customData === "object" &&
    (customData as Record<string, unknown>).purchase_type === "test_payment"
  );
}

export function getSubscriptionAlertRecipient() {
  return process.env.BILLING_SUBSCRIPTION_ALERT_EMAIL || DEFAULT_SUBSCRIPTION_ALERT_RECIPIENT;
}

