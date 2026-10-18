import assert from "node:assert/strict";
import { test } from "node:test";
import { mailboxProviderError, microsoftSuspendedMessage } from "../src/lib/workspace/mailbox-errors";

test("account suspension points to Microsoft verification, not OAuth reconnect", () => {
  const error = mailboxProviderError("microsoft", 403, {error:{code:"ErrorAccountSuspend",message:"private provider diagnostics"}});
  assert.equal(error.message, microsoftSuspendedMessage);
  assert.equal(error.reconnect, false);
  assert.doesNotMatch(error.message, /private provider diagnostics/);
  assert.notEqual(mailboxProviderError("google",403,{error:{code:"ErrorAccountSuspend"}}).message, error.message);
});

test("authentication expiry, denied access and rate limiting have distinct recovery", () => {
  assert.equal(mailboxProviderError("microsoft",401,null).reconnect,true);
  assert.equal(mailboxProviderError("microsoft",403,null).reconnect,false);
  assert.match(mailboxProviderError("google",429,null).message,/try later/);
  for (const body of [null,{}, {error:null},{error:"bad response"}])
    assert.doesNotThrow(() => mailboxProviderError("microsoft",403,body));
});
