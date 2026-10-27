import { readDocument, boundedArchive } from "./document-reader";
import { createHash } from "node:crypto";
import { MAX_ATTACHMENT_BYTES, MAX_CONVERSATION_FILES } from "./attachments";
import { readCandidateTables, type CandidateTable } from "./candidate-tables";
import { recruitCrmAttachmentPath, recruitCrmCandidateReference } from "./recruit-crm-export";
import { prepareRecruitCrmAttachment, saveRecruitCrmAttachments, type RecruitCrmAttachment } from "./recruit-crm-attachments";
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
import type { JobHandler, PreparedJob } from "./jobs";
type CandidatePrepared = PreparedJob & { candidate_source_ids?: string[] };
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
    importFields.map((key) => [key, z.array(z.string()).max(key === "email" || key === "profile_url" ? 1 : 5)]),
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
export async function extractDocument(file: { name: string; bytes: Uint8Array }) {
  return (await readDocument(file)).text;
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
    // Split each source column separately: joining two lists first would fuse
    // the last skill of one column with the first skill of the next column.
    skills: mapping.skills.flatMap((column) => (raw[column] || "")
      .split(/[,;]/)
      .map((value) => value.trim())
      .filter(Boolean)),
  };
}
// Agent tasks can save unambiguous new profiles when the recruiter requested it.
// Serialize each user's identity check + write so parallel files cannot add duplicates.
async function saveUnambiguousRows(job: Job, tx: Runner, filename: string, format: string, needsClarification = false, sourceFileId?: string) {
  const current = await owned<Job>(job.user_id, "job", job.id, tx);
  if (current.payload.save_new_candidates !== true || needsClarification) return false;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"candidate-intake:" + job.user_id},0))`);
  const items = await rows<ImportRow>(sql`SELECT * FROM hirelix_private_import_rows WHERE user_id=${job.user_id}::uuid AND job_id=${job.id}::uuid AND status='review' ${sourceFileId ? sql`AND file_id=${sourceFileId}::uuid` : sql``} ORDER BY row_number FOR UPDATE`, tx);
  for (const item of items) {
    const parsed = personInput.safeParse(item.extracted);
    if (!parsed.success) {
      const issue = parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      await tx.execute(sql`UPDATE hirelix_private_import_rows SET error=${issue} WHERE id=${item.id}::uuid AND user_id=${job.user_id}::uuid`);
      continue;
    }
    const matches = await findDuplicates(job.user_id, parsed.data, tx);
    if (matches.length) {
      await tx.execute(sql`UPDATE hirelix_private_import_rows SET matches=${json(matches)} WHERE id=${item.id}::uuid AND user_id=${job.user_id}::uuid`);
      continue;
    }
    const person = await createPerson(job.user_id, parsed.data, tx);
    const externalReference = ["csv", "tsv", "xlsx", "table"].includes(format)
      ? recruitCrmCandidateReference(JSON.parse(item.raw_text)) : null;
    await addRecord(job.user_id, {
      person_id: person.id, file_id: item.file_id, kind: ["csv", "tsv", "xlsx", "table"].includes(format) ? "profile" : "cv", title: filename,
      content: item.raw_text, details: { import_job_id: job.id, import_row: item.id, imported_fields: item.extracted,
        ...(typeof job.payload.source_message_id === "string" ? {source_message_id: job.payload.source_message_id} : {}),
        ...(externalReference ? { external_reference: externalReference } : {}) },
    }, tx);
    await tx.execute(sql`UPDATE hirelix_private_import_rows SET status='saved',action='add',target_person_id=${person.id}::uuid,result_person_id=${person.id}::uuid,error=NULL WHERE user_id=${job.user_id}::uuid AND id=${item.id}::uuid`);
  }
  return true;
}
export const prepareImport: JobHandler = async (job, progress) => {
  const primary = idSchema.parse(job.payload.file_id);
  const related = z.array(idSchema).max(MAX_CONVERSATION_FILES - 1).default([]).parse(job.payload.related_file_ids);
  const ids = [primary, ...related];
  if (new Set(ids).size !== ids.length) throw new WorkspaceError("Choose each source file only once.");
  const originals = await Promise.all(ids.map(id => readFile(job.user_id, id)));
  if (originals.length === 1 && !originals[0].name.toLowerCase().endsWith(".zip"))
    return prepareCandidateFile(job, progress, originals[0]);

  const prepared: Array<{path:string;source:Awaited<ReturnType<typeof readFile>>;part:CandidatePrepared;archive_file_id:string|null}> = [];
  const attachments: RecruitCrmAttachment[] = [];
  const unhandled: Array<{archive_file_id:string;path:string;reason:string}> = [];
  const candidateSourceIds = new Set<string>();
  let offset = 0;
  async function candidate(source: Awaited<ReturnType<typeof readFile>>, path: string, archiveFileId: string | null) {
    await progress(`Reading ${path}`);
    const part = await prepareCandidateFile(job, progress, source, offset);
    offset += Number(part.result.total);
    if (offset > 10000) throw new WorkspaceError("Import up to 10,000 candidates in one batch.");
    for (const id of part.candidate_source_ids || []) candidateSourceIds.add(id);
    prepared.push({path, source, part, archive_file_id: archiveFileId});
  }
  // Candidate sources are prepared before their associated archive files,
  // regardless of the order in which the user selected the attachments.
  for (const original of originals.filter(file => !file.name.toLowerCase().endsWith(".zip")))
    await candidate(original, original.name, null);
  for (const original of originals.filter(file => file.name.toLowerCase().endsWith(".zip"))) {
    const entries = Object.entries(boundedArchive(original.bytes)).filter(([path]) => !path.endsWith("/") && !path.startsWith("__MACOSX/") && path.split("/").at(-1) !== ".DS_Store");
    if (!entries.length || entries.length > 500) throw new WorkspaceError("Use a ZIP with 1–500 files, expanding to at most 30 MB.");
    for (const [path, bytes] of entries) {
      if (path.startsWith("/") || path.includes("\u0000") || path.includes("\\") || path.split("/").some(part => part === ".."))
        throw new WorkspaceError("The ZIP contains an unsafe file path.");
      if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES)
        throw new WorkspaceError(`${path}: each file inside the ZIP must be non-empty and up to 50 MB.`);
    }
    const paths = entries.flatMap(([path]) => {
      const ref = recruitCrmAttachmentPath(path);
      return ref ? [ref] : [];
    });
    const idsInArchive = [...new Set(paths.map(path => path.candidate_id))];
    const existingRefs = idsInArchive.length ? await rows<{source_id:string}>(sql`SELECT DISTINCT details->'external_reference'->>'id' AS source_id
      FROM hirelix_private_records WHERE user_id=${job.user_id}::uuid AND kind='profile'
        AND details->'external_reference'->>'system'='recruitcrm' AND details->'external_reference'->>'entity'='candidate'
        AND details->'external_reference'->>'id' IN (${sql.join(idsInArchive.map(id=>sql`${id}`),sql`, `)})`) : [];
    for (const reference of existingRefs) candidateSourceIds.add(reference.source_id);
    const isAttachmentExport = paths.some(path => !path.name.includes(".") || candidateSourceIds.has(path.candidate_id));
    for (const [path, bytes] of entries) {
      if (isAttachmentExport) {
        const ref = recruitCrmAttachmentPath(path);
        if (!ref) { unhandled.push({archive_file_id:original.id,path,reason:"not a candidate attachment"}); continue; }
        await progress(`Reading exported attachment ${attachments.length + 1}`);
        attachments.push(await prepareRecruitCrmAttachment({archive_file_id:original.id,path,name:ref.name,candidate_id:ref.candidate_id,bytes}));
        continue;
      }
      const extension = path.split(".").pop()?.toLowerCase() || "";
      if (!["csv", "tsv", "xlsx", "pdf", "docx", "txt", "md"].includes(extension))
        throw new WorkspaceError(`Cannot import ${path}. Use candidate tables or individual PDF, DOCX or text resumes; no files have been imported.`);
      await candidate({...original,name:path,bytes:Buffer.from(bytes)},path,original.id);
    }
  }
  if (attachments.length && job.payload.save_new_candidates !== true)
    throw new WorkspaceError("Ask the assistant to import these candidate files in the conversation before saving their associations.", 403);
  return {
    result: {file_id:primary,filename:originals[0].name,format:originals.length > 1 ? "batch" : "zip",total:offset,mapping_confirmed:true,
      input_files:originals.map(file=>({file_id:file.id,name:file.name})),
      source_files:prepared.map(({path,part})=>({path,...part.result})),unhandled_files:unhandled,
      warnings:prepared.flatMap(({path,part})=>((part.result.warnings || []) as string[]).map(warning=>`${path}: ${warning}`)),
      needs_clarification:prepared.some(({part})=>part.result.needs_clarification===true)},
    apply: async tx => {
      const sources = [];
      for (const item of prepared) {
        const saved = item.archive_file_id
          ? await saveFile(job.user_id, {name:item.path,type:"application/octet-stream",bytes:item.source.bytes}, tx)
          : item.source;
        item.source.id = saved.id;
        // Records use the stored filename (bounded by the file service); the
        // full original archive path remains in source_files.
        if (item.archive_file_id) item.source.name = saved.name;
        await item.part.apply?.(tx);
        sources.push({...item.part.result,file_id:saved.id,path:item.path,archive_file_id:item.archive_file_id});
      }
      const attachment_result = await saveRecruitCrmAttachments(job, attachments, tx);
      return {source_files:sources,attachment_result};
    },
  };
};
const prepareCandidateFile = async (job: Job, progress: Parameters<JobHandler>[1], file: Awaited<ReturnType<typeof readFile>>, offset = 0): Promise<CandidatePrepared> => {
  await progress(`Reading ${file.name}`);
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (["csv", "tsv", "xlsx"].includes(extension || "")) {
    const tables = await readCandidateTables(file);
    const mapped: Array<CandidateTable & { mapping: z.infer<typeof mappingSchema> }> = [];
    for (const table of tables) {
      await progress(`Reading candidate columns: ${table.name}`);
      // Constrain the structured response to the actual column keys. A prompt
      // alone allowed translated duplicate labels to come back without their
      // position suffix, which cannot identify either source column.
      const header = z.enum(table.headers as [string, ...string[]]);
      const tableMapping = z.object(Object.fromEntries(importFields.map(key => [key,
        z.array(header).max(key === "email" || key === "profile_url" ? 1 : 5),
      ])) as Record<ImportField, z.ZodArray<typeof header>>);
      const mapping = await structured(
        job.user_id, "private_import_mapping", tableMapping,
        "Map each candidate field to exact table header keys. The service joins the selected values with spaces for each field; skills columns are split separately on commas and semicolons. For name, select either one complete-name column or separate name components, never both, so the resulting name does not repeat. Email and profile_url each accept at most one column. Use [] when unavailable. Different keys can represent columns with the same original label; use their sample values and positions. Do not infer values or map notes into factual profile fields. Only choose headers supplied in input. This is a candidate table, not a list of employers, jobs or activities; leave name empty if it does not contain candidate identities.",
        { worksheet: table.name, headers: table.headers, source_columns: table.columns, sample: table.rows.slice(0, 5).map(row => row.fields) },
        undefined, [], { maxOutputTokens: 14000 },
      );
      if (!mapping.name.length)
        throw new WorkspaceError(`${table.name}: candidate names could not be identified. Supply a candidate table with clearly labelled name columns; other export files remain unchanged.`);
      mapped.push({ ...table, mapping });
    }
    const single = mapped.length === 1 ? mapped[0] : null;
    return {
      candidate_source_ids: [...new Set(mapped.flatMap(table => table.rows.flatMap(row => {
        const reference = recruitCrmCandidateReference(row.fields);
        return reference ? [reference.id] : [];
      })))],
      result: {
        file_id: file.id, filename: file.name, format: extension, tabular: true,
        ...(single ? { headers: single.headers, mapping: single.mapping } : {}),
        worksheets: mapped.map(table => ({ name: table.name, headers: table.headers, source_columns: table.columns, mapping: table.mapping, total: table.rows.length, source_rows: table.rows.map(row => row.line) })),
        total: mapped.reduce((total, table) => total + table.rows.length, 0),
        mapping_confirmed: job.payload.save_new_candidates === true || !single,
      },
      apply: async tx => {
        let index = 0;
        for (const table of mapped) for (const row of table.rows) {
          const value = mappedPerson(row.fields, table.mapping);
          const extracted = personInput.safeParse(value);
          const fields = extracted.success ? extracted.data : value;
          const matches = await findDuplicates(job.user_id, fields, tx);
          // Preserve every exported column; worksheet/row provenance remains
          // separate so a later mapping correction can still use raw_text.
          await tx.execute(sql`INSERT INTO hirelix_private_import_rows(user_id,job_id,row_number,file_id,raw_text,extracted,matches) VALUES(${job.user_id}::uuid,${job.id}::uuid,${offset + ++index},${file.id}::uuid,${JSON.stringify(row.fields)},${json(fields)},${json(matches)}) ON CONFLICT(job_id,row_number) DO NOTHING`);
        }
        const savedByAgent = await saveUnambiguousRows(job, tx, file.name, "table", false, file.id);
        if (savedByAgent) return { mapping_confirmed: true };
      },
    };
  }
  const source = await readDocument(file);
  const original = source.text;
  if (original.length > 180000)
    throw new WorkspaceError(
      "This CV contains more text than can be reviewed in one import. Split it into individual candidate documents.",
    );
  await progress(job.payload.save_new_candidates ? "Reading and saving the candidate profile" : "Reading the CV into a candidate draft");
  const extracted = await structured(
    job.user_id,
    "private_import_cv",
    z.object({ people: z.array(personInput).min(1).max(100), warnings: z.array(z.string()), needs_clarification: z.boolean() }),
    "Extract every candidate profile from this document, one entry per distinct person. Copy supported facts faithfully. Leave unavailable fields empty, never infer availability or permission. Preserve employment dates as written. Put only material ambiguities or transformations in warnings, as separate concise sentences. Do not list routine missing optional fields. Keep note empty unless the document contains explicit recruiter notes. Do not treat references, interviewers, or employers as candidate profiles. Report ambiguity instead of guessing identities. Set needs_clarification true only for unresolved identity or conflicting source facts that prevent faithful extraction. Missing optional details, formatting notes, and explicitly supplied fictional/sample data are not blocking ambiguities.",
    { filename: file.name, original_text: original },
    undefined,
    source.images,
  );
  return {
    result: {
      file_id: file.id, filename: file.name, format: extension,
      total: extracted.people.length, warnings: extracted.warnings, needs_clarification: extracted.needs_clarification, mapping_confirmed: true,
    },
    apply: async (tx) => {
      for (const [index, person] of extracted.people.entries()) {
        const matches = await findDuplicates(job.user_id, person, tx);
        await tx.execute(
          sql`INSERT INTO hirelix_private_import_rows(user_id,job_id,row_number,file_id,raw_text,extracted,matches) VALUES(${job.user_id}::uuid,${job.id}::uuid,${offset + index + 1},${file.id}::uuid,${original},${json(person)},${json(matches)}) ON CONFLICT(job_id,row_number) DO NOTHING`,
        );
      }
      await saveUnambiguousRows(job, tx, file.name, extension || "cv", extracted.needs_clarification, file.id);
    },
  };
};
export async function saveRequestedCandidateDrafts(userId: string, jobId: string, tx: Runner) {
  const job = await owned<Job>(userId, "job", jobId, tx, true);
  if (job.kind !== "import" || job.status !== "done") return;
  const needsClarification = job.result?.needs_clarification === true ||
    (job.result?.needs_clarification === undefined && Array.isArray(job.result?.warnings) && job.result.warnings.length > 0);
  await tx.execute(sql`UPDATE hirelix_private_jobs SET payload=payload || '{"save_new_candidates":true}'::jsonb WHERE id=${jobId}::uuid AND user_id=${userId}::uuid`);
  const authorizedJob = { ...job, payload: { ...job.payload, save_new_candidates: true } };
  if (["zip", "batch"].includes(String(job.result?.format)) && Array.isArray(job.result?.source_files)) {
    for (const source of job.result.source_files as Array<Record<string, unknown>>) {
      await saveUnambiguousRows(authorizedJob, tx, String(source.path), String(source.format), source.needs_clarification === true, idSchema.parse(source.file_id));
    }
  } else await saveUnambiguousRows(authorizedJob, tx,
    String(job.payload.filename || "Candidate source"), String(job.result?.format || "cv"), needsClarification);
  await tx.execute(sql`UPDATE hirelix_private_jobs SET result=result || '{"mapping_confirmed":true}'::jsonb,updated_at=now() WHERE id=${jobId}::uuid AND user_id=${userId}::uuid`);
}
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
  // A later Agent action may save the same source after an import failure.
  // Preserve the failed job as history; derive recovery only from persisted,
  // user-owned profile/CV records, never an assistant's claim of success.
  const savedProfiles = job.status === "error" && typeof job.payload.file_id === "string"
    ? await rows<{ id: string; name: string }>(sql`
        SELECT DISTINCT p.id,p.name FROM hirelix_private_records r
        JOIN hirelix_agent_people p ON p.id=r.person_id AND p.user_id=r.user_id
        WHERE r.user_id=${userId}::uuid AND r.file_id=${job.payload.file_id}::uuid
          AND r.kind IN ('profile','cv') AND r.created_at>${job.updated_at}::timestamptz
      `)
    : [];
  return { job, items, counts, savedProfiles, page, page_size: 50 };
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
      !(job.result?.format === "csv" || job.result?.tabular === true && Array.isArray(job.result?.headers))
    )
      throw new WorkspaceError("This table preview is not ready", 409);
    const headers = job.result.headers as string[];
    for (const columns of Object.values(mapping))
      if (columns.some((column) => !headers.includes(column)))
        throw new WorkspaceError("Choose existing table columns");
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
    const isTable = ["csv", "tsv", "xlsx"].includes((file?.name.split(".").pop() || "").toLowerCase());
    const externalReference = isTable ? recruitCrmCandidateReference(JSON.parse(item.raw_text)) : null;
    await addRecord(
      userId,
      {
        person_id: person.id,
        file_id: item.file_id,
        kind: isTable ? "profile" : "cv",
        title: file?.name || "Imported candidate source",
        content: item.raw_text,
        details: {
          import_job_id: jobId,
          import_row: rowId,
          imported_fields: item.extracted,
          ...(typeof job.payload.source_message_id === "string" ? {source_message_id: job.payload.source_message_id} : {}),
          ...(externalReference ? { external_reference: externalReference } : {}),
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
