import { test } from "node:test";
import assert from "node:assert/strict";
import { mailboxCallbackURLs, mailboxResumeAllowsTool } from "../src/lib/workspace/mailbox-contract";

test("OAuth resume can prepare a preview but cannot send, cancel or publish", () => {
  assert.equal(mailboxResumeAllowsTool("email", {intent:"prepare"}), true);
  assert.equal(mailboxResumeAllowsTool("email", {intent:"status"}), true);
  for (const intent of ["confirm", "cancel", undefined]) assert.equal(mailboxResumeAllowsTool("email", {intent}), false);
  for (const name of ["share_document", "resume_work", "schedule_report", "record_delivery", "delete_candidate", "save_role", "search_mail", "read_mail"])
    assert.equal(mailboxResumeAllowsTool(name, {}), false, name);
});

test("OAuth resume can retrieve existing work without authorizing new mutations", () => {
  for (const name of ["read_document", "read_role", "read_candidate", "read_conversation", "mailbox_status"])
    assert.equal(mailboxResumeAllowsTool(name, {}), true, name);
  assert.equal(mailboxResumeAllowsTool("future_unknown_tool", {}), false);
});


test("OAuth cancellation parameters stay in the query instead of the recommendation fragment", () => {
  const urls = mailboxCallbackURLs("/app/submissions/example#recommendation-delivery", "http://localhost:3000", "google");
  const failure = new URL(`${urls.errorCallbackURL}&error=access_denied`);
  assert.equal(failure.searchParams.get("error"), "access_denied");
  assert.equal(failure.searchParams.get("mailbox_return"), "1");
  assert.equal(failure.hash, "");
  const success = new URL(urls.callbackURL);
  assert.equal(success.hash, "#recommendation-delivery");
  assert.equal(success.searchParams.get("mailbox_connected"), "google");
});

test("OAuth retry preserves context and clears stale outcomes without allowing external callbacks", () => {
  const urls = mailboxCallbackURLs("/app?conversation=example&error=access_denied&mailbox_connected=google", "http://localhost:3000", "microsoft");
  for (const value of Object.values(urls)) {
    const url = new URL(value);
    assert.equal(url.searchParams.get("conversation"), "example");
    assert.equal(url.searchParams.has("error"), false);
  }
  assert.equal(new URL(urls.errorCallbackURL).searchParams.has("mailbox_connected"), false);
  assert.throws(() => mailboxCallbackURLs("https://example.com", "http://localhost:3000", "google"));
});
