import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/client";
import { createRole, linkPerson } from "../src/lib/workspace/roles";
import { createPerson } from "../src/lib/workspace/people";
import { addRecord } from "../src/lib/workspace/records";
import { applyAssistantAction } from "../src/lib/workspace/conversation-actions";
import { rows } from "../src/lib/workspace/database";
import type { AssistantAction } from "../src/lib/workspace/conversations";
import type { RoleCandidate } from "../src/lib/workspace/types";

test("one communication supports relationship changes without duplicating its source", { skip: process.env.WORKSPACE_COMMUNICATION_INTEGRATION !== "true" }, async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/hirelix_workspace_qa_"));
  const rollback = new Error("rollback fixtures");
  try {
    await db.transaction(async tx => {
      const owner = randomUUID();
      const role = await createRole(owner, {title:"Backend Engineer", client_name:"Fictional QA", jd_text:"Backend infrastructure"}, tx);
      const person = await createPerson(owner, {name:"QA Taylor"}, tx);
      const other = await createPerson(owner, {name:"QA Morgan"}, tx);
      const record = await addRecord(owner, {person_id:person.id, role_id:role.id, kind:"call", title:"Recruiter call", content:"Interested; sharing with this client permitted; four weeks notice."}, tx);
      const action = (): AssistantAction => ({id:randomUUID(), kind:"update_sharing_permission", title:"Record permission", status:"pending", person_id:person.id, role_id:role.id, fields:{evidence_record_id:record.id, evidence_record_version:record.version, relationship_id:null, expected_version:null, permission:"confirmed", changes:{interest:"Interested",notes:null}}});
      // Rejected references must leave even a missing relationship absent.
      for (const invalid of [
        {...action(), person_id:other.id},
        {...action(), fields:{...action().fields,evidence_record_version:record.version + 1}},
      ]) await assert.rejects(() => applyAssistantAction(owner, randomUUID(), invalid, invalid.fields, tx));
      await assert.rejects(() => applyAssistantAction(randomUUID(), randomUUID(), action(), {}, tx));
      const valid = action();
      await applyAssistantAction(owner, randomUUID(), valid, valid.fields, tx);
      const [link] = await rows<RoleCandidate>(sql`SELECT * FROM hirelix_private_role_candidates WHERE user_id=${owner}::uuid AND role_id=${role.id}::uuid AND person_id=${person.id}::uuid`, tx);
      assert.equal(link.permission, "confirmed");
      assert.equal(link.permission_record_id, record.id);
      assert.equal(link.interest, "Interested");
      const [count] = await rows<{n:number}>(sql`SELECT count(*)::int n FROM hirelix_private_records WHERE user_id=${owner}::uuid AND person_id=${person.id}::uuid AND kind='call'`, tx);
      assert.equal(count.n, 1);
      const [source] = await rows<{content:string;version:number}>(sql`SELECT content,version FROM hirelix_private_records WHERE id=${record.id}::uuid`, tx);
      assert.equal(source.content, record.content);
      assert.equal(source.version, record.version);
      const linkedAgain = await linkPerson(owner, role.id, person.id, tx);
      assert.equal(linkedAgain.permission, "confirmed");
      assert.equal(linkedAgain.version, link.version);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await closeDb();
  }
});
