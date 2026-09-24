import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb } from "../../src/db/client";
import { createRole } from "../../src/lib/workspace/roles";
import {
  rows,
  json,
  owned,
  WorkspaceError,
} from "../../src/lib/workspace/database";
import {
  requestRevision,
  applyRevision,
} from "../../src/lib/workspace/revisions";
import { updateDeliverable } from "../../src/lib/workspace/deliverables";
import type { Deliverable } from "../../src/lib/workspace/types";
const database = new URL(
  process.env.DATABASE_URL ?? "postgresql://invalid/invalid",
);
if (
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  !database.pathname.startsWith("/hirelix_workspace_qa_")
)
  throw new Error("Use an isolated local QA database");
after(closeDb);
const failure = (status: number) => (error: unknown) =>
  error instanceof WorkspaceError && error.status === status;
test("revision proposals preserve draft, fence concurrent edits and apply exactly once", async () => {
  const owner = randomUUID(),
    other = randomUUID();
  const role = await createRole(owner, {
    title: "VP Product",
    client_name: "QA",
    jd_text: "Team leadership",
  });
  const [draft] = await rows<Deliverable>(
    sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,source_snapshot) VALUES(${owner}::uuid,${role.id}::uuid,'submission','Original','Permission is unknown',${json({ people: [] })}) RETURNING *`,
  );
  const key = randomUUID(),
    input = {
      expected_version: 1,
      instructions: "Make it concise",
      request_key: key,
    };
  const job = await requestRevision(owner, draft.id, input);
  assert.equal((await requestRevision(owner, draft.id, input)).id, job.id);
  await assert.rejects(
    () =>
      requestRevision(owner, draft.id, {
        ...input,
        instructions: "Another request",
      }),
    failure(409),
  );
  assert.equal(
    (await owned<Deliverable>(owner, "deliverable", draft.id)).content,
    draft.content,
  );
  const result = {
    title: "Revised",
    content: "Sharing permission remains unconfirmed.",
    changes: "Shortened wording",
  };
  await rows(
    sql`UPDATE hirelix_private_jobs SET status='done',result=${json(result)} WHERE id=${job.id}::uuid`,
  );
  await assert.rejects(
    () =>
      applyRevision(other, draft.id, { job_id: job.id, expected_version: 1 }),
    failure(404),
  );
  const applied = await applyRevision(owner, draft.id, {
    job_id: job.id,
    expected_version: 1,
  });
  assert.equal(applied.version, 2);
  assert.equal(
    (
      await applyRevision(owner, draft.id, {
        job_id: job.id,
        expected_version: 1,
      })
    ).version,
    2,
  );
  const stale = await requestRevision(owner, draft.id, {
    ...input,
    expected_version: 2,
    request_key: randomUUID(),
  });
  await rows(
    sql`UPDATE hirelix_private_jobs SET status='done',result=${json(result)} WHERE id=${stale.id}::uuid`,
  );
  await updateDeliverable(owner, draft.id, {
    title: "My manual edit",
    content: "Keep my changes",
    expected_version: 2,
  });
  await assert.rejects(
    () =>
      applyRevision(owner, draft.id, { job_id: stale.id, expected_version: 3 }),
    failure(409),
  );
  assert.equal(
    (await owned<Deliverable>(owner, "deliverable", draft.id)).content,
    "Keep my changes",
  );
});
