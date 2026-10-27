import { z } from "zod";
import { sql } from "drizzle-orm";
import { expectVersion, owned, rows, WorkspaceError, type Runner } from "./database";
import type { Job, SourceRecord } from "./types";

const reportSchema = z.object({
  role_id:z.uuid(), person_ids:z.array(z.uuid()),
  records:z.array(z.object({id:z.uuid(),version:z.number().int().positive()})),
  files:z.array(z.object({file_id:z.uuid(),sha256:z.string().regex(/^[0-9a-f]{64}$/)})),
  period_start:z.iso.datetime({offset:true}), period_end:z.iso.datetime({offset:true}),
  period_local_start:z.iso.date().nullable(), period_local_end:z.iso.date().nullable(),
  report_timezone:z.string(), language:z.enum(["en","zh"]),
  source:z.object({role:z.object({id:z.uuid(),version:z.number().int().positive()}).passthrough()}).passthrough(),
  authorization_message_id:z.uuid(), source_authorization_message_id:z.uuid().nullable(), authorization_quote:z.string(), source_authorization_quote:z.string().nullable(), due:z.iso.datetime({offset:true}),
});

type ScheduledReport = z.infer<typeof reportSchema>;

/** The stored agreement selects the evidence. This is data, not a user message. */
export function scheduledExecutionContext(job: Job): ScheduledReport | null {
  if (typeof job.payload.schedule_id !== "string") return null;
  return reportSchema.parse(job.payload.scheduled_report);
}

/** Allow only evidence inside this particular agreement and its report period. */
export async function assertScheduledToolAllowed(job: Job, name: string, value: unknown) {
  const report = scheduledExecutionContext(job);
  if (!report) return;
  const input = value as Record<string, unknown>;
  if (name === "read_skill" || name === "ask_user") return;
  if (name === "read_record") {
    const selected = report.records.find(record => record.id === input.id);
    if (!selected) throw new WorkspaceError("This record is outside the scheduled agreement.", 403);
    const record = await owned<SourceRecord>(job.user_id, "record", selected.id);
    expectVersion(record.version, selected.version);
    return;
  }
  if (name === "read_file") {
    const selected = report.files.find(file => file.file_id === input.file_id);
    if (!selected || input.path || input.archive_path) throw new WorkspaceError("This file is outside the scheduled agreement.", 403);
    const [file] = await rows<{sha256:string}>(sql`SELECT sha256 FROM hirelix_private_files WHERE user_id=${job.user_id}::uuid AND id=${selected.file_id}::uuid AND upload_id IS NULL`);
    if (!file || file.sha256 !== selected.sha256) throw new WorkspaceError("This source file has changed since the scheduled report was queued.",409);
    return;
  }
  if (name === "save_document") {
    // Load lazily: jobs imports this module, while document-writes eventually imports jobs.
    const {saveDocumentInput} = await import("./document-writes");
    const selected = saveDocumentInput.safeParse(value);
    if (!selected.success || selected.data.operation !== "create" || selected.data.kind !== "search_update")
      throw new WorkspaceError("This document exceeds the scheduled report's authorized scope or selected source versions.",403);
    const parsed = selected.data;
    if (parsed.role_id !== report.role_id ||
        parsed.person_ids.some(id=>!report.person_ids.includes(id)) || parsed.sources.file_ids.length ||
        parsed.sources.role_version !== report.source.role.version || parsed.language !== report.language ||
        parsed.report_timezone !== report.report_timezone ||
        !parsed.period_start || !parsed.period_end ||
        new Date(parsed.period_start).getTime() !== new Date(report.period_start).getTime() ||
        new Date(parsed.period_end).getTime() !== new Date(report.period_end).getTime() ||
        (parsed.period_local_start !== null && parsed.period_local_start !== report.period_local_start) ||
        (parsed.period_local_end !== null && parsed.period_local_end !== report.period_local_end) ||
        parsed.sources.records.some(record=>!report.records.some(selected=>selected.id===record.id && selected.version===record.version)) ||
        (parsed.content_file != null && !report.files.some(file=>file.file_id===parsed.content_file!.file_id && file.sha256===parsed.content_file!.sha256)) ||
        input.authorization_quote !== report.authorization_quote ||
        (parsed.sources.records.length > 0 && input.source_authorization_quote !== report.source_authorization_quote))
      throw new WorkspaceError("This document exceeds the scheduled report's authorized scope or selected source versions.",403);
    return;
  }
  throw new WorkspaceError("This tool is outside the scheduled report's authorization.",403);
}

/** Lock order: conversation, schedule, job. Call before locking the chat job. */
export async function lockScheduledChat(job: Job, tx: Runner) {
  if (typeof job.payload.schedule_id !== "string") return;
  const [schedule] = await rows<{id:string}>(sql`SELECT id FROM hirelix_private_schedules WHERE user_id=${job.user_id}::uuid
    AND id=${job.payload.schedule_id}::uuid AND enabled AND version=${Number(job.payload.schedule_version)}
    AND last_job_id=${job.id}::uuid FOR UPDATE`,tx);
  if (!schedule) throw new WorkspaceError("The report agreement changed or was paused.",409);
}

/** Called in the completion transaction, after lockScheduledChat and lease checks. */
export async function finishScheduledChat(job: Job, tx: Runner, waitingForInput: boolean) {
  if (typeof job.payload.schedule_id !== "string") return;
  if (!waitingForInput) {
    const current = await owned<Job>(job.user_id, "job", job.id, tx);
    const receipts = current.result?.tool_receipts;
    const report = scheduledExecutionContext(job)!;
    const saved = receipts && typeof receipts === "object" && !Array.isArray(receipts) &&
      Object.values(receipts).some((value: unknown) => {
        if (!value || typeof value !== "object") return false;
        const receipt = value as {name?:unknown;output?:{operation?:unknown;status?:unknown;document?:{kind?:unknown;role_id?:unknown}}};
        return receipt.name === "save_document" && receipt.output?.status === "saved" && receipt.output.operation === "create" &&
          receipt.output.document?.kind === "search_update" && receipt.output.document.role_id === report.role_id;
      });
    if (!saved) throw new WorkspaceError("The scheduled report was not saved. Retry it in the conversation.", 409);
    const updated = await rows(sql`UPDATE hirelix_private_schedules SET last_record_digest=${String(job.payload.record_digest)},updated_at=now()
      WHERE user_id=${job.user_id}::uuid AND id=${job.payload.schedule_id}::uuid AND enabled
      AND version=${Number(job.payload.schedule_version)} AND last_job_id=${job.id}::uuid RETURNING id`,tx);
    if (!updated.length) throw new WorkspaceError("The report agreement changed or was paused.",409);
  }
  const href = `/app?conversation=${String(job.payload.conversation_id)}`;
  await tx.execute(sql`INSERT INTO hirelix_private_notifications(user_id,title,href,kind,request_key)
    VALUES(${job.user_id}::uuid,${waitingForInput ? "Your answer is needed" : "Search update ready"},${href},'conversation_result',${`scheduled-ready:${job.id}`}) ON CONFLICT DO NOTHING`);
}
