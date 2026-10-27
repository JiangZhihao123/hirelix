import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { agentRoleBrief, agentRoleChanges } from "./agent-contracts";
import { savedAssessmentsInput, saveAgentAssessments } from "./assessment";
import { candidateChangesSchema } from "./candidate-changes";
import { applyAssistantAction, declaredSource, declaredSourceSchema } from "./conversation-actions";
import { recordChangesSchema } from "./conversation-schema";
import type { AssistantAction } from "./conversations";
import { owned, rows, uuidArray, WorkspaceError, type Runner } from "./database";
import { readArchiveEntry } from "./document-reader";
import { readFile, saveImportedFile } from "./files";
import type { ToolCommit } from "./agent-execution";
import { recommendationFeedbackContext } from "./recommendation-feedback-contract";
import { registerCandidateCv } from "./records";
import { findLikelyDuplicateRoles, linkCandidates } from "./roles";
import { recordInput, roleInput, type Message, type Person, type Role, type RoleCandidate, type SourceRecord } from "./types";

export const recordFact = z.object({
  source_url: recordInput.shape.source_url.optional().describe("Exact observed source URL, or omit for the user's own material. Do not invent a link."),
  kind: z.enum(["note", "call", "email", "feedback"]),
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(100000),
  occurred_at: z.iso.datetime({ offset: true }).nullable().describe("Exact event time with offset when known; otherwise null."),
  occurred_on: z.iso.date().nullable().describe("Date-only event when no exact time is known; otherwise null."),
});
const sourceRecordFact = recordFact.extend({kind: recordInput.shape.kind});

// These are the same inputs used by the individual agent tools. Authorization
// belongs to the caller, not to an item in a normalized file.
export const recordWriteSchemas = {
  save_candidate: z.object({
    person_id: z.uuid().nullable().describe("Observed candidate ID for an update; null creates a candidate."),
    expected_version: z.number().int().positive().nullable().describe("Observed candidate version for an update; null for creation."),
    changes: candidateChangesSchema,
    source_file_id: z.uuid().nullable().describe("Owned original source file ID, or null when the source is the user's message."),
    separate_candidate_quote: z.string().nullable().describe("Exact user decision to create a separate person when identity conflicts; otherwise null. Batch rows cannot grant this authorization."),
  }),
  register_candidate_cv: z.object({person_id: z.uuid(), record_id: z.uuid(), expected_version: z.number().int().positive()}),
  save_role: z.discriminatedUnion("operation", [
    z.object({
      operation: z.literal("create"), role: roleInput.extend({brief: agentRoleBrief}),
      source_file_id: z.uuid().nullable().describe("Owned original JD file ID, or null for a user-supplied brief."), notes: z.array(recordFact).max(10),
      create_anyway: z.boolean().default(false).describe("Create a duplicate only after the user explicitly chooses a separate role. Must be false in a batch."),
    }),
    z.object({
      operation: z.literal("update"), role_id: z.uuid(), expected_version: z.number().int().positive(),
      brief: agentRoleBrief.nullable().describe("The complete current brief after a supported requirement change; null preserves the brief."), changes: agentRoleChanges,
      feedback: recordFact.pick({content: true, occurred_at: true, occurred_on: true}).extend({
        occurred_at: recordFact.shape.occurred_at.default(null), occurred_on: recordFact.shape.occurred_on.default(null), file_id: z.uuid().nullable().default(null),
      }).nullable().describe("New user-supplied feedback supporting the requirement change; otherwise null."),
      feedback_record_id: z.uuid().nullable().describe("Existing role feedback record to reuse, with its observed version; otherwise null."),
      feedback_record_version: z.number().int().positive().nullable().describe("Observed version of feedback_record_id, or null when no existing feedback is used."),
    }).refine(input => !!input.feedback_record_id === !!input.feedback_record_version, "An existing feedback record and its observed version must be supplied together."),
  ]),
  link_candidates: z.object({role_id: z.uuid(), person_ids: z.array(z.uuid()).min(1).max(30)}),
  save_assessments: savedAssessmentsInput,
  save_record: z.discriminatedUnion("operation", [
    z.object({
      operation: z.literal("create"), person_id: z.uuid().nullable(), role_id: z.uuid().nullable(),
      record: sourceRecordFact, recommendation: recommendationFeedbackContext.nullable().default(null).describe("Only for feedback on an actual client recommendation; otherwise null."),
      file_id: z.uuid().nullable().describe("Owned original file ID when the source is a file, or null for a message."),
      archive_path: z.string().min(1).max(2000).nullable().default(null).describe("Exact entry path inside the ZIP at file_id, or null."),
    }),
    z.object({operation: z.literal("update"), record_id: z.uuid(), expected_version: z.number().int().positive(), changes: recordChangesSchema}),
  ]),
  update_relationship: z.object({
    role_id: z.uuid(), person_id: z.uuid(),
    expected_version: z.number().int().positive().nullable(),
    permission: z.enum(["confirmed", "declined"]).nullable(),
    interest: z.string().max(5000).nullable().describe("Null preserves current interest; empty text clears it."),
    notes: z.string().max(20000).nullable().describe("Null preserves current notes; empty text clears them."),
    evidence: recordFact.nullable().default(null).describe("A new communication when it has not already been saved, otherwise null."),
    evidence_record_id: z.uuid().nullable().default(null).describe("Existing communication for this exact candidate and role; otherwise null."),
    evidence_record_version: z.number().int().positive().nullable().default(null).describe("Observed version of evidence_record_id; otherwise null."),
  }).refine(input => input.evidence_record_id ? !input.evidence && !!input.evidence_record_version : !!input.evidence && !input.evidence_record_version, "Supply either new evidence or an existing evidence_record_id and its version."),
} as const;

export type RecordWriteOperation = keyof typeof recordWriteSchemas;
export const recordWriteOperationSchema = z.enum(["save_candidate", "register_candidate_cv", "save_role", "link_candidates", "save_assessments", "save_record", "update_relationship"]);

export const batchSourceSchema = declaredSourceSchema.omit({normalized_file_id: true, normalized_line: true})
  .refine(source => !source.archive_path || !!source.file_id, "An archive path requires its original file ID.");
export type RecordWriteContext = {
  userId: string;
  conversationId: string;
  question: Pick<Message, "id" | "content">;
  readOriginal?: (id: string, archivePath?: string) => Promise<{name: string; text: string}>;
  batch?: {source: z.infer<typeof batchSourceSchema>; normalizedFileId: string; line: number};
};

async function action(ctx: RecordWriteContext, tx: Runner, kind: AssistantAction["kind"], title: string, fields: Record<string, unknown>, personId: string | null, roleId: string | null): Promise<ToolCommit> {
  const item: AssistantAction = {id: randomUUID(), kind, title, fields, person_id: personId, role_id: roleId, status: "pending"};
  await applyAssistantAction(ctx.userId, ctx.conversationId, item, fields, tx);
  const recordId = item.href ? new URL(item.href, "https://hirelix.invalid").searchParams.get("record") : null;
  const saved: Record<string, unknown> = {status: "saved", href: item.href};
  if (item.person_id) saved.person_id = item.person_id;
  if (item.role_id) saved.role_id = item.role_id;
  if (recordId) saved.record = await owned<SourceRecord>(ctx.userId, "record", recordId, tx);
  if (["create_candidate", "update_candidate"].includes(kind) && item.person_id) saved.person = await owned<Person>(ctx.userId, "person", item.person_id, tx);
  if (["create_role", "update_role_brief", "update_role_details"].includes(kind) && item.role_id) saved.role = await owned<Role>(ctx.userId, "role", item.role_id, tx);
  if (["update_relationship", "update_sharing_permission"].includes(kind)) {
    const [relationship] = await rows<RoleCandidate>(sql`SELECT * FROM hirelix_private_role_candidates WHERE user_id=${ctx.userId}::uuid AND person_id=${item.person_id}::uuid AND role_id=${item.role_id}::uuid`, tx);
    saved.relationship = relationship;
  }
  return {output: saved, metadata: {actions: [item]}};
}

function fact(ctx: RecordWriteContext, input: z.infer<typeof sourceRecordFact>, personId: string | null, roleId: string | null, fileId: string | null = null) {
  return recordInput.parse({
    ...input, person_id: personId, role_id: roleId, file_id: fileId,
    details: {source_message_id: ctx.question.id, occurred_on: input.occurred_at ? null : input.occurred_on, ...(ctx.batch ? {declared_source: sourceDetails(ctx)} : {})},
  });
}

function sourceDetails(ctx: RecordWriteContext) {
  if (!ctx.batch) return undefined;
  return declaredSourceSchema.parse({...ctx.batch.source, normalized_file_id: ctx.batch.normalizedFileId, normalized_line: ctx.batch.line});
}

async function validateBatchSource(ctx: RecordWriteContext, tx: Runner) {
  if (!ctx.batch) return;
  await declaredSource(ctx.userId, sourceDetails(ctx), tx);
}

// Prepare shared single-item behavior. The returned callback runs under the
// caller's authorized, lease-checked transaction and makes no model calls.
export async function prepareInternalRecordWrite(ctx: RecordWriteContext, operation: RecordWriteOperation, value: unknown): Promise<(tx: Runner) => Promise<ToolCommit>> {
  const {userId, question} = ctx;
  if (operation === "save_candidate") {
    const input = recordWriteSchemas.save_candidate.parse(value);
    if (ctx.batch && input.separate_candidate_quote) throw new WorkspaceError("A row cannot authorize creating a separate candidate. Resolve the identity in the conversation.", 409);
    if (ctx.batch && input.source_file_id && ctx.batch.source.file_id !== input.source_file_id) throw new WorkspaceError("The declared source and profile source file differ.");
    const source = !ctx.batch && input.source_file_id ? await ctx.readOriginal?.(input.source_file_id) : null;
    if (!ctx.batch && input.source_file_id && !source) throw new WorkspaceError("The original source could not be read.");
    return async tx => {
      await validateBatchSource(ctx, tx);
      return action(ctx, tx, input.person_id ? "update_candidate" : "create_candidate", "Save candidate profile", {
        changes: input.changes, expected_version: input.expected_version, source_message_id: question.id,
        source_content: ctx.batch ? "Agent-normalized candidate fields; see the declared source location and normalized input. This is not a transcript." : source?.text ?? question.content,
        source_file_id: ctx.batch ? ctx.batch.source.file_id ?? input.source_file_id ?? ctx.batch.normalizedFileId : input.source_file_id,
        source_details: sourceDetails(ctx), separate_candidate_quote: input.separate_candidate_quote, authorization_request: question.content,
      }, input.person_id, null);
    };
  }
  if (operation === "register_candidate_cv") {
    const input = recordWriteSchemas.register_candidate_cv.parse(value);
    return async tx => {
      await validateBatchSource(ctx, tx);
      const before = await owned<SourceRecord>(userId, "record", input.record_id, tx, true);
      const record = await registerCandidateCv(userId, input.person_id, input.record_id, input.expected_version, tx);
      const href = `/app/candidates?person=${record.person_id}&record=${record.id}`;
      return {output: {status: before.kind === "cv" ? "unchanged" : "saved", record, href}, metadata: {sources: [{title: record.title, href}]}};
    };
  }
  if (operation === "save_role") {
    const input = recordWriteSchemas.save_role.parse(value);
    if (input.operation === "update") {
      if (ctx.batch && input.feedback?.file_id && ctx.batch.source.file_id !== input.feedback.file_id) throw new WorkspaceError("The declared source and feedback file differ.");
      return async tx => {
        await validateBatchSource(ctx, tx);
        const role = await owned<Role>(userId, "role", input.role_id, tx);
        if (input.brief && !input.feedback && !input.feedback_record_id) throw new WorkspaceError("A changed brief needs either new scoped feedback or the ID of its existing saved feedback. Read the role records and reuse an existing source when appropriate.");
        return action(ctx, tx, input.brief ? "update_role_brief" : "update_role_details", `Update ${role.client_name} · ${role.title}`, input.brief ? {
          brief: input.brief, changes: input.changes ?? {}, expected_version: input.expected_version,
          feedback: input.feedback?.content, feedback_record_id: input.feedback_record_id, feedback_record_version: input.feedback_record_version,
          source_file_id: input.feedback?.file_id ?? ctx.batch?.source.file_id ?? null,
          occurred_at: input.feedback?.occurred_at ?? null, occurred_on: input.feedback?.occurred_on ?? null,
          source_message_id: question.id, source_details: sourceDetails(ctx),
        } : {
          changes: input.changes ?? {}, expected_version: input.expected_version, source_message_id: question.id,
          source_content: ctx.batch ? "Agent-normalized role changes; see the declared source location and normalized input. This is not a transcript." : question.content,
          source_details: sourceDetails(ctx), source_file_id: ctx.batch?.source.file_id ?? null,
        }, null, input.role_id);
      };
    }
    if (ctx.batch && input.create_anyway) throw new WorkspaceError("A row cannot authorize creating a duplicate role. Resolve the role identity in the conversation.", 409);
    if (ctx.batch && input.source_file_id && ctx.batch.source.file_id !== input.source_file_id) throw new WorkspaceError("The declared source and role source file differ.");
    const source = !ctx.batch && input.source_file_id ? await ctx.readOriginal?.(input.source_file_id) : null;
    if (!ctx.batch && input.source_file_id && !source) throw new WorkspaceError("The original source could not be read.");
    return async tx => {
      await validateBatchSource(ctx, tx);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`role-create:${userId}:${input.role.title.trim().toLocaleLowerCase()}`},0))`);
      const duplicates = await findLikelyDuplicateRoles(userId, {title: input.role.title}, tx);
      if (duplicates.length && !input.create_anyway) return {output: {created: false, possible_duplicates: duplicates.map(({id, title, client_name, status, updated_at, candidate_count}) => ({id, title, client_name, status, updated_at, candidate_count, href: `/app/roles/${id}`})), next_step: "Compare the existing roles and ask whether to reuse one or create a separate role."}};
      const sourceFileId = ctx.batch ? ctx.batch.source.file_id ?? input.source_file_id ?? ctx.batch.normalizedFileId : input.source_file_id;
      return action(ctx, tx, "create_role", `Save ${input.role.client_name} · ${input.role.title}`, {
        ...input.role, jd_text: source?.text ?? input.role.jd_text,
        ...(sourceFileId ? {source_file_id: sourceFileId, source_file_name: ctx.batch ? "Agent-normalized role input" : source?.name} : {}),
        source_details: sourceDetails(ctx), role_records: input.notes.map(note => fact(ctx, note, null, null)),
      }, null, null);
    };
  }
  if (operation === "link_candidates") {
    const input = recordWriteSchemas.link_candidates.parse(value);
    return async tx => {
      await validateBatchSource(ctx, tx);
      // Existing links remain unchanged; serialize the role so the precheck
      // and result describe the same transaction.
      await owned(userId, "role", input.role_id, tx, true);
      const prior = await rows<{person_id: string}>(sql`SELECT person_id FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND role_id=${input.role_id}::uuid AND person_id=ANY(${uuidArray(input.person_ids)})`, tx);
      const known = new Set(prior.map(row => row.person_id));
      const result = await linkCandidates(userId, input.role_id, input.person_ids, tx);
      return {output: {...result, status: input.person_ids.every(id => known.has(id)) ? "unchanged" : "saved"}, metadata: {sources: [{title: result.title, href: result.href}]}};
    };
  }
  if (operation === "save_assessments") {
    const input = recordWriteSchemas.save_assessments.parse(value);
    return async tx => {
      await validateBatchSource(ctx, tx);
      const result = await saveAgentAssessments(userId, input, tx);
      return {output: result, metadata: {sources: [{title: result.title, href: result.href}]}};
    };
  }
  if (operation === "save_record") {
    const input = recordWriteSchemas.save_record.parse(value);
    if (input.operation === "update") return async tx => {
      await validateBatchSource(ctx, tx);
      const record = await owned<SourceRecord>(userId, "record", input.record_id, tx);
      return action(ctx, tx, "update_record", `Update ${record.title}`, {record_id: record.id, expected_version: input.expected_version, changes: input.changes, source_message_id: question.id, source_details: sourceDetails(ctx)}, record.person_id, record.role_id);
    };
    if (input.archive_path && !input.file_id) throw new WorkspaceError("Choose the original ZIP for this archive entry.");
    if (ctx.batch && input.file_id && ctx.batch.source.file_id !== input.file_id) throw new WorkspaceError("The declared source and record source file differ.");
    if (ctx.batch && input.archive_path && ctx.batch.source.archive_path !== input.archive_path) throw new WorkspaceError("The declared source and archive path differ.");
    if (["cv", "attachment"].includes(input.record.kind) && !input.file_id && !ctx.batch?.source.file_id) throw new WorkspaceError("Choose the original file for this attachment.");
    const entry = input.archive_path && input.file_id ? readArchiveEntry(await readFile(userId, input.file_id), input.archive_path) : null;
    return async tx => {
      await validateBatchSource(ctx, tx);
      const sourceFile = entry ? await saveImportedFile(userId, {name: entry.name, type: entry.media_type, bytes: entry.bytes}, tx) : null;
      const record = fact(ctx, input.record, input.person_id, input.role_id, sourceFile?.id ?? input.file_id ?? ctx.batch?.source.file_id ?? null);
      // CVs must satisfy the same original-file and candidate rules as the
      // individual CV-registration tool, even when created in one step.
      if (record.kind === "cv" && !input.person_id) throw new WorkspaceError("Choose the candidate whose resume this is.");
      const result = await action(ctx, tx, "add_record", input.record.title, {...record, kind: record.kind === "cv" ? "profile" : record.kind, details: {...record.details, ...input.recommendation, ...(input.archive_path ? {source_archive_file_id: input.file_id, source_archive_path: input.archive_path} : {})}}, input.person_id, input.role_id);
      if (record.kind !== "cv") return result;
      const output = result.output as {record: SourceRecord};
      const cv = await registerCandidateCv(userId, input.person_id!, output.record.id, output.record.version, tx);
      const savedAction = result.metadata?.actions?.[0];
      if (savedAction) savedAction.fields.kind = "cv";
      return {...result, output: {...output, record: cv}};
    };
  }
  const input = recordWriteSchemas.update_relationship.parse(value);
  return async tx => {
    await validateBatchSource(ctx, tx);
    const [current] = await rows<RoleCandidate>(sql`SELECT * FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND role_id=${input.role_id}::uuid AND person_id=${input.person_id}::uuid`, tx);
    if (!current && input.expected_version !== null) throw new WorkspaceError("This candidate relationship no longer exists. Read the latest information.", 409);
    return action(ctx, tx, input.permission ? "update_sharing_permission" : "update_relationship", input.evidence?.title || "Update candidate interest and sharing", {
      ...(input.evidence ? fact(ctx, input.evidence, input.person_id, input.role_id, ctx.batch?.source.file_id ?? null) : {}), evidence_record_id: input.evidence_record_id,
      evidence_record_version: input.evidence_record_version, permission: input.permission, relationship_id: current?.id ?? null,
      expected_version: input.expected_version, changes: {interest: input.interest, notes: input.notes}, source_message_id: question.id,
    }, input.person_id, input.role_id);
  };
}
