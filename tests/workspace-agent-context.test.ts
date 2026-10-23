import assert from "node:assert/strict";
import { test } from "node:test";
import { modelConversationMessage, modelConversationMessages } from "../src/lib/workspace/agent-context";
import type { Message } from "../src/lib/workspace/types";
const message = (id: string, metadata: Record<string, unknown> = {}, content = "original evidence"): Message => ({id, role: "assistant", created_at: "2026-10-23T01:00:00Z", content, metadata}) as Message;

test("model history removes duplicate presentation while preserving complete facts, selections, provenance and receipts", () => {
  const metadata = {parts: [{type: "text", text: "duplicate"}], agent: {steps: []}, activity: {}, reply_request_key: "internal", turn_status: "cancelled", committed_tools: true, sources: [{href: "source", title: "original"}], candidate_references: [{id: "candidate"}], role_references: [{id: "role"}], work_document_id: "doc", attachments: [{id: "file"}], email_result: {status: "sent", sent_at: "2026-10-22T23:00:00Z"}, actions: [{status: "saved"}], coverage: {truncated: true}, future_receipt: {version: 3}};
  const source = message("1", metadata, "x".repeat(100000));
  const projected = modelConversationMessage(source);
  assert.equal(projected.content, source.content);
  assert.equal(projected.created_at, source.created_at);
  assert.deepEqual(projected.metadata, Object.fromEntries(Object.entries(metadata).filter(([key]) => !["parts","agent","activity","reply_request_key"].includes(key))));
  assert.ok(source.metadata.parts, "Stored UI metadata is untouched");
  assert.deepEqual(modelConversationMessages([source]).messages, [projected]);
});

test("history pages expose earlier facts and consistently exclude undelivered instructions", () => {
  const input = Array.from({length: 65}, (_, i) => message(String(i)));
  input.push(message("queued", {delivery: "queued"}), message("removed", {delivery: "removed"}));
  const latest = modelConversationMessages(input);
  const earlier = modelConversationMessages(input, {before: latest.before_message_id!});
  const first = modelConversationMessages(input, {before: earlier.before_message_id!});
  assert.equal(latest.has_more, true);
  assert.equal(first.has_more, false);
  assert.deepEqual([...first.messages, ...earlier.messages, ...latest.messages].map(m => m.id), input.slice(0,65).map(m => m.id));
  assert.throws(() => modelConversationMessages(input,{before: "foreign"}), /boundary/);
});
