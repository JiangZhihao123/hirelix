import assert from "node:assert/strict";
import { test } from "node:test";
import { groundedReplySchema, replySchema } from "../src/lib/workspace/conversation-schema";

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
