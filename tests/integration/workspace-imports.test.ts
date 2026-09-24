import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { Document, Packer, Paragraph } from "docx";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { unzipSync, strFromU8 } from "fflate";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import {
  startImport,
  prepareImport,
  importDetails,
  confirmMapping,
  reviewImportRow,
  extractDocument,
} from "../../src/lib/workspace/imports";
import { createPerson } from "../../src/lib/workspace/people";
import { exportPerson, readFile } from "../../src/lib/workspace/files";
import { claimJob, finishJob } from "../../src/lib/workspace/jobs";
import { rows } from "../../src/lib/workspace/database";
import type { PersonInput } from "../../src/lib/workspace/types";
const database = new URL(
  process.env.DATABASE_URL ?? "postgresql://invalid/invalid",
);
if (
  !["127.0.0.1", "localhost"].includes(database.hostname) ||
  !database.pathname.startsWith("/hirelix_workspace_qa_")
)
  throw Error("Use the isolated local workspace QA database");
if (process.env.WORKSPACE_REAL_AI_TEST !== "true")
  throw Error("Set WORKSPACE_REAL_AI_TEST=true for actual model extraction");
initializeGlobalOutboundProxy();
const owner = randomUUID();
after(async () => {
  await db.execute(
    sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${owner}::uuid AND status IN ('queued','running')`,
  );
  await closeDb();
});

test("actual DOCX and PDF text extraction; scanned/empty PDF is rejected honestly", async () => {
  const docx = await Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [
            new Paragraph("Morgan Reed"),
            new Paragraph(
              "Product director with experience building enterprise software.",
            ),
          ],
        },
      ],
    }),
  );
  assert.match(
    await extractDocument({ name: "candidate.docx", bytes: docx }),
    /Morgan Reed/,
  );
  const pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf
    .addPage()
    .drawText("Morgan Reed - enterprise product director", { font, size: 12 });
  assert.match(
    await extractDocument({ name: "candidate.pdf", bytes: await pdf.save() }),
    /Morgan Reed/,
  );
  const empty = await PDFDocument.create();
  empty.addPage();
  const scanned = await empty.save();
  await assert.rejects(
    () => extractDocument({ name: "scan.pdf", bytes: scanned }),
    /no readable text/,
  );
});

test(
  "real model CSV mapping, explicit merge, source preservation and idempotent review/export",
  { timeout: 180000 },
  async () => {
    const prior = await createPerson(owner, {
      name: "Morgan Reed",
      email: "morgan@example.test",
      headline: "Product Manager",
      note: "Original recruiter relationship note",
    });
    const key = randomUUID(),
      file = {
        name: "candidates.csv",
        type: "text/csv",
        bytes: Buffer.from(
          'Given name,Family name,Email,Current role,Location,Notes\nMorgan,Reed,morgan@example.test,Product Director,London,"New imported note, retain original"\nTaylor,Park,taylor@example.test,Engineering Director,New York,No prior contact\n',
        ),
      };
    const created = await startImport(owner, file, key),
      again = await startImport(owner, file, key);
    assert.equal(created.id, again.id);
    await assert.rejects(() =>
      startImport(
        owner,
        { ...file, bytes: Buffer.from("Different file") },
        key,
      ),
    );
    const claimed = await claimJob(["import"]);
    assert(claimed);
    assert.equal(claimed.id, created.id);
    await finishJob(claimed, await prepareImport(claimed, async () => {}));
    const preview = await importDetails(owner, created.id);
    assert.equal(preview.items.length, 2);
    assert.equal(preview.job.result?.mapping_confirmed, false);
    const mapping = preview.job.result?.mapping;
    await confirmMapping(owner, created.id, mapping);
    const ready = await importDetails(owner, created.id);
    const row = ready.items[0];
    assert.equal(row.extracted.name, "Morgan Reed");
    assert(row.matches.some((match) => match.id === prior.id));
    const selected = { ...row.extracted, note: prior.note } as PersonInput;
    const saved = await reviewImportRow(owner, created.id, row.id, {
      action: "merge",
      fields: selected,
      target_person_id: prior.id,
      expected_version: prior.version,
    });
    assert.equal(saved.result_person_id, prior.id);
    const repeated = await reviewImportRow(owner, created.id, row.id, {
      action: "merge",
      fields: selected,
      target_person_id: prior.id,
      expected_version: prior.version,
    });
    assert.equal(repeated.result_person_id, prior.id);
    const [count] = await rows<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM hirelix_agent_people WHERE user_id=${owner}::uuid`,
    );
    assert.equal(count.count, 1);
    const imported = await readFile(owner, String(created.payload.file_id));
    assert.deepEqual(imported.bytes, file.bytes);
    await assert.rejects(() => readFile(randomUUID(), imported.id));
    const response = await exportPerson(owner, prior.id),
      archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const profile = JSON.parse(strFromU8(archive["profile.json"]));
    assert.equal(profile.person.headline, "Product Director");
    assert.equal(profile.person.note, prior.note);
    assert(
      profile.records.some((record: { content: string }) =>
        record.content.includes("New imported note"),
      ),
    );
    const history = JSON.parse(strFromU8(archive["history.json"]));
    assert(
      history.some(
        (entry: { snapshot: { headline?: string } }) =>
          entry.snapshot.headline === "Product Manager",
      ),
    );
    assert(
      Object.keys(archive).some((name) => name.endsWith("/candidates.csv")),
    );
    await reviewImportRow(owner, created.id, ready.items[1].id, {
      action: "skip",
    });
    console.log(
      JSON.stringify({
        rows: 2,
        merged_without_duplicate: true,
        original_file_preserved: true,
        prior_version_preserved: true,
        export_verified: true,
      }),
    );
  },
);

test("conversation upload is atomic, owned and recoverable without duplicate messages", async () => {
  const { conversationDetails } = await import(
    "../../src/lib/workspace/conversations"
  );
  const key = randomUUID(),
    file = {
      name: "chat-candidates.csv",
      type: "text/csv",
      bytes: Buffer.from("Name,Email\nJordan Quinn,jordan@example.test\n"),
    };
  const context = {
    id: null,
    role_id: null,
    person_id: null,
    message: "Please add this candidate to my pool.",
  };
  const [first, again] = await Promise.all([
    startImport(owner, file, key, context),
    startImport(owner, file, key, context),
  ]);
  assert.equal(first.id, again.id);
  assert.equal(first.payload.conversation_id, again.payload.conversation_id);
  const id = String(first.payload.conversation_id),
    detail = await conversationDetails(owner, id);
  assert.equal(detail.messages.length, 1);
  assert.equal(detail.messages[0].metadata.import_job_id, first.id);
  assert.equal(detail.messages[0].content, context.message);
  assert.equal(
    (detail.messages[0].metadata.attachment as { name: string }).name,
    file.name,
  );
  await assert.rejects(() =>
    startImport(owner, file, key, {
      ...context,
      message: "A different instruction",
    }),
  );
  await assert.rejects(() =>
    startImport(randomUUID(), file, randomUUID(), { ...context, id }),
  );
  const continued = await startImport(
    owner,
    { ...file, name: "second.csv" },
    randomUUID(),
    { ...context, id },
  );
  assert.equal(continued.payload.conversation_id, id);
  assert.equal((await conversationDetails(owner, id)).messages.length, 2);
  await assert.rejects(() => conversationDetails(randomUUID(), id));
});
