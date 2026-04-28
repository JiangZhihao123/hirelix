import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CONTACT_PACK, SEARCH_PACK, getCheckoutConfig } from "@/lib/billing";
import { supabaseAdmin } from "@/lib/supabase-server";

function logBillingEvent(eventName: string, payload: Record<string, unknown>) {
  console.log(`[billing:${eventName}] ${JSON.stringify(payload)}`);
}

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

function throwIfSupabaseError(
  error: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null,
  context: string,
) {
  if (!error) return;

  throw {
    context,
    ...error,
  };
}

function verifySignature(rawBody: string, signature: string | null) {
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

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.h1));
}

function getPriceIds(data: Record<string, unknown>) {
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

function resolvePlanCode(priceIds: string[]) {
  const config = getCheckoutConfig();
  if (priceIds.includes(config.monthlyPriceId)) return "pro_monthly";
  if (priceIds.includes(config.annualPriceId)) return "pro_annual";
  return null;
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
    const { data: bySubscription, error } = await supabaseAdmin
      .from("hirelix_user_settings")
      .select("user_id")
      .eq("paddle_subscription_id", subscriptionId)
      .maybeSingle();
    throwIfSupabaseError(error, "resolve_user_by_subscription");
    if (bySubscription?.user_id) return bySubscription.user_id as string;
  }

  if (customerId) {
    const { data: byCustomer, error } = await supabaseAdmin
      .from("hirelix_user_settings")
      .select("user_id")
      .eq("paddle_customer_id", customerId)
      .maybeSingle();
    throwIfSupabaseError(error, "resolve_user_by_customer");
    if (byCustomer?.user_id) return byCustomer.user_id as string;
  }

  return null;
}

async function recordEvent(
  eventId: string,
  eventType: string,
  userId: string | null,
  payload: Record<string, unknown>,
) {
  const { error } = await supabaseAdmin.from("hirelix_billing_events").insert({
    event_id: eventId,
    event_type: eventType,
    user_id: userId,
    payload,
  });

  if (error && error.code !== "23505") {
    throw error;
  }

  return error?.code === "23505";
}

async function updateSubscription(data: Record<string, unknown>, userId: string) {
  const priceIds = getPriceIds(data);
  const planCode = resolvePlanCode(priceIds);
  if (!planCode) return;

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

  const { error } = await supabaseAdmin.from("hirelix_user_settings").upsert(
    {
      user_id: userId,
      subscription_plan: planCode,
      subscription_status: status,
      billing_cycle: planCode === "pro_annual" ? "year" : "month",
      paddle_customer_id: customerId,
      paddle_subscription_id: subscriptionId,
      subscription_started_at:
        typeof data.started_at === "string" ? data.started_at : new Date().toISOString(),
      subscription_renews_at: renewsAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  throwIfSupabaseError(error, "update_subscription");
}

async function applyAddOns(data: Record<string, unknown>, userId: string) {
  const config = getCheckoutConfig();
  const priceIds = getPriceIds(data);
  const addSearchCredits = priceIds.includes(config.searchPackPriceId)
    ? SEARCH_PACK.credits
    : 0;
  const addEnrichCredits = priceIds.includes(config.contactPackPriceId)
    ? CONTACT_PACK.credits
    : 0;

  if (!addSearchCredits && !addEnrichCredits) return;

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from("hirelix_user_settings")
    .select("extra_search_credits, extra_enrich_credits")
    .eq("user_id", userId)
    .maybeSingle();
  throwIfSupabaseError(settingsError, "load_add_on_credits");

  const { error } = await supabaseAdmin.from("hirelix_user_settings").upsert(
    {
      user_id: userId,
      extra_search_credits: (settings?.extra_search_credits ?? 0) + addSearchCredits,
      extra_enrich_credits: (settings?.extra_enrich_credits ?? 0) + addEnrichCredits,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  throwIfSupabaseError(error, "apply_add_on_credits");
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("paddle-signature");

  if (!verifySignature(rawBody, signature)) {
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

    if (userId && eventType.startsWith("subscription.")) {
      await updateSubscription(data, userId);
    }

    if (userId && eventType === "transaction.completed") {
      await applyAddOns(data, userId);
    }

    logBillingEvent("webhook_processed", {
      event_id: eventId,
      event_type: eventType,
      user_id: userId,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const errorDetails = describeError(err);
    logBillingEvent("webhook_failed", errorDetails);
    console.error("[paddle-webhook] Error:", errorDetails);
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
