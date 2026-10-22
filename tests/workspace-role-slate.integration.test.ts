import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../src/db/client";
import { createRole, linkCandidates, updateRelationship } from "../src/lib/workspace/roles";
import { createPerson } from "../src/lib/workspace/people";
import { addRecord } from "../src/lib/workspace/records";
import { rows } from "../src/lib/workspace/database";

test("a working slate is atomic, isolated and preserves existing relationship facts", {skip:process.env.WORKSPACE_SLATE_INTEGRATION !== "true"}, async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/hirelix_workspace_qa_"));
  const rollback = new Error("rollback fixtures");
  try {
    await db.transaction(async tx => {
      const owner = randomUUID(), foreignOwner = randomUUID();
      const role = await createRole(owner, {title:"Staff Engineer", client_name:"Fictional QA", jd_text:"Billing systems"}, tx);
      const a = await createPerson(owner, {name:"QA Alex"}, tx);
      const b = await createPerson(owner, {name:"QA Casey"}, tx);
      const foreign = await createPerson(foreignOwner, {name:"Foreign candidate"}, tx);
      await assert.rejects(() => linkCandidates(owner, role.id, [a.id, foreign.id], tx));
      assert.equal((await rows(sql`SELECT id FROM hirelix_private_role_candidates WHERE role_id=${role.id}::uuid`, tx)).length, 0);
      await assert.rejects(() => linkCandidates(foreignOwner, role.id, [foreign.id], tx));
      const first = await linkCandidates(owner, role.id, [a.id, b.id, a.id], tx);
      assert.equal(first.candidates.length, 2);
      for (const candidate of first.candidates) {
        assert.equal(candidate.permission, "unknown");
        assert.equal(candidate.permission_record_id, null);
        assert.equal(candidate.interest, "");
        assert.deepEqual(candidate.assessment, {});
      }
      const evidence = await addRecord(owner, {person_id:a.id, role_id:role.id, kind:"call", title:"Permission", content:"Agreed to share with this client"}, tx);
      const prior = first.candidates.find(c => c.person_id === a.id)!;
      const updated = await updateRelationship(owner, role.id, a.id, {permission:"confirmed",permission_record_id:evidence.id,interest:"Interested",notes:"Private note",expected_version:prior.version}, tx);
      const again = await linkCandidates(owner, role.id, [a.id, b.id], tx);
      const retained = again.candidates.find(c => c.person_id === a.id)!;
      for (const field of ["version","permission","permission_record_id","interest","notes"] as const) assert.equal(retained[field], updated[field]);
      assert.equal((await rows(sql`SELECT id FROM hirelix_private_role_candidates WHERE role_id=${role.id}::uuid`, tx)).length, 2);
      // The role page counts this same existing table; no separate conversation-only list.
      assert.equal(again.href, `/app/roles/${role.id}?tab=candidates`);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await closeDb(); }
});
