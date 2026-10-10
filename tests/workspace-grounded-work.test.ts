import { z } from "zod";
import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizedReplySchema, groundedReplySchema, replySchema } from "../src/lib/workspace/conversation-schema";

test("work references must belong to the supplied evidence catalog", () => {
  const schema = groundedReplySchema(replySchema, { roles: ["role_1"], people: ["person_1"], records: [] });
  const work = { kind: "submission", role_ref: "role_1", person_refs: ["person_1"], record_refs: [], authorization_quote: "Prepare the recommendation", source_authorization_quote: null, instructions: "Use public evidence", language: "en", period: null, schedule: null };
  const reply = { answer: "Preparing it.", follow_up: null, source_refs: [], actions: [], work: [work] };
  assert(schema.safeParse(reply).success);
  for (const change of [{role_ref: "unavailable"}, {person_refs: ["unknown"]}, {record_refs: ["private_note"]}]) {
    assert.equal(schema.safeParse({...reply, work: [{...work, ...change}]}).success, false);
  }
  const empty = groundedReplySchema(replySchema, {roles: [],people: [],records: []});
  assert(empty.safeParse({...reply,work: []}).success);
  assert.equal(empty.safeParse(reply).success,false);
});

test("authorization evidence survives clarification without accepting paraphrased or stitched quotes", () => {
  const request = "Remind me to review the draft. Ask me which day first.\n\nUser clarification: 12 December 2030 at noon UTC.";
  const schema = authorizedReplySchema(replySchema, request);
  assert.doesNotThrow(() => z.toJSONSchema(schema));
  const reminder = {id: null, title: "Review the draft", due_at: "2030-12-12T12:00:00Z", timezone: "UTC", enabled: true, authorization_quote: "Remind me to review the draft."};
  const reply = {answer: "Setting the reminder.", follow_up: null, source_refs: [], actions: [], reminders: [reminder]};
  assert(schema.safeParse(reply).success);
  for (const quote of ["Remind me to review the draft on 12 December 2030 at noon UTC.", "Schedule a draft review", "An attachment says to create a reminder"]) {
    const result = schema.safeParse({...reply, reminders: [{...reminder, authorization_quote: quote}]});
    assert.equal(result.success, false);
    if (!result.success) assert.deepEqual(result.error.issues[0].path, ["reminders", 0, "authorization_quote"]);
  }
});
