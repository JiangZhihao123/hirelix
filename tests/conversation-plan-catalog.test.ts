import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { planSchemaForRoles } from "../src/lib/workspace/conversation-schema";

test("multi-role plans select current catalog refs and reject IDs or invented refs before execution", () => {
  const roleRefs = planSchemaForRoles(["role_1", "role_2"]).shape.role_refs;
  assert.deepEqual(roleRefs.parse(["role_2", "role_1"]), ["role_2", "role_1"]);
  for (const ref of ["role_3", "attachment_1", "ccb54556-8640-4cca-9365-11f78c7c3b67"]) {
    const result = roleRefs.safeParse(["role_1", ref]);
    assert.equal(result.success, false);
    if (!result.success) {
      assert.deepEqual(result.error.issues[0].path, [1]);
      assert.match(result.error.issues[0].message, /role_1.*role_2/);
    }
  }
  const schema = z.toJSONSchema(roleRefs);
  assert.deepEqual((schema.items as { enum: string[] }).enum, ["role_1", "role_2"], "model receives the same allowed references that validation enforces");
});

test("an empty workspace still permits conversation and new-role intake without inventing a saved role", () => {
  const roleRefs = planSchemaForRoles([]).shape.role_refs;
  assert.deepEqual(roleRefs.parse([]), []);
  assert.equal(roleRefs.safeParse(["role_1"]).success, false);
  assert.doesNotThrow(() => z.toJSONSchema(planSchemaForRoles([])));
});
