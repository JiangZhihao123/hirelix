import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_billing_events, hirelix_user_settings, user } from "@/db/schema";
import { getCheckoutConfig } from "@/lib/billing";
import { getLogger } from "@/lib/logger";

const paddleWebhookLogger = getLogger({ component: "paddle_webhook" });

function logBillingEvent(eventName: string, payload: Record<string, unknown>) {
  paddleWebhookLogger.info({ event: eventName, ...payload });
}

const DEFAULT_SUBSCRIPTION_ALERT_RECIPIENT = "jzh_spring@163.com";

function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (error && typeof error === "object") {
    const typedError = error as Record<string, unknown>;
    return {
      code: typedError.code,
      message: typedError.message,
      details: typedError.details,
      hint: typedError.hint,
      status: typedError.status,
      error: typedError.error,
    };
  }

  return {
    message: String(error),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

export function verifyPaddleSignature(rawBody: string, signature: string | null) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const parts = Object.fromEntries(
    signature.split(";").map((part) => {
      const [key, value] = part.trim().split("=");
      return [key, value];
    }),
  );

  if (!parts.ts || !parts.h1) return false;

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

function extractCustomUserId(data: Record<string, unknown>) {
  const customData = data.custom_data;
  if (!customData || typeof customData !== "object") return null;
  if (typeof (customData as Record<string, unknown>).user_id === "string") {
    return (customData as Record<string, unknown>).user_id as string;
  }
  if (typeof (customData as Record<string, unknown>).userId === "string") {
    return (customData as Record<string, unknown>).userId as string;
  }
  return null;
}

export function getSubscriptionAlertRecipient() {
  return process.env.BILLING_SUBSCRIPTION_ALERT_EMAIL || DEFAULT_SUBSCRIPTION_ALERT_RECIPIENT;
}

function getSubscriptionAlertFromEmail() {
  return process.env.BILLING_ALERTS_FROM_EMAIL || process.env.SEARCH_NOTIFICATIONS_FROM_EMAIL;
}

function extractCustomerEmail(data: Record<string, unknown>) {
  if (typeof data.customer_email === "string") return data.customer_email;
  if (data.customer && typeof data.customer === "object") {
    const email = (data.customer as Record<string, unknown>).email;
    if (typeof email === "string") return email;
  }
  if (data.custom_data && typeof data.custom_data === "object") {
    const email = (data.custom_data as Record<string, unknown>).email;
    if (typeof email === "string") return email;
  }
  return null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getUserEmail(userId: string | null) {
  if (!userId) return null;
  const rows = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.email ?? null;
}

async function notifySubscriptionAlert(params: {
  eventId: string;
  eventType: string;
  userId: string;
  data: Record<string, unknown>;
  planCode: string;
}) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = getSubscriptionAlertFromEmail();
  const to = getSubscriptionAlertRecipient();
  if (!resendApiKey || !from || !to) {
    logBillingEvent("subscription_alert_skipped", {
      event_id: params.eventId,
      reason: "missing_email_config",
    });
    return;
  }

  const customerEmail = extractCustomerEmail(params.data) || await getUserEmail(params.userId);
  const subscriptionId =
    typeof params.data.id === "string"
      ? params.data.id
      : typeof params.data.subscription_id === "string"
        ? params.data.subscription_id
        : null;
  const customerId =
    typeof params.data.customer_id === "string"
      ? params.data.customer_id
      : params.data.customer && typeof params.data.customer === "object" && typeof (params.data.customer as Record<string, unknown>).id === "string"
        ? ((params.data.customer as Record<string, unknown>).id as string)
        : null;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <h2 style="margin:0 0 12px">Hirelix has a new paid subscription</h2>
      <p>A real Paddle subscription event was processed. Time to consider enabling Apollo.</p>
      <ul>
        <li><strong>Plan:</strong> ${escapeHtml(params.planCode)}</li>
        <li><strong>Event:</strong> ${escapeHtml(params.eventType)}</li>
        <li><strong>User ID:</strong> ${escapeHtml(params.userId)}</li>
        <li><strong>Customer email:</strong> ${escapeHtml(customerEmail || "unknown")}</li>
        <li><strong>Paddle subscription:</strong> ${escapeHtml(subscriptionId || "unknown")}</li>
        <li><strong>Paddle customer:</strong> ${escapeHtml(customerId || "unknown")}</li>
      </ul>
      <p style="color:#475569;font-size:14px">This email is only sent for non-test subscription webhooks.</p>
    </div>
  `;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Hirelix paid subscriber: ${params.planCode}`,
      html,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof result?.message === "string"
      ? result.message
      : `Resend failed with status ${response.status}`;
    throw new Error(message);
  }

  logBillingEvent("subscription_alert_sent", {
    event_id: params.eventId,
    event_type: params.eventType,
    user_id: params.userId,
    recipient: to,
  });
}

async function resolveUserId(data: Record<string, unknown>) {
  const directUserId = extractCustomUserId(data);
  if (directUserId) return directUserId;

  const subscriptionId =
    typeof data.id === "string" ? data.id : typeof data.subscription_id === "string" ? data.subscription_id : null;
  const customerId =
    typeof data.customer_id === "string"
      ? data.customer_id
      : data.customer && typeof data.customer === "object" && typeof (data.customer as Record<string, unknown>).id === "string"
        ? ((data.customer as Record<string, unknown>).id as string)
        : null;

  if (subscriptionId) {
    const rows = await db
      .select({ user_id: hirelix_user_settings.user_id })
      .from(hirelix_user_settings)
      .where(eq(hirelix_user_settings.paddle_subscription_id, subscriptionId))
      .limit(1);
    if (rows[0]?.user_id) return rows[0].user_id;
  }

  if (customerId) {
    const rows = await db
      .select({ user_id: hirelix_user_settings.user_id })
      .from(hirelix_user_settings)
      .where(eq(hirelix_user_settings.paddle_customer_id, customerId))
      .limit(1);
    if (rows[0]?.user_id) return rows[0].user_id;
  }

  return null;
}

async function recordEvent(
  eventId: string,
  eventType: string,
  userId: string | null,
  payload: Record<string, unknown>,
) {
  try {
    await db.insert(hirelix_billing_events).values({
      event_id: eventId,
      event_type: eventType,
      user_id: userId,
      payload,
    });
    return false;
  } catch (error) {
    if (isUniqueViolation(error)) return true;
    throw error;
  }
}

async function updateSubscription(data: Record<string, unknown>, userId: string) {
  const priceIds = getPaddlePriceIds(data);
  const planCode = resolvePaddlePlanCode(priceIds);
  if (!planCode) return null;

  const status =
    typeof data.status === "string"
      ? data.status
      : typeof data.scheduled_change === "string"
        ? data.scheduled_change
        : "active";

  const renewsAt =
    typeof data.next_billed_at === "string"
      ? data.next_billed_at
      : data.current_billing_period && typeof data.current_billing_period === "object"
        ? ((data.current_billing_period as Record<string, unknown>).ends_at as string | null)
        : null;

  const customerId =
    typeof data.customer_id === "string"
      ? data.customer_id
      : data.customer && typeof data.customer === "object" && typeof (data.customer as Record<string, unknown>).id === "string"
        ? ((data.customer as Record<string, unknown>).id as string)
        : null;

  const subscriptionId =
    typeof data.id === "string"
      ? data.id
      : typeof data.subscription_id === "string"
        ? data.subscription_id
        : null;

  const startedAt =
    typeof data.started_at === "string" ? new Date(data.started_at) : new Date();
  const renewsAtDate = renewsAt ? new Date(renewsAt) : null;
  const billingCycle = planCode.endsWith("_annual") ? "year" : "month";
  const values = {
    user_id: userId,
    subscription_plan: planCode,
    subscription_status: status,
    billing_cycle: billingCycle,
    paddle_customer_id: customerId,
    paddle_subscription_id: subscriptionId,
    subscription_started_at: startedAt,
    subscription_renews_at: renewsAtDate,
    updated_at: new Date(),
  };
  await db
    .insert(hirelix_user_settings)
    .values(values)
    .onConflictDoUpdate({
      target: hirelix_user_settings.user_id,
      set: {
        subscription_plan: values.subscription_plan,
        subscription_status: values.subscription_status,
        billing_cycle: values.billing_cycle,
        paddle_customer_id: values.paddle_customer_id,
        paddle_subscription_id: values.paddle_subscription_id,
        subscription_started_at: values.subscription_started_at,
        subscription_renews_at: values.subscription_renews_at,
        updated_at: values.updated_at,
      },
    });
  return planCode;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("paddle-signature");

  if (!verifyPaddleSignature(rawBody, signature)) {
    logBillingEvent("webhook_invalid_signature", {});
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const eventId =
      typeof payload.event_id === "string"
        ? payload.event_id
        : typeof payload.notification_id === "string"
          ? payload.notification_id
          : typeof payload.id === "string"
            ? payload.id
            : null;
    const eventType =
      typeof payload.event_type === "string"
        ? payload.event_type
        : typeof payload.name === "string"
          ? payload.name
          : "unknown";
    const data =
      payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : {};

    if (!eventId) {
      return NextResponse.json({ error: "Missing event id" }, { status: 400 });
    }

    const userId = await resolveUserId(data);
    const isDuplicate = await recordEvent(eventId, eventType, userId, payload);
    if (isDuplicate) {
      logBillingEvent("webhook_duplicate", {
        event_id: eventId,
        event_type: eventType,
        user_id: userId,
      });
      return NextResponse.json({ ok: true, duplicate: true });
    }

    if (userId && eventType.startsWith("subscription.") && !isTestPayment(data)) {
      const planCode = await updateSubscription(data, userId);
      if (planCode && (eventType === "subscription.created" || eventType === "subscription.activated")) {
        await notifySubscriptionAlert({
          eventId,
          eventType,
          userId,
          data,
          planCode,
        });
      }
    }

    if (userId && eventType === "transaction.completed" && isTestPayment(data)) {
      logBillingEvent("webhook_test_payment_recorded", {
        event_id: eventId,
        event_type: eventType,
        user_id: userId,
      });
    }

    logBillingEvent("webhook_processed", {
      event_id: eventId,
      event_type: eventType,
      user_id: userId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const errorDetails = describeError(err);
    paddleWebhookLogger.error({ event: "webhook_failed", ...errorDetails });
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
