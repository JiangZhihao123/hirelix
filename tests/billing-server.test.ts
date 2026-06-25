import test from "node:test";
import assert from "node:assert/strict";

import {
  getBillableClientRoleCount,
  isPaddlePortalConfigured,
} from "../src/lib/billing-server";

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

test("released failed searches do not count against client role allowance", () => {
  assert.equal(getBillableClientRoleCount({}), 1);
  assert.equal(getBillableClientRoleCount({ client_roles_used: 1 }), 1);
  assert.equal(getBillableClientRoleCount({ client_roles_used: 0 }), 0);
  assert.equal(
    getBillableClientRoleCount({ client_role_billing_status: "released_after_failure" }),
    0,
  );
  assert.equal(
    getBillableClientRoleCount({ profile_scans_billing_status: "released_after_failure" }),
    0,
  );
});
