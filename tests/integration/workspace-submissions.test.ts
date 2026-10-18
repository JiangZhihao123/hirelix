import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../../src/db/client";
import { createPerson } from "../../src/lib/workspace/people";
import { createRole, linkPerson, updateRelationship } from "../../src/lib/workspace/roles";
import { addRecord } from "../../src/lib/workspace/records";
import { saveFile } from "../../src/lib/workspace/files";
import {
  preparationSources,
  prepareDeliverable,
  type SubmissionCv,
} from "../../src/lib/workspace/deliverables";
import { WorkspaceError } from "../../src/lib/workspace/database";

const database = new URL(
  process.env.DATABASE_URL ?? "postgresql://invalid/invalid",
);
if (
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  !database.pathname.startsWith("/hirelix_workspace_qa_")
)
  throw new Error("Use an isolated local QA database");
const owner = randomUUID();
after(async () => {
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`);
  await closeDb();
});
const invalid = (error: unknown) =>
  error instanceof WorkspaceError && error.status === 400;

test("a single submission can select multiple people and one exact CV for each", async () => {
  const role = await createRole(owner, {
    title: "VP Product",
    client_name: "QA Client",
    jd_text: "Lead product teams",
  });
  const first = await createPerson(owner, { name: "Alex Mercer" });
  const second = await createPerson(owner, { name: "Priya Shah" });
  const firstLink = await linkPerson(owner, role.id, first.id);
  await updateRelationship(owner, role.id, first.id, {...firstLink, interest: "Confirmed interest in this role", expected_version: firstLink.version});
  const otherRole = await createRole(owner, {title: "Other role", client_name: "Other client", jd_text: "Other scope"});
  const otherLink = await linkPerson(owner, otherRole.id, first.id);
  await updateRelationship(owner, otherRole.id, first.id, {...otherLink, interest: "Not interested in the other role", expected_version: otherLink.version});
  await linkPerson(owner, role.id, second.id);
  async function cv(personId: string, name: string) {
    const file = await saveFile(owner, {
      name,
      type: "application/pdf",
      bytes: Buffer.from(`%PDF-1.7\n${name}`),
    });
    await addRecord(owner, {
      person_id: personId,
      file_id: file.id,
      kind: "cv",
      title: name,
      content: `Source text for ${name}`,
    });
    return file;
  }
  const alexOriginal = await cv(first.id, "Alex-original.pdf");
  const alexRedacted = await cv(first.id, "Alex-redacted.pdf");
  const priyaCv = await cv(second.id, "Priya.pdf");
  const sources = await preparationSources(owner, role.id);
  assert.deepEqual(
    sources.files.map((file) => file.id).sort(),
    [alexOriginal.id, alexRedacted.id, priyaCv.id].sort(),
  );
  const request = {
    kind: "submission" as const,
    format: "email" as const,
    role_id: role.id,
    person_ids: [first.id, second.id],
    record_ids: [],
    file_ids: [alexRedacted.id, priyaCv.id],
    language: "zh" as const,
    period_start: null,
    period_end: null,
    period_local_start: null,
    period_local_end: null,
    instructions: "One email with a separate paragraph for each person",
    request_key: randomUUID(),
  };
  const job = await prepareDeliverable(owner, request);
  const capturedPeople = (job.payload.source as {people: Array<{id: string; role_interest: string}>}).people;
  assert.equal(capturedPeople.find(person => person.id === first.id)?.role_interest, "Confirmed interest in this role");
  assert.equal(capturedPeople.find(person => person.id === second.id)?.role_interest, "");
  assert.deepEqual(job.payload.request, { ...request, format: "email", report_timezone: null });
  const selected = (job.payload.source as { files: SubmissionCv[] }).files;
  assert.deepEqual(
    selected.map(({ person_id, id, name }) => ({ person_id, id, name })),
    [
      { person_id: first.id, id: alexRedacted.id, name: alexRedacted.name },
      { person_id: second.id, id: priyaCv.id, name: priyaCv.name },
    ],
  );
  assert(!selected.some((file) => file.id === alexOriginal.id));
  await assert.rejects(
    () =>
      prepareDeliverable(owner, {
        ...request,
        file_ids: [alexOriginal.id, alexRedacted.id],
        request_key: randomUUID(),
      }),
    invalid,
  );
  await assert.rejects(
    () =>
      prepareDeliverable(owner, {
        ...request,
        person_ids: [first.id],
        file_ids: [priyaCv.id],
        request_key: randomUUID(),
      }),
    invalid,
  );
  const draftWithoutCv = await prepareDeliverable(owner, {
    ...request,
    file_ids: [],
    request_key: randomUUID(),
  });
  assert.deepEqual(
    (draftWithoutCv.payload.source as { files: SubmissionCv[] }).files,
    [],
  );
});
