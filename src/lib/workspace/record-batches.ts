import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { agentCreditContext } from "@/lib/agent-credit-context";
import { activeAgentJob } from "./agent-execution";
import { enqueue, json, owned, rows, WorkspaceError, type Runner } from "./database";
import { MAX_FILE_BYTES, readFile, saveFile, type PrivateFile } from "./files";
import { LostLease, type JobHandler } from "./jobs";
import { batchSourceSchema, prepareInternalRecordWrite, recordWriteOperationSchema, recordWriteSchemas } from "./record-writes";
import type { Job, Message } from "./types";

const CHUNK_SIZE = 25;
const MAX_ROWS = 50000;

export const recordBatchInput = z.object({
  write_operation: recordWriteOperationSchema,
  input_file: z.object({file_id: z.uuid(), sha256: z.string().regex(/^[0-9a-f]{64}$/)}).strict(),
}).strict();
export const recordBatchRow = z.object({input: z.unknown(), source: batchSourceSchema}).strict();

type Counts = {applied: number; unchanged: number; conflict: number; failed: number; unprocessed: number};
type Receipt = {type: "item"; line: number; status: "applied" | "unchanged" | "conflict" | "failed"; result?: Record<string, unknown>; error?: {code: number; message: string}};

// The caller performs the conversation authorization before this function and
// invokes it inside the parent tool receipt transaction.
export async function enqueueRecordBatch(job: Job, question: Pick<Message, "id">, value: unknown, key: string, tx: Runner, parentTrace?: unknown) {
  const input = recordBatchInput.parse(value);
  const current = await activeAgentJob(job, tx, true);
  if (current.kind !== "chat" || current.payload.message_id !== question.id || typeof current.payload.conversation_id !== "string")
    throw new WorkspaceError("This batch must belong to the active conversation request.", 409);
  const [message] = await rows<Message>(sql`SELECT * FROM hirelix_agent_messages WHERE id=${question.id}::uuid AND user_id=${job.user_id}::uuid AND conversation_id=${current.payload.conversation_id}::uuid AND role='user'`, tx);
  if (!message) throw new WorkspaceError("The authorizing instruction was not found.", 403);
  const [file] = await rows<PrivateFile>(sql`SELECT id,user_id,name,media_type,byte_size,sha256,created_at FROM hirelix_private_files WHERE id=${input.input_file.file_id}::uuid AND user_id=${job.user_id}::uuid AND upload_id IS NULL`, tx);
  if (!file) throw new WorkspaceError("The normalized input file was not found.", 404);
  if (file.sha256 !== input.input_file.sha256) throw new WorkspaceError("The normalized input file changed. Use its current SHA-256.", 409);
  return enqueue(job.user_id, "import", `assistant-import:${job.id}:${key}`, {
    operation: "record_batch", write_operation: input.write_operation, input_file: input.input_file,
    file_id: file.id, conversation_id: current.payload.conversation_id, source_message_id: question.id,
    parent_chat_job_id: job.id, ...(parentTrace ? {parent_trace: parentTrace} : {}),
  }, tx);
}

async function lockedBatch(job: Job, tx: Runner) {
  const parentId = job.payload.parent_chat_job_id;
  const parentLease = job.payload.parent_chat_lease_token;
  if (typeof parentId !== "string" || typeof parentLease !== "string") throw new LostLease();
  const parent = await owned<Job>(job.user_id, "job", parentId, tx, true);
  if (parent.kind !== "chat" || parent.status !== "running" || parent.lease_token !== parentLease || !parent.lease_until || new Date(parent.lease_until).getTime() <= Date.now() || parent.payload.conversation_id !== job.payload.conversation_id) throw new LostLease();
  return activeAgentJob(job, tx, true);
}

function outputSummary(output: unknown): Record<string, unknown> {
  if (!output || typeof output !== "object") return {};
  const item = output as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of ["person_id", "role_id", "href"]) if (typeof item[key] === "string") result[key] = item[key];
  if (item.record && typeof item.record === "object" && typeof (item.record as {id?: unknown}).id === "string") result.record_id = (item.record as {id: string}).id;
  if (Array.isArray(item.candidates)) result.candidates = item.candidates.map(candidate => ({person_id: candidate.person_id, version: candidate.version}));
  if (Array.isArray(item.possible_duplicates)) result.possible_duplicates = item.possible_duplicates.map(candidate => ({id: candidate.id, href: candidate.href}));
  return result;
}

function invalidInput(error: z.ZodError) {
  const message = error.issues.slice(0, 5).map(issue => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
  return {code: 400, message: message.slice(0, 500)};
}

function countsFrom(value: unknown, total: number): Counts {
  const schema = z.object({applied: z.number().int().nonnegative(), unchanged: z.number().int().nonnegative(), conflict: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), unprocessed: z.number().int().nonnegative()});
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new WorkspaceError("The batch checkpoint is invalid.", 500);
  const counts = parsed.data;
  if (counts.applied + counts.unchanged + counts.conflict + counts.failed + counts.unprocessed !== total) throw new WorkspaceError("The batch checkpoint does not match its input.", 500);
  return counts;
}

async function appendReport(userId: string, fileId: string, text: string, tx: Runner) {
  const bytes = Buffer.from(text, "utf8");
  const [file] = await rows<PrivateFile>(sql`UPDATE hirelix_private_files SET bytes=bytes || decode(${bytes.toString("base64")},'base64'),byte_size=byte_size+${bytes.length},sha256=encode(sha256(bytes || decode(${bytes.toString("base64")},'base64')),'hex') WHERE user_id=${userId}::uuid AND id=${fileId}::uuid AND upload_id IS NULL AND byte_size+${bytes.length}<=${MAX_FILE_BYTES} RETURNING id,user_id,name,media_type,byte_size,sha256,created_at`, tx);
  if (!file) throw new WorkspaceError("The batch result file is unavailable or exceeds its size limit.", 500);
  return file;
}

// Each bounded chunk locks the current parent and child leases. Individual
// savepoints keep validation conflicts isolated, while every business write,
// receipt, count and report update shares the enclosing transaction.
export const prepareRecordBatch: JobHandler = async (job, progress) => {
  if (job.kind !== "import" || job.payload.operation !== "record_batch") throw new WorkspaceError("This is not a record batch.");
  const input = recordBatchInput.parse({write_operation: job.payload.write_operation, input_file: job.payload.input_file});
  const signal = agentCreditContext.getStore()?.signal;
  signal?.throwIfAborted();
  const file = await readFile(job.user_id, input.input_file.file_id);
  if (file.sha256 !== input.input_file.sha256 || createHash("sha256").update(file.bytes).digest("hex") !== input.input_file.sha256) throw new WorkspaceError("The normalized input file no longer matches its SHA-256.", 409);
  let text: string;
  try { text = new TextDecoder("utf-8", {fatal: true}).decode(file.bytes); }
  catch { throw new WorkspaceError("The normalized JSONL file must use UTF-8."); }
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (!lines.length || lines.length > MAX_ROWS) throw new WorkspaceError(`The normalized file must contain between 1 and ${MAX_ROWS} lines.`);
  const total = lines.length;
  const conversationId = String(job.payload.conversation_id || "");
  const [question] = await rows<Message>(sql`SELECT * FROM hirelix_agent_messages WHERE id=${String(job.payload.source_message_id)}::uuid AND user_id=${job.user_id}::uuid AND conversation_id=${conversationId}::uuid AND role='user'`);
  if (!question) throw new WorkspaceError("The original instruction for this batch was not found.", 403);
  const initial = await db.transaction(async tx => {
    signal?.throwIfAborted();
    const current = await lockedBatch(job, tx);
    const prior = current.result?.record_batch as Record<string, unknown> | undefined;
    if (prior) {
      if (prior.total !== total || prior.input_sha256 !== input.input_file.sha256 || prior.write_operation !== input.write_operation || typeof prior.result_file_id !== "string") throw new WorkspaceError("The batch checkpoint does not match this input.", 409);
      countsFrom(prior.counts, total);
      const [report] = await rows<{id: string}>(sql`SELECT id FROM hirelix_private_files WHERE id=${prior.result_file_id}::uuid AND user_id=${job.user_id}::uuid AND upload_id IS NULL`, tx);
      if (!report) throw new WorkspaceError("The batch result file was not found.", 404);
      return prior;
    }
    const counts: Counts = {applied: 0, unchanged: 0, conflict: 0, failed: 0, unprocessed: total};
    const report = await saveFile(job.user_id, {name: `record-batch-${job.id}.jsonl`, type: "application/x-ndjson", bytes: Buffer.from(`${JSON.stringify({type: "summary", total, counts})}\n`)}, tx);
    const state = {total, counts, input_sha256: input.input_file.sha256, write_operation: input.write_operation, result_file_id: report.id, result_file_sha256: report.sha256};
    await tx.execute(sql`UPDATE hirelix_private_jobs SET result=coalesce(result,'{}'::jsonb) || ${json({record_batch: state})},updated_at=now() WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid`);
    return state;
  });
  const resultFileId = String(initial.result_file_id);
  await progress("Saving normalized records");
  for (let start = 0; start < total; start += CHUNK_SIZE) {
    signal?.throwIfAborted();
    await db.transaction(async tx => {
      const current = await lockedBatch(job, tx);
      const state = current.result?.record_batch as Record<string, unknown>;
      const counts = countsFrom(state.counts, total);
      const first = start + 1, last = Math.min(total, start + CHUNK_SIZE);
      const existing = await rows<{row_number: number}>(sql`SELECT row_number FROM hirelix_private_import_rows WHERE user_id=${job.user_id}::uuid AND job_id=${job.id}::uuid AND row_number BETWEEN ${first} AND ${last}`, tx);
      const done = new Set(existing.map(item => item.row_number));
      const receipts: Receipt[] = [];
      for (let line = first; line <= last; line++) {
        if (done.has(line)) continue;
        signal?.throwIfAborted();
        const raw = lines[line - 1];
        let receipt: Receipt;
        await tx.execute(sql`SAVEPOINT record_batch_item`);
        try {
          let parsed: unknown;
          try { parsed = JSON.parse(raw); }
          catch { throw new WorkspaceError("This line is not valid JSON."); }
          const row = recordBatchRow.parse(parsed);
          if (!row.input || typeof row.input !== "object" || Array.isArray(row.input)) throw new WorkspaceError("The row input must be a JSON object.");
          if (Object.keys(row.input).some(key => ["authorization_quote", "source_authorization_quote"].includes(key))) throw new WorkspaceError("A row cannot grant authorization.", 403);
          const schema = recordWriteSchemas[input.write_operation];
          const write = schema.parse(row.input);
          const apply = await prepareInternalRecordWrite({userId: job.user_id, conversationId, question, batch: {source: row.source, normalizedFileId: file.id, line}}, input.write_operation, write);
          const result = await apply(tx);
          const output = result.output as {status?: string; created?: boolean};
          const status = output?.created === false ? "conflict" : output?.status === "unchanged" ? "unchanged" : "applied";
          receipt = {type: "item", line, status, result: outputSummary(result.output)};
          await tx.execute(sql`RELEASE SAVEPOINT record_batch_item`);
        } catch (error) {
          await tx.execute(sql`ROLLBACK TO SAVEPOINT record_batch_item`);
          await tx.execute(sql`RELEASE SAVEPOINT record_batch_item`);
          if (error instanceof WorkspaceError) receipt = {type: "item", line, status: error.status === 409 ? "conflict" : "failed", error: {code: error.status, message: error.message.slice(0, 500)}};
          else if (error instanceof z.ZodError) receipt = {type: "item", line, status: "failed", error: invalidInput(error)};
          else throw error;
        }
        await tx.execute(sql`INSERT INTO hirelix_private_import_rows(user_id,job_id,row_number,file_id,raw_text,status,action,batch_receipt,error) VALUES(${job.user_id}::uuid,${job.id}::uuid,${line},${file.id}::uuid,${raw},${receipt.status === "failed" ? "error" : receipt.status === "conflict" ? "skipped" : "saved"},${receipt.status === "conflict" ? "skip" : "review"},${json(receipt)},${receipt.error?.message ?? null})`);
        counts[receipt.status]++;
        counts.unprocessed--;
        receipts.push(receipt);
      }
      if (receipts.length) {
        const report = await appendReport(job.user_id, resultFileId, `${receipts.map(receipt => JSON.stringify(receipt)).join("\n")}\n${JSON.stringify({type: "summary", total, counts})}\n`, tx);
        await tx.execute(sql`UPDATE hirelix_private_jobs SET result=jsonb_set(coalesce(result,'{}'::jsonb),'{record_batch}',${json({...state, counts, result_file_sha256: report.sha256})}),updated_at=now() WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid`);
      }
      signal?.throwIfAborted();
      await lockedBatch(job, tx);
    });
    await progress("Saving normalized records");
  }
  const current = await activeAgentJob(job);
  const state = current.result?.record_batch as Record<string, unknown>;
  const counts = countsFrom(state.counts, total);
  if (counts.unprocessed !== 0) throw new WorkspaceError("Some batch lines have not been processed.", 500);
  return {result: {record_batch: state, total, counts, result_file_id: resultFileId, result_file_sha256: state.result_file_sha256}};
};
