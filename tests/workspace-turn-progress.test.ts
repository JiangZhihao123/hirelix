import assert from "node:assert/strict";
import { test } from "node:test";
import { isTurnRunning, turnSnapshot, turnActivity } from "../src/lib/workspace/turn-progress";
import { nextConversationView } from "../src/components/workspace/conversation-draft";

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
    updated_at: "2026-10-10T10:00:00Z", result: {live_reply: "Actual partial text", message_id: "message",
      activity: [{label: "Reading a CV", at: "2026-10-10T10:00:00Z"}], secret: "hidden", actions: [{token: "hidden"}]},
  });
  assert.equal(snapshot.result.live_reply, "Actual partial text");
  assert.equal(JSON.stringify(snapshot).includes("hidden"), false);
  assert.equal(snapshot.result.activity.length, 1);
});

test("terminal events end execution even when a partial answer remains", () => {
  for (const status of ["done", "error", "cancelled"] as const) assert.equal(isTurnRunning({status}), false);
  assert.equal(isTurnRunning({status: "queued"}), true);
  assert.equal(isTurnRunning({status: "running"}), true);
  assert.equal(isTurnRunning(null), false);
  assert.deepEqual(turnActivity({activity: [null, {label: "No timestamp"}, {label: "Read source", at: "now"}]}), [{label: "Read source", at: "now"}]);
});
