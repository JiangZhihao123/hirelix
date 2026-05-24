import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

import {
  getPaddlePriceIds,
  isTestPayment,
  resolvePaddlePlanCode,
  verifyPaddleSignature,
} from "../src/app/api/paddle/webhook/route";

function signPayload(secret: string, timestamp: string, body: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}:${body}`)
    .digest("hex");
}

test("verifyPaddleSignature accepts a valid Paddle signature", () => {
  const originalSecret = process.env.PADDLE_WEBHOOK_SECRET;
  process.env.PADDLE_WEBHOOK_SECRET = "test-webhook-secret";
  const body = JSON.stringify({ event_id: "evt_123", event_type: "transaction.completed" });
  const timestamp = "1779576000";
  const signature = `ts=${timestamp};h1=${signPayload(process.env.PADDLE_WEBHOOK_SECRET, timestamp, body)}`;

  try {
    assert.equal(verifyPaddleSignature(body, signature), true);
  } finally {
    process.env.PADDLE_WEBHOOK_SECRET = originalSecret;
  }
});

test("verifyPaddleSignature rejects malformed signatures without throwing", () => {
  const originalSecret = process.env.PADDLE_WEBHOOK_SECRET;
  process.env.PADDLE_WEBHOOK_SECRET = "test-webhook-secret";

  try {
    assert.equal(verifyPaddleSignature("{}", "ts=1779576000;h1=too-short"), false);
    assert.equal(verifyPaddleSignature("{}", null), false);
  } finally {
    process.env.PADDLE_WEBHOOK_SECRET = originalSecret;
  }
});

test("isTestPayment identifies legacy test-payment webhook metadata", () => {
  assert.equal(
    isTestPayment({
      custom_data: {
        purchase_type: "test_payment",
      },
      items: [{ price: { id: "pri_removed_test_payment" } }],
    }),
    true,
  );
  assert.equal(
    isTestPayment({
      custom_data: {
        purchase_type: "search_pack",
      },
      items: [{ price: { id: "pri_search_pack" } }],
    }),
    false,
  );
});

test("Paddle webhook maps nested and flat price ids to paid entitlements", () => {
  const originalEnv = {
    NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID:
      process.env.NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID,
    NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID:
      process.env.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID,
  };

  process.env.NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID = "pri_starter_monthly";
  process.env.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID = "pri_pro_annual";

  try {
    assert.deepEqual(
      getPaddlePriceIds({
        items: [
          { price: { id: "pri_starter_monthly" } },
          { price_id: "pri_search_pack" },
          { price: {} },
          null,
        ],
      }),
      ["pri_starter_monthly", "pri_search_pack"],
    );
    assert.equal(resolvePaddlePlanCode(["pri_starter_monthly"]), "starter_monthly");
    assert.equal(resolvePaddlePlanCode(["pri_pro_annual"]), "pro_annual");
    assert.equal(resolvePaddlePlanCode(["pri_unknown"]), null);
  } finally {
    process.env.NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID =
      originalEnv.NEXT_PUBLIC_PADDLE_STARTER_MONTHLY_PRICE_ID;
    process.env.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID =
      originalEnv.NEXT_PUBLIC_PADDLE_PRO_ANNUAL_PRICE_ID;
  }
});
