import test from "node:test";
import assert from "node:assert/strict";

import { isPaddlePortalConfigured } from "../src/lib/billing-server";

test("Paddle portal configuration trims the server API key", () => {
  const originalApiKey = process.env.PADDLE_API_KEY;

  try {
    delete process.env.PADDLE_API_KEY;
    assert.equal(isPaddlePortalConfigured(), false);

    process.env.PADDLE_API_KEY = "   ";
    assert.equal(isPaddlePortalConfigured(), false);

    process.env.PADDLE_API_KEY = "pdl_api_key";
    assert.equal(isPaddlePortalConfigured(), true);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.PADDLE_API_KEY;
    } else {
      process.env.PADDLE_API_KEY = originalApiKey;
    }
  }
});
