import assert from "node:assert/strict";
import test from "node:test";
import { hashAdminPassword, validAdminHash, verifyAdminPassword } from "../src/lib/admin-password";
import { adminSameOrigin, checkAdminCredentials } from "../src/lib/admin-auth";

test("admin password hashes are salted and reject wrong passwords and malformed config", async () => {
  const password = "test-only-fixture-password";
  const a = await hashAdminPassword(password), b = await hashAdminPassword(password);
  assert.notEqual(a, b);
  assert.ok(validAdminHash(a));
  assert.equal(await verifyAdminPassword(password, a), true);
  assert.equal(await verifyAdminPassword("wrong", a), false);
  assert.equal(await verifyAdminPassword(password, "bad"), false);
  const oldUser = process.env.ADMIN_USERNAME, oldHash = process.env.ADMIN_PASSWORD_HASH;
  try {
    process.env.ADMIN_USERNAME = "operator"; process.env.ADMIN_PASSWORD_HASH = a;
    assert.equal(await checkAdminCredentials("operator", password), true);
    assert.equal(await checkAdminCredentials("other", password), false);
    process.env.ADMIN_PASSWORD_HASH = "";
    assert.equal(await checkAdminCredentials("operator", password), false);
  } finally {
    if (oldUser === undefined) delete process.env.ADMIN_USERNAME; else process.env.ADMIN_USERNAME = oldUser;
    if (oldHash === undefined) delete process.env.ADMIN_PASSWORD_HASH; else process.env.ADMIN_PASSWORD_HASH = oldHash;
  }
});
test("admin mutations require a same-origin browser request", () => {
  const make = (headers: Record<string,string>) => new Request("https://hirelix.online/api/admin/session", { headers });
  assert.equal(adminSameOrigin(make({ origin: "https://hirelix.online" })), true);
  assert.equal(adminSameOrigin(make({ origin: "https://evil.invalid" })), false);
  assert.equal(adminSameOrigin(make({})), false);
  assert.equal(adminSameOrigin(make({ origin: "https://hirelix.online", "sec-fetch-site": "cross-site" })), false);
});
