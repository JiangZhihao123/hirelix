import assert from "node:assert/strict";
import test from "node:test";
import { hasMailboxScope, mailboxAuthorizationURL, mailboxReadInput, mailboxSearchInput } from "../src/lib/workspace/mailbox-contract";

test("Gmail send-only reconnection excludes historical grants while preserving OAuth security parameters", () => {
  const original = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [key,value] of Object.entries({state:"fixture-state",code_challenge:"fixture-pkce",code_challenge_method:"S256",redirect_uri:"https://hirelix.online/api/auth/callback/google",scope:"openid https://www.googleapis.com/auth/gmail.send",include_granted_scopes:"true"})) original.searchParams.set(key,value);
  const sending = new URL(mailboxAuthorizationURL(original.href,"google",false));
  assert.equal(sending.searchParams.get("include_granted_scopes"),"false");
  assert.equal(sending.searchParams.get("prompt"),"consent");
  for (const key of ["state","code_challenge","code_challenge_method","redirect_uri","scope"]) assert.equal(sending.searchParams.get(key),original.searchParams.get(key));
  assert.equal(new URL(mailboxAuthorizationURL(original.href,"google",true)).searchParams.get("include_granted_scopes"),"true");
  const microsoft = new URL(mailboxAuthorizationURL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=fixture&scope=Mail.Send","microsoft",false));
  assert.equal(microsoft.searchParams.has("include_granted_scopes"),false);
});

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
