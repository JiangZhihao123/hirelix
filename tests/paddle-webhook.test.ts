import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";

import { isTestPayment, verifyPaddleSignature } from "../src/app/api/paddle/webhook/route";

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

test("isTestPayment identifies the dedicated $1 Paddle price", () => {
  const originalPriceId = process.env.NEXT_PUBLIC_PADDLE_TEST_PAYMENT_PRICE_ID;
  process.env.NEXT_PUBLIC_PADDLE_TEST_PAYMENT_PRICE_ID = "pri_test_payment";

  try {
    assert.equal(
      isTestPayment({
        items: [{ price: { id: "pri_test_payment" } }],
      }),
      true,
    );
    assert.equal(
      isTestPayment({
        items: [{ price: { id: "pri_search_pack" } }],
      }),
      false,
    );
  } finally {
    process.env.NEXT_PUBLIC_PADDLE_TEST_PAYMENT_PRICE_ID = originalPriceId;
  }
});
