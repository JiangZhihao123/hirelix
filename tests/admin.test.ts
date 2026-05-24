import test from "node:test";
import assert from "node:assert/strict";

import { isAdminEmail, parseAdminEmails } from "../src/lib/admin";

test("parseAdminEmails supports comma-separated admin allowlists", () => {
  assert.deepEqual(parseAdminEmails(" owner@example.com, noahjiang2@gmail.com "), [
    "owner@example.com",
    "noahjiang2@gmail.com",
  ]);
});

test("isAdminEmail matches admins case-insensitively", () => {
  assert.equal(
    isAdminEmail("NoahJiang2@gmail.com", "owner@example.com,noahjiang2@gmail.com"),
    true,
  );
  assert.equal(isAdminEmail("someone@example.com", "owner@example.com"), false);
});
