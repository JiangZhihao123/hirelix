import { test } from "node:test";
import assert from "node:assert/strict";
import { mailboxResumeAllowsTool } from "../src/lib/workspace/mailbox-contract";

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
