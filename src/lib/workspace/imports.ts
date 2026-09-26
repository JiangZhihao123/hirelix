import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { unzipSync } from "fflate";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  enqueue,
  json,
  owned,
  rows,
  WorkspaceError,
  type Runner,
} from "./database";
import { readFile, saveFile } from "./files";
import { structured } from "./ai";
import { createPerson, updatePerson } from "./people";
import { addRecord } from "./records";
import {
  idSchema,
  personInput,
  type ImportRow,
  type Job,
  type Person,
  type PersonInput,
} from "./types";
import type { JobHandler } from "./jobs";
export const importFields = [
  "name",
  "headline",
  "location",
  "email",
  "phone",
  "profile_url",
  "skills",
  "note",
] as const;
export type ImportField = (typeof importFields)[number];
export const mappingSchema = z.object(
  Object.fromEntries(
    importFields.map((key) => [key, z.array(z.string()).max(5)]),
  ) as Record<ImportField, z.ZodArray<z.ZodString>>,
);
export async function startImport(
  userId: string,
  file: { name: string; type: string; bytes: Uint8Array },
  key: string,
  conversation?: {
    id: string | null;
    role_id: string | null;
    person_id: string | null;
    message: string;
  },
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId + ":" + key},0))`,
    );
    const [existing] = await rows<Job>(
      sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND request_key=${key}`,
      tx,
    );
    if (existing) {
      if (existing.kind !== "import")
        throw new WorkspaceError(
          "This request key belongs to another operation",
          409,
        );
      const [original] = await rows<{ sha256: string }>(
        sql`SELECT sha256 FROM hirelix_private_files WHERE user_id=${userId}::uuid AND id=${String(existing.payload.file_id)}::uuid`,
        tx,
      );
      if (
        original?.sha256 !==
        createHash("sha256").update(file.bytes).digest("hex")
      )
        throw new WorkspaceError(
          "This import request belongs to a different file",
          409,
        );
      if (conversation) {
        const [same] = await rows<{ same: boolean }>(
          sql`SELECT payload->'conversation_request'=${json(conversation)} AS same FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND id=${existing.id}::uuid`,
          tx,
        );
        if (!same.same)
          throw new WorkspaceError(
            "This upload belongs to a different conversation or message",
            409,
          );
      } else if (existing.payload.conversation_id)
        throw new WorkspaceError("This upload belongs to a conversation", 409);
      return existing;
    }
    let conversationId = conversation?.id;
    if (conversation) {
      if (conversationId)
        await owned(userId, "conversation", conversationId, tx, true);
      else {
        if (conversation.role_id)
          await owned(userId, "role", conversation.role_id, tx);
        if (conversation.person_id)
          await owned(userId, "person", conversation.person_id, tx);
        const [created] = await rows<{ id: string }>(
          sql`INSERT INTO hirelix_private_conversations(user_id,title,role_id,person_id) VALUES(${userId}::uuid,${(conversation.message || `Import ${file.name}`).slice(0, 100)},${conversation.role_id}::uuid,${conversation.person_id}::uuid) RETURNING id`,
          tx,
        );
        conversationId = created.id;
      }
    }
    const saved = await saveFile(userId, file, tx);
    const job = await enqueue(
      userId,
      "import",
      key,
      {
        file_id: saved.id,
        filename: saved.name,
        ...(conversation
          ? {
              conversation_id: conversationId,
              conversation_request: conversation,
            }
          : {}),
      },
      tx,
    );
    if (conversation && conversationId) {
      await tx.execute(
        sql`INSERT INTO hirelix_agent_messages(user_id,role,content,conversation_id,metadata) VALUES(${userId}::uuid,'user',${conversation.message || "Please add these candidates to my pool."},${conversationId}::uuid,${json({ attachment: { file_id: saved.id, name: saved.name, size: file.bytes.length }, import_job_id: job.id })})`,
      );
      await tx.execute(
        sql`UPDATE hirelix_private_conversations SET updated_at=now() WHERE user_id=${userId}::uuid AND id=${conversationId}::uuid`,
      );
    }
    return job;
  });
}
export async function extractDocument(file: {
  name: string;
  bytes: Uint8Array;
}) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "txt" || extension === "md") {
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes).replace(/^\uFEFF/, "");
    } catch {
      throw new WorkspaceError("This text file is not readable as UTF-8");
    }
    if (!content.trim())
      throw new WorkspaceError("This text file has no readable content");
    return content;
  }
  if (extension === "docx") {
    // Check archive expansion before asking the OOXML reader to open it.
    let expanded = 0;
    unzipSync(file.bytes, {
      filter: (entry) => {
        expanded += entry.originalSize;
        if (expanded > 30 * 1024 * 1024)
          throw new WorkspaceError(
            "This Word document expands beyond the 30 MB processing limit",
          );
        return false;
      },
    });
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(file.bytes),
    });
    if (!result.value.trim())
      throw new WorkspaceError(
        "No readable text was found in this Word document. Upload a text CV.",
      );
    return result.value;
  }
  if (extension === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(file.bytes), {
      maxImageSize: 16777216,
    });
    try {
      if (pdf.numPages > 100)
        throw new WorkspaceError(
          "Upload a CV or document with 100 pages or fewer",
        );
      const result = await extractText(pdf, { mergePages: true });
      if (!result.text.trim())
        throw new WorkspaceError(
          "This PDF has no readable text. Scanned-image OCR is not available; upload a text PDF or DOCX.",
        );
      return result.text;
    } finally {
      await pdf.loadingTask.destroy();
    }
  }
  throw new WorkspaceError("Use a CSV, text PDF, DOCX, TXT or Markdown file");
}
export async function findDuplicates(
  userId: string,
  input: Partial<PersonInput>,
  tx: Runner = db,
) {
  return rows<{ id: string; name: string; reason: string }>(
    sql`SELECT id,name,CASE WHEN ${!!input.email} AND lower(email)=lower(${input.email || ""}) THEN 'Same email' WHEN ${!!input.profile_url} AND profile_url=${input.profile_url || ""} THEN 'Same profile URL' ELSE 'Same name — review identity' END AS reason FROM hirelix_agent_people WHERE user_id=${userId}::uuid AND ((${!!input.email} AND lower(email)=lower(${input.email || ""})) OR (${!!input.profile_url} AND profile_url=${input.profile_url || ""}) OR (${!!input.name} AND lower(name)=lower(${input.name || ""}))) ORDER BY updated_at DESC LIMIT 20`,
    tx,
  );
}
function mappedPerson(
  raw: Record<string, string>,
  mapping: z.infer<typeof mappingSchema>,
) {
  const result = Object.fromEntries(
    importFields.map((key) => [
      key,
      mapping[key]
        .map((column) => raw[column] || "")
        .filter(Boolean)
        .join(" "),
    ]),
  );
  return {
    ...result,
    skills: String(result.skills || "")
      .split(/[,;]/)
      .map((value) => value.trim())
      .filter(Boolean),
  };
}
export const prepareImport: JobHandler = async (job, progress) => {
  const file = await readFile(job.user_id, idSchema.parse(job.payload.file_id));
  await progress(`Reading ${file.name}`);
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "csv") {
    let parsed: string[][];
    try {
      parsed = parse(file.bytes, {
        bom: true,
        skip_empty_lines: true,
        max_record_size: 500000,
        relax_column_count: false,
      });
    } catch {
      throw new WorkspaceError(
        "The CSV could not be read. Check that rows use a consistent number of columns and quoted fields are closed.",
      );
    }
    const headers = parsed[0]?.map((value) => value.trim());
    if (!headers?.length || parsed.length < 2)
      throw new WorkspaceError(
        "Add a header row and at least one candidate to this CSV",
      );
    if (
      new Set(headers).size !== headers.length ||
      headers.some((value) => !value)
    )
      throw new WorkspaceError(
        "Each CSV column needs a unique, non-empty header",
      );
    if (parsed.length > 10001 || headers.length > 100)
      throw new WorkspaceError(
        "Import up to 10,000 rows and 100 columns per CSV",
      );
    const rawRows = parsed
      .slice(1)
      .map((values) =>
        Object.fromEntries(
          headers.map((header, index) => [header, values[index] || ""]),
        ),
      );
    await progress("Preparing column mapping for your review");
    const mapping = await structured(
      job.user_id,
      "private_import_mapping",
      mappingSchema,
      "Map each candidate field to zero or more exact CSV header names. Multiple name columns may be combined, e.g. first and last name. Return [] when unavailable. Do not infer values or map notes into factual profile fields. Only choose headers supplied in input.",
      { headers, sample: rawRows.slice(0, 5) },
    );
    for (const columns of Object.values(mapping))
      if (columns.some((column) => !headers.includes(column)))
        throw new WorkspaceError(
          "The proposed mapping referenced an unknown column. Retry the import.",
          502,
        );
    return {
      result: {
        file_id: file.id,
        filename: file.name,
        format: "csv",
        headers,
        mapping,
        total: rawRows.length,
        mapping_confirmed: false,
      },
      apply: async (tx) => {
        for (let index = 0; index < rawRows.length; index++) {
          const value = mappedPerson(rawRows[index], mapping);
          const extracted = personInput.safeParse(value);
          const fields = extracted.success ? extracted.data : value;
          const matches = await findDuplicates(job.user_id, fields, tx);
          await tx.execute(
            sql`INSERT INTO hirelix_private_import_rows(user_id,job_id,row_number,file_id,raw_text,extracted,matches) VALUES(${job.user_id}::uuid,${job.id}::uuid,${index + 1},${file.id}::uuid,${JSON.stringify(rawRows[index])},${json(fields)},${json(matches)}) ON CONFLICT(job_id,row_number) DO NOTHING`,
          );
        }
      },
    };
  }
  const original = await extractDocument(file);
  if (original.length > 180000)
    throw new WorkspaceError(
      "This CV contains more text than can be reviewed in one import. Split it into individual candidate documents.",
    );
  await progress("Reading the CV into a candidate draft");
  const extracted = await structured(
    job.user_id,
    "private_import_cv",
    z.object({ person: personInput, warnings: z.array(z.string()) }),
    "Extract one candidate profile from this CV. Copy supported facts faithfully. Leave unavailable fields empty, never infer availability or permission. Preserve employment dates as written. Put only material ambiguities or transformations the recruiter must verify in warnings, as separate concise sentences. Do not list routine missing optional fields or restate that fields were left empty. Keep note empty unless the document contains explicit recruiter notes. This is a draft the recruiter will review before saving.",
    { filename: file.name, original_text: original },
  );
  const matches = await findDuplicates(job.user_id, extracted.person);
  return {
    result: {
      file_id: file.id,
      filename: file.name,
      format: extension,
      total: 1,
      warnings: extracted.warnings,
      mapping_confirmed: true,
    },
    apply: async (tx) => {
      await tx.execute(
        sql`INSERT INTO hirelix_private_import_rows(user_id,job_id,row_number,file_id,raw_text,extracted,matches) VALUES(${job.user_id}::uuid,${job.id}::uuid,1,${file.id}::uuid,${original},${json(extracted.person)},${json(matches)}) ON CONFLICT(job_id,row_number) DO NOTHING`,
      );
    },
  };
};
export async function importDetails(userId: string, id: string, page = 1) {
  const job = await owned<Job>(userId, "job", id);
  if (job.kind !== "import")
    throw new WorkspaceError("This is not an import task", 404);
  const items = await rows<ImportRow>(
    sql`SELECT * FROM hirelix_private_import_rows WHERE user_id=${userId}::uuid AND job_id=${id}::uuid ORDER BY row_number LIMIT 50 OFFSET ${(page - 1) * 50}`,
  );
  const counts = await rows<{ status: string; count: number }>(
    sql`SELECT status,count(*)::int AS count FROM hirelix_private_import_rows WHERE user_id=${userId}::uuid AND job_id=${id}::uuid GROUP BY status`,
  );
  return { job, items, counts, page, page_size: 50 };
}
export async function confirmMapping(
  userId: string,
  id: string,
  value: unknown,
) {
  const mapping = mappingSchema.parse(value);
  return db.transaction(async (tx) => {
    const job = await owned<Job>(userId, "job", id, tx, true);
    if (
      job.kind !== "import" ||
      job.status !== "done" ||
      job.result?.format !== "csv"
    )
      throw new WorkspaceError("This CSV preview is not ready", 409);
    const headers = job.result.headers as string[];
    for (const columns of Object.values(mapping))
      if (columns.some((column) => !headers.includes(column)))
        throw new WorkspaceError("Choose existing CSV columns");
    if (!mapping.name.length)
      throw new WorkspaceError(
        "Choose the column or columns containing the candidate name",
      );
    const items = await rows<ImportRow>(
      sql`SELECT * FROM hirelix_private_import_rows WHERE user_id=${userId}::uuid AND job_id=${id}::uuid ORDER BY row_number FOR UPDATE`,
      tx,
    );
    if (items.some((item) => item.status === "saved"))
      throw new WorkspaceError(
        "Some rows have already been saved. Start a new import to change the mapping.",
        409,
      );
    for (const item of items) {
      const fields = mappedPerson(JSON.parse(item.raw_text), mapping);
      const parsed = personInput.safeParse(fields);
      const extracted = parsed.success ? parsed.data : fields;
      const matches = await findDuplicates(userId, extracted, tx);
      await tx.execute(
        sql`UPDATE hirelix_private_import_rows SET extracted=${json(extracted)},matches=${json(matches)},status='review',action='review',error=NULL WHERE user_id=${userId}::uuid AND id=${item.id}::uuid`,
      );
    }
    await tx.execute(
      sql`UPDATE hirelix_private_jobs SET result=${json({ ...job.result, mapping, mapping_confirmed: true })},updated_at=now() WHERE user_id=${userId}::uuid AND id=${id}::uuid`,
    );
    return { confirmed: true };
  });
}
export const reviewRowInput = z.object({
  action: z.enum(["add", "merge", "skip"]),
  fields: personInput.optional(),
  target_person_id: idSchema.optional(),
  expected_version: z.number().int().positive().optional(),
});
export async function reviewImportRow(
  userId: string,
  jobId: string,
  rowId: string,
  value: unknown,
) {
  const input = reviewRowInput.parse(value);
  return db.transaction(async (tx) => {
    const job = await owned<Job>(userId, "job", jobId, tx, true);
    if (
      job.kind !== "import" ||
      job.status !== "done" ||
      !job.result?.mapping_confirmed
    )
      throw new WorkspaceError("Confirm the import preview first", 409);
    const [item] = await rows<ImportRow>(
      sql`SELECT * FROM hirelix_private_import_rows WHERE user_id=${userId}::uuid AND job_id=${jobId}::uuid AND id=${rowId}::uuid FOR UPDATE`,
      tx,
    );
    if (!item) throw new WorkspaceError("Import row not found", 404);
    if (item.status === "saved" || item.status === "skipped") return item;
    if (input.action === "skip") {
      const [skipped] = await rows<ImportRow>(
        sql`UPDATE hirelix_private_import_rows SET status='skipped',action='skip' WHERE user_id=${userId}::uuid AND id=${rowId}::uuid RETURNING *`,
        tx,
      );
      return skipped;
    }
    const fields = personInput.parse(input.fields || item.extracted);
    let person: Person;
    if (input.action === "merge") {
      if (!input.target_person_id || !input.expected_version)
        throw new WorkspaceError(
          "Choose an existing candidate and review the fields before merging",
        );
      person = await updatePerson(
        userId,
        input.target_person_id,
        fields,
        input.expected_version,
        tx,
      );
    } else person = await createPerson(userId, fields, tx);
    const file = item.file_id ? await readFile(userId, item.file_id) : null;
    await addRecord(
      userId,
      {
        person_id: person.id,
        file_id: item.file_id,
        kind: job.result.format === "csv" ? "profile" : "cv",
        title: file?.name || "Imported candidate source",
        content: item.raw_text,
        details: {
          import_job_id: jobId,
          import_row: rowId,
          imported_fields: item.extracted,
        },
      },
      tx,
    );
    const [saved] = await rows<ImportRow>(
      sql`UPDATE hirelix_private_import_rows SET status='saved',action=${input.action},target_person_id=${person.id}::uuid,result_person_id=${person.id}::uuid,error=NULL WHERE user_id=${userId}::uuid AND id=${rowId}::uuid RETURNING *`,
      tx,
    );
    return saved;
  });
}
