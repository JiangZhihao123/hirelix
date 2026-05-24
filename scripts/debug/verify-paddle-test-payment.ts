import fs from "node:fs";
import { and, desc, eq, sql } from "drizzle-orm";

import { db, closeDb } from "@/db/client";
import { hirelix_billing_events, hirelix_user_settings, user } from "@/db/schema";

function loadEnvFile(path: string) {
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

type PaddlePayload = {
  data?: {
    id?: string;
    custom_data?: {
      purchase_type?: string;
      user_id?: string;
    };
    items?: Array<{
      price?: {
        id?: string;
      };
    }>;
  };
};

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: { email?: string; transactionId?: string; testPriceId?: string } = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--email" && next) {
      parsed.email = next;
      index += 1;
    } else if (arg === "--transaction-id" && next) {
      parsed.transactionId = next;
      index += 1;
    } else if (arg === "--test-price-id" && next) {
      parsed.testPriceId = next;
      index += 1;
    }
  }
  return parsed;
}

function getPriceIds(payload: PaddlePayload): string[] {
  return (payload.data?.items ?? [])
    .map((item) => item.price?.id)
    .filter((priceId): priceId is string => Boolean(priceId));
}

async function main() {
  const { email, transactionId, testPriceId: testPriceIdArg } = parseArgs();
  if (!email && !transactionId) {
    throw new Error(
      "Usage: npx tsx scripts/debug/verify-paddle-test-payment.ts --email user@example.com [--transaction-id txn_...]",
    );
  }

  const testPriceId =
    testPriceIdArg?.trim() ?? process.env.NEXT_PUBLIC_PADDLE_TEST_PAYMENT_PRICE_ID?.trim();
  if (!testPriceId) {
    throw new Error("NEXT_PUBLIC_PADDLE_TEST_PAYMENT_PRICE_ID is not configured.");
  }

  const userRows = email
    ? await db
        .select({ id: user.id, email: user.email })
        .from(user)
        .where(sql`lower(${user.email}) = ${email.toLowerCase()}`)
        .limit(1)
    : [];
  const userId = userRows[0]?.id ?? null;

  const eventRows = await db
    .select({
      event_id: hirelix_billing_events.event_id,
      event_type: hirelix_billing_events.event_type,
      user_id: hirelix_billing_events.user_id,
      payload: hirelix_billing_events.payload,
      created_at: hirelix_billing_events.created_at,
    })
    .from(hirelix_billing_events)
    .where(
      and(
        eq(hirelix_billing_events.event_type, "transaction.completed"),
        transactionId
          ? sql`${hirelix_billing_events.payload}::text ilike ${`%${transactionId}%`}`
          : userId
            ? eq(hirelix_billing_events.user_id, userId)
            : sql`${hirelix_billing_events.payload}::text ilike ${`%${email}%`}`,
      ),
    )
    .orderBy(desc(hirelix_billing_events.created_at))
    .limit(10);

  const matchingEvent = eventRows.find((event) => {
    const payload = event.payload as PaddlePayload;
    return (
      payload.data?.custom_data?.purchase_type === "test_payment" &&
      getPriceIds(payload).includes(testPriceId)
    );
  });

  const settingsRows = userId
    ? await db
        .select({
          subscription_plan: hirelix_user_settings.subscription_plan,
          subscription_status: hirelix_user_settings.subscription_status,
          billing_cycle: hirelix_user_settings.billing_cycle,
          extra_search_credits: hirelix_user_settings.extra_search_credits,
          extra_enrich_credits: hirelix_user_settings.extra_enrich_credits,
          paddle_customer_id: hirelix_user_settings.paddle_customer_id,
          paddle_subscription_id: hirelix_user_settings.paddle_subscription_id,
          updated_at: hirelix_user_settings.updated_at,
        })
        .from(hirelix_user_settings)
        .where(eq(hirelix_user_settings.user_id, userId))
        .limit(1)
    : [];

  const payload = matchingEvent?.payload as PaddlePayload | undefined;
  const result = {
    ok: Boolean(matchingEvent),
    checkedEmail: email ?? null,
    expectedTestPriceId: testPriceId,
    user: userRows[0] ?? null,
    matchingEvent: matchingEvent
      ? {
          eventId: matchingEvent.event_id,
          eventType: matchingEvent.event_type,
          userId: matchingEvent.user_id,
          transactionId: payload?.data?.id ?? null,
          purchaseType: payload?.data?.custom_data?.purchase_type ?? null,
          priceIds: payload ? getPriceIds(payload) : [],
          createdAt: matchingEvent.created_at.toISOString(),
        }
      : null,
    currentSettings: settingsRows[0] ?? null,
    recentTransactionEventsChecked: eventRows.map((event) => ({
      eventId: event.event_id,
      createdAt: event.created_at.toISOString(),
    })),
  };

  console.log(JSON.stringify(result, null, 2));
  if (!matchingEvent) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
