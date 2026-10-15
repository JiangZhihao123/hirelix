import assert from "node:assert/strict";
import { test } from "node:test";
import { isTurnRunning, turnSnapshot, turnActivity, turnParts, continuationSuffix } from "../src/lib/workspace/turn-progress";
import { nextConversationView } from "../src/components/workspace/conversation-draft";

test("resuming keeps saved text visible before the first new stream event", () => {
  const previous = [{type: "text", text: "Already delivered paragraph."}];
  const snapshot = turnSnapshot({id: "resume", status: "queued", progress: "Queued to continue", error: null,
    updated_at: "2026-10-15T12:00:00Z", result: {previous_parts: previous, receipt_message_id: "original"}});
  assert.deepEqual(snapshot.result.parts, previous);
  assert.deepEqual(turnParts({...snapshot.result, parts: [...previous, {type: "text", text: "New continuation."}]}),
    [...previous, {type: "text", text: "New continuation."}]);
});

test("a new conversation preserves its view across URL promotion, but New and history create fresh views", () => {
  const initial = {route: "new=1", generation: 0, promotion: null};
  const accepting = {...initial, promotion: "saved-id"};
  assert.equal(nextConversationView(accepting, "new=1", null), accepting, "intermediate render before URL synchronization preserves the view");
  const saved = nextConversationView(accepting, "conversation=saved-id", "saved-id");
  assert.equal(saved.generation, initial.generation);
  const fresh = nextConversationView(saved, "new=1", null);
  assert.equal(fresh.generation, 1);
  const another = nextConversationView(fresh, "conversation=another-id", "another-id");
  assert.equal(another.generation, 2);
});

test("turn stream exposes display state without internal payloads", () => {
  const snapshot = turnSnapshot({id: "turn", status: "running", progress: "Reading a CV", error: null,
    updated_at: "2026-10-10T10:00:00Z", result: {phase: "thinking", live_reply: "Actual partial text", message_id: "message",
      receipt_message_id:"committed-message",tool_receipts:{saved:{name:"save",output:{id:"real-id"}}},
      activity: [{label: "Reading a CV", at: "2026-10-10T10:00:00Z"}], secret: "hidden", actions: [{token: "hidden"}]},
  });
  assert.equal(snapshot.result.live_reply, "Actual partial text");
  assert.equal(snapshot.result.phase, "thinking");
  assert.equal(JSON.stringify(snapshot).includes("hidden"), false);
  assert.equal(snapshot.result.activity.length, 1);
  assert.equal(snapshot.result.receipt_message_id,"committed-message");
  assert.equal(snapshot.result.receipt_count,1);
  assert.equal(JSON.stringify(snapshot).includes("real-id"),false);
});

test("terminal events end execution even when a partial answer remains", () => {
  for (const status of ["done", "error", "cancelled"] as const) assert.equal(isTurnRunning({status}), false);
  assert.equal(isTurnRunning({status: "queued"}), true);
  assert.equal(isTurnRunning({status: "running"}), true);
  assert.equal(isTurnRunning(null), false);
  assert.deepEqual(turnActivity({activity: [null, {label: "No timestamp"}, {label: "Read source", at: "now"}]}), [{label: "Read source", at: "now"}]);
});


test("interleaved text and tool events retain order through terminal snapshots", () => {
  const parts = [
    {type: "text", text: "I will read the saved role."},
    {type: "tool", id: "read-1", label: "Reading current role requirements", status: "done"},
    {type: "text", text: "The start date is missing."},
    {type: "tool", id: "read-2", label: "Reading a saved communication", status: "error"},
    {type: "text", text: "The record was unavailable."},
  ];
  for (const status of ["running", "done", "cancelled", "error"] as const) {
    const snapshot = turnSnapshot({id: "turn", status, progress: "", error: null,
      updated_at: "2026-10-12T10:00:00Z", result: {parts}});
    assert.deepEqual(snapshot.result.parts, parts);
  }
  assert.deepEqual(turnParts({parts: [null, {type: "tool", status: "invented"}, {type: "reasoning", text: "private"}]}), []);
});

test("continuation removes only an exact repeated boundary fragment", () => {
  assert.equal(continuationSuffix("Ask for a", "Ask for a range rather than one figure."), " range rather than one figure.");
  assert.equal(continuationSuffix("Ask for a", " range rather than one figure."), " range rather than one figure.");
  assert.equal(continuationSuffix("the", "evidence"), "evidence", "short accidental overlaps are not rewritten");
  assert.equal(continuationSuffix("先确认客户需求", "确认客户需求，再讨论预算。"), "，再讨论预算。");
});
