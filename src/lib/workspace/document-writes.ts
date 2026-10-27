import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { expectVersion, json, owned, rows, snapshot, uuidArray, WorkspaceError, type Runner } from "./database";
import { captureDocumentSources, preparationInput, validateDocumentSources } from "./deliverables";
import { readFile } from "./files";
import { applyDocumentEdits, documentEdits, documentSourceSelection, persistDraftRevision, revisionSources } from "./revisions";
import { linkPerson } from "./roles";
import type { Deliverable } from "./types";

const contentFile = z.object({
  file_id: z.uuid(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
const bodyFields = {
  content: z.string().max(100000).nullable().optional(),
  content_file: contentFile.nullable().optional(),
};
const metadataFields = {
  title: z.string().trim().min(1).max(500).optional(),
  audience: z.enum(["internal", "client"]).optional(),
  language: z.enum(["en", "zh"]).optional(),
  format: z.enum(["email", "recommendation"]).optional(),
};
const createSources = z.object({
  role_version: z.number().int().positive().nullable(),
  records: z.array(z.object({ id: z.uuid(), version: z.number().int().positive() })).max(100)
    .refine(items => new Set(items.map(item => item.id)).size === items.length, "Choose each record once"),
  file_ids: z.array(z.uuid()).max(50),
});
const create = preparationInput.omit({ request_key: true, instructions: true, record_ids: true, file_ids: true }).extend({
  operation: z.literal("create"),
  title: z.string().trim().min(1).max(500),
  audience: z.enum(["internal", "client"]),
  sources: createSources,
  ...bodyFields,
});
const existing = {
  document_id: z.uuid(),
  expected_version: z.number().int().positive(),
  ...metadataFields,
  sources: documentSourceSelection,
};
const patch = z.object({
  operation: z.literal("patch"),
  ...existing,
  edits: documentEdits,
});
const replace = z.object({
  operation: z.literal("replace"),
  ...existing,
  ...bodyFields,
});

// The model supplies the finished text; the service never generates or rewrites it.
export const saveDocumentInput = z.discriminatedUnion("operation", [create, patch, replace]).superRefine((input, ctx) => {
  if (input.operation !== "patch" && ((input.content != null) === (input.content_file != null)))
    ctx.addIssue({ code: "custom", message: "Supply exactly one of content or content_file" });
});
export type SaveDocumentInput = z.infer<typeof saveDocumentInput>;

function checkedContent(content: string) {
  if (!content.trim() || content.length > 100000 || content.includes("\0"))
    throw new WorkspaceError("The document must contain between 1 and 100000 characters without NUL");
  return content;
}

function receipt(document: Deliverable, operation: SaveDocumentInput["operation"], bodyFile: z.infer<typeof contentFile> | null) {
  const source = document.source_snapshot;
  const role = source.role as { id?: unknown; version?: unknown } | undefined;
  const people = Array.isArray(source.people) ? source.people as Array<{ id: unknown; version: unknown }> : [];
  const records = Array.isArray(source.records) ? source.records as Array<{ id: unknown; version: unknown }> : [];
  const files = Array.isArray(source.files) ? source.files as Array<{ id: unknown; person_id: unknown; sha256: unknown }> : [];
  const href = document.kind === "search_update"
    ? `/app/roles/${document.role_id}/updates/${document.id}`
    : `/app/submissions/${document.id}`;
  return {
    status: "saved" as const,
    operation,
    document: {
      id: document.id, title: document.title, kind: document.kind, status: document.status,
      version: document.version, href, role_id: document.role_id, person_ids: document.person_ids,
      record_ids: document.record_ids, file_ids: document.file_ids,
      audience: source.audience ?? null, language: source.language ?? null, format: source.format ?? null,
      period_start: document.period_start, period_end: document.period_end,
      period_local_start: source.period_local_start ?? null, period_local_end: source.period_local_end ?? null,
      report_timezone: source.report_timezone ?? null,
    },
    sources: {
      role: role ? { id: role.id, version: role.version } : null,
      people: people.map(person => ({ id: person.id, version: person.version })),
      records: records.map(record => ({ id: record.id, version: record.version })),
      files: files.map(file => ({ id: file.id, person_id: file.person_id, sha256: file.sha256 })),
      captured_at: source.captured_at ?? null,
      content_file: bodyFile,
    },
    statistics: {
      characters: document.content.length,
      whitespace_word_count: document.content.trim().split(/\s+/).filter(Boolean).length,
    },
  };
}

/** Resolve owned file bytes before entering the caller's mutation transaction. */
export async function prepareDocumentWrite(userId: string, value: unknown) {
  const input = saveDocumentInput.parse(value);
  let content: string | null = null;
  const bodyFile = input.operation === "patch" ? null : input.content_file ?? null;
  if (input.operation !== "patch") {
    if (bodyFile) {
      const file = await readFile(userId, bodyFile.file_id);
      const actual = createHash("sha256").update(file.bytes).digest("hex");
      if (file.sha256 !== bodyFile.sha256 || actual !== bodyFile.sha256)
        throw new WorkspaceError("The content file does not match the selected SHA-256", 409);
      try {
        content = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(file.bytes);
      } catch {
        throw new WorkspaceError("The content file must contain valid UTF-8 text");
      }
    } else content = input.content!;
    checkedContent(content);
  }

  return async (tx: Runner) => {
    if (input.operation === "create") {
      const sourceInput = preparationInput.parse({
        ...input,
        record_ids: input.sources.records.map(record => record.id),
        file_ids: input.sources.file_ids,
        request_key: "direct-document-write",
      });
      validateDocumentSources(sourceInput);
      // The former Agent preparation path established these links before capture.
      // This adds membership only, never candidate permission or interest.
      if (input.kind === "submission")
        for (const personId of input.person_ids) await linkPerson(userId, input.role_id, personId, tx);
      const source = { ...await captureDocumentSources(userId, sourceInput, tx, input.sources), audience: input.audience };
      if (JSON.stringify(source).length > 240000) throw new WorkspaceError("Select fewer source records for this document");
      const [document] = await rows<Deliverable>(sql`INSERT INTO hirelix_private_deliverables(user_id,role_id,kind,title,content,person_ids,record_ids,file_ids,source_snapshot,period_start,period_end)
        VALUES(${userId}::uuid,${input.role_id}::uuid,${input.kind},${input.title},${content!},${uuidArray(input.person_ids)},${uuidArray(sourceInput.record_ids)},${uuidArray(sourceInput.file_ids)},${json(source)},${input.period_start}::timestamptz,${input.period_end}::timestamptz) RETURNING *`, tx);
      await snapshot(userId, "deliverable", document, tx);
      return receipt(document, input.operation, bodyFile);
    }

    const document = await owned<Deliverable>(userId, "deliverable", input.document_id, tx, true);
    expectVersion(document.version, input.expected_version);
    if (document.status !== "draft") throw new WorkspaceError("The submitted copy is preserved", 409);
    const nextContent = input.operation === "patch" ? applyDocumentEdits(document.content, input.edits) : content!;
    const selected = await revisionSources(userId, document, input.sources, tx);
    const source: Record<string, unknown> = {
      ...selected.source,
      ...(input.audience ? { audience: input.audience } : {}),
      ...(input.language ? { language: input.language } : {}),
      ...(input.format ? { format: input.format } : {}),
    };
    if (!isDeepStrictEqual(source, selected.source)) source.captured_at = new Date().toISOString();
    if (JSON.stringify(source).length > 240000) throw new WorkspaceError("Select fewer source records for this document");
    const title = input.title ?? document.title;
    if (title === document.title && nextContent === document.content &&
        isDeepStrictEqual(source, document.source_snapshot) && isDeepStrictEqual(selected.recordIds, document.record_ids) &&
        isDeepStrictEqual(selected.fileIds, document.file_ids)) return receipt(document, input.operation, bodyFile);
    const updated = await persistDraftRevision(userId, document, { title, content: nextContent }, source, tx, selected.recordIds, selected.fileIds);
    return receipt(updated, input.operation, bodyFile);
  };
}
