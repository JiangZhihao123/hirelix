import assert from "node:assert/strict";
import test from "node:test";
import { hasMailboxScope, mailboxReadInput, mailboxSearchInput } from "../src/lib/workspace/mailbox-contract";

test("mailbox grants distinguish provider and read from send", () => {
  assert.equal(hasMailboxScope("openid Mail.Send", "microsoft", "send"), true);
  assert.equal(hasMailboxScope("https://graph.microsoft.com/Mail.Read", "microsoft", "read"), true);
  assert.equal(hasMailboxScope("Mail.ReadBasic Mail.ReadWrite", "microsoft", "read"), false);
  assert.equal(hasMailboxScope("Mail.Send", "microsoft", "read"), false);
  assert.equal(hasMailboxScope("https://www.googleapis.com/auth/gmail.send", "google", "read"), false);
  assert.equal(hasMailboxScope("Mail.Send", "google", "send"), false);
  assert.equal(hasMailboxScope(null, "google", "send"), false);
});

test("mailbox queries require explicit provider and bounded retrieval", () => {
  assert.equal(mailboxSearchInput.safeParse({ query: "from:client@example.com" }).success, false);
  assert.equal(mailboxSearchInput.safeParse({ provider: "microsoft", query: " ", limit: 10 }).success, false);
  assert.equal(mailboxSearchInput.safeParse({ provider: "google", query: "test", limit: 21 }).success, false);
  assert.equal(mailboxSearchInput.parse({ provider: "google", query: "test" }).limit, 10);
  assert.equal(mailboxReadInput.safeParse({ provider: "google", message_id: "" }).success, false);
});
