import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { localDate } from "./record-dates";
import { z } from "zod";
import { db } from "@/db/client";
import { enqueue, owned, rows, uuidArray, WorkspaceError, type Runner } from "./database";
import { captureDocumentSources, preparationInput, validateDocumentSources } from "./deliverables";
import { quotedAuthorization } from "./assistant-work";
import { isDeepStrictEqual } from "node:util";
import type { Role, Schedule } from "./types";

export const scheduleInput = z.object({
  enabled: z.boolean(),
  timezone: z.string().min(1).max(100).refine((zone) => {
    try { new Intl.DateTimeFormat("en", { timeZone: zone }); return true; } catch { return false; }
  }, "Choose a valid IANA timezone"),
  weekday: z.number().int().min(0).max(6),
  local_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  interval_weeks: z.union([z.literal(1), z.literal(2)]),
  language: z.enum(["en", "zh"]),
  person_ids: z.array(z.uuid()).max(50).refine((ids) => new Set(ids).size === ids.length),
  include_role_records: z.boolean(),
  include_candidate_records: z.boolean(),
  only_when_changed: z.boolean(),
});
export const scheduleSaveInput = scheduleInput.extend({
  expected_version: z.number().int().positive().nullable().describe("Null for a new agreement; for changes, use the report_schedule.version observed in read_role or the current saved agreement."),
});
type Agreement = z.infer<typeof scheduleInput>;
export type ScheduleOrigin = {
  conversation_id: string;
  message_id: string;
  authorization_quote: string;
  source_authorization_quote: string | null;
};
type StoredSchedule = Schedule & {
  conversation_id: string | null;
  authorization_message_id: string | null;
  source_authorization_message_id: string | null;
  authorization_quote: string | null;
  source_authorization_quote: string | null;
};

type ResolvedOrigin = ScheduleOrigin & { source_message_id: string | null };
async function resolveOrigin(userId: string, origin: ScheduleOrigin, sourceRequired: boolean, tx: Runner): Promise<ResolvedOrigin> {
  const [current] = await rows<{created_at:string}>(sql`SELECT created_at FROM hirelix_agent_messages
    WHERE user_id=${userId}::uuid AND id=${origin.message_id}::uuid AND conversation_id=${origin.conversation_id}::uuid
      AND role='user' AND metadata->>'delivery' IS DISTINCT FROM 'queued' AND metadata->>'delivery' IS DISTINCT FROM 'removed'`, tx);
  if (!current) throw new WorkspaceError("The report agreement needs the original submitted user authorization.",403);
  const messages = await rows<{id:string;content:string}>(sql`SELECT id,content FROM hirelix_agent_messages
    WHERE user_id=${userId}::uuid AND conversation_id=${origin.conversation_id}::uuid AND role='user'
      AND (id=${origin.message_id}::uuid OR created_at<${current.created_at}::timestamptz)
      AND metadata->>'delivery' IS DISTINCT FROM 'queued' AND metadata->>'delivery' IS DISTINCT FROM 'removed' ORDER BY created_at DESC,id DESC`,tx);
  const authorization = messages.find(message=>quotedAuthorization(message.content,origin.authorization_quote));
  const source = origin.source_authorization_quote ? messages.find(message=>quotedAuthorization(message.content,origin.source_authorization_quote)) : null;
  if (!authorization || (sourceRequired && !source) || (origin.source_authorization_quote && !source))
    throw new WorkspaceError("The report agreement needs the original submitted user authorization and selected-source authorization.", 403);
  return {...origin,message_id:authorization.id,source_message_id:source?.id ?? null};
}
async function verifyOrigin(userId: string, origin: ResolvedOrigin, sourceRequired: boolean, tx: Runner) {
  const messages = await rows<{id:string;content:string}>(sql`SELECT id,content FROM hirelix_agent_messages
    WHERE user_id=${userId}::uuid AND conversation_id=${origin.conversation_id}::uuid AND role='user'
      AND (id=${origin.message_id}::uuid OR id=${origin.source_message_id}::uuid)
      AND metadata->>'delivery' IS DISTINCT FROM 'queued' AND metadata->>'delivery' IS DISTINCT FROM 'removed'`,tx);
  const authorization=messages.find(message=>message.id===origin.message_id);
  const source=messages.find(message=>message.id===origin.source_message_id);
  if (!authorization || !quotedAuthorization(authorization.content,origin.authorization_quote) ||
      (sourceRequired && !origin.source_authorization_quote) ||
      (origin.source_authorization_quote && (!source || !quotedAuthorization(source.content,origin.source_authorization_quote))))
    throw new WorkspaceError("The report agreement needs the original submitted user authorization and selected-source authorization.",403);
}

// PostgreSQL owns timezone conversion. Its standard-time choice resolves DST
// folds and gaps consistently; show the actual next instant before relying on it.
export async function nextScheduleRun(
  config: Pick<Agreement, "timezone" | "weekday" | "local_time" | "interval_weeks">,
  after: string, anchor: string | null = null, runner: Runner = db,
) {
  const [item] = await rows<{ instant: string }>(sql`
    WITH days AS (
      SELECT ((${after}::timestamptz AT TIME ZONE ${config.timezone})::date+n) AS day
      FROM generate_series(0,28) n
    ), candidates AS (
      SELECT day, (day+${config.local_time}::time) AT TIME ZONE ${config.timezone} AS instant FROM days
      WHERE extract(dow FROM day)::int=${config.weekday}
      AND (${anchor}::timestamptz IS NULL OR mod(day-(${anchor}::timestamptz AT TIME ZONE ${config.timezone})::date,${7 * config.interval_weeks})=0)
    ) SELECT instant FROM candidates WHERE instant>${after}::timestamptz ORDER BY instant LIMIT 1`, runner);
  if (!item) throw new WorkspaceError("Could not calculate the next draft time");
  return new Date(item.instant).toISOString();
}

export async function saveSchedule(userId: string, roleId: string, value: unknown, runner: Runner = db, origin?: ScheduleOrigin) {
  const input = scheduleSaveInput.parse(value);
  const save = async (tx: Runner) => {
    // Align with chat completion and stop: conversation before schedule/job.
    const [before] = await rows<StoredSchedule>(sql`SELECT * FROM hirelix_private_schedules WHERE user_id=${userId}::uuid AND role_id=${roleId}::uuid`, tx);
    const conversationIds = before?.conversation_id ? [before.conversation_id] : [];
    for (const id of conversationIds) await owned(userId, "conversation", id, tx, true);
    await owned<Role>(userId, "role", roleId, tx, true);
    for (const id of input.person_ids) {
      const linked = await rows(sql`SELECT person_id FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND role_id=${roleId}::uuid AND person_id=${id}::uuid`, tx);
      if (!linked.length) throw new WorkspaceError("Choose candidates linked to this role");
    }
    const [current] = await rows<StoredSchedule>(sql`SELECT * FROM hirelix_private_schedules WHERE user_id=${userId}::uuid AND role_id=${roleId}::uuid FOR UPDATE`, tx);
    if (current?.conversation_id && !conversationIds.includes(current.conversation_id))
      throw new WorkspaceError("This agreement changed. Reload it before saving.", 409);
    if (current ? current.version !== input.expected_version : input.expected_version !== null) {
      throw new WorkspaceError("This agreement changed. Read the current agreement before editing; your newer timing and source choices were preserved.", 409);
    }
    const sameScope = current && current.timezone === input.timezone && current.weekday === input.weekday &&
      current.local_time.slice(0, 5) === input.local_time && current.interval_weeks === input.interval_weeks &&
      current.language === input.language && isDeepStrictEqual(current.person_ids, input.person_ids) &&
      current.include_role_records === input.include_role_records && current.include_candidate_records === input.include_candidate_records &&
      current.only_when_changed === input.only_when_changed;
    if (!origin && !sameScope) throw new WorkspaceError("Create or change this agreement in the conversation so its authorization is retained.", 403);
    const effectiveOrigin = origin ? await resolveOrigin(userId, origin, input.include_role_records || input.include_candidate_records, tx)
      : (current?.conversation_id && current.authorization_message_id && current.authorization_quote
        ? {conversation_id:current.conversation_id, message_id:current.authorization_message_id, source_message_id:current.source_authorization_message_id,
          authorization_quote:current.authorization_quote, source_authorization_quote:current.source_authorization_quote}
        : undefined);
    if (input.enabled && !effectiveOrigin) throw new WorkspaceError("This agreement needs its original conversation authorization before it can run.", 409);
    if (effectiveOrigin) await verifyOrigin(userId, effectiveOrigin, input.include_role_records || input.include_candidate_records, tx);
    const sameTiming = current && current.timezone === input.timezone && current.weekday === input.weekday && current.local_time.slice(0, 5) === input.local_time && current.interval_weeks === input.interval_weeks;
    const next = sameTiming && (!input.enabled || (current.enabled && !current.error))
      ? new Date(current.next_run_at).toISOString()
      : await nextScheduleRun(input, new Date().toISOString(), sameTiming ? current.next_run_at : null, tx);
    const [saved] = await rows<StoredSchedule>(sql`INSERT INTO hirelix_private_schedules(user_id,role_id,enabled,timezone,weekday,local_time,interval_weeks,next_run_at,only_when_changed,language,person_ids,include_role_records,include_candidate_records,conversation_id,authorization_message_id,source_authorization_message_id,authorization_quote,source_authorization_quote)
      VALUES(${userId}::uuid,${roleId}::uuid,${input.enabled},${input.timezone},${input.weekday},${input.local_time},${input.interval_weeks},${next}::timestamptz,${input.only_when_changed},${input.language},${uuidArray(input.person_ids)},${input.include_role_records},${input.include_candidate_records},${effectiveOrigin?.conversation_id ?? null}::uuid,${effectiveOrigin?.message_id ?? null}::uuid,${effectiveOrigin?.source_message_id ?? null}::uuid,${effectiveOrigin?.authorization_quote ?? null},${effectiveOrigin?.source_authorization_quote ?? null})
      ON CONFLICT(user_id,role_id) DO UPDATE SET enabled=excluded.enabled,timezone=excluded.timezone,weekday=excluded.weekday,local_time=excluded.local_time,interval_weeks=excluded.interval_weeks,next_run_at=excluded.next_run_at,only_when_changed=excluded.only_when_changed,language=excluded.language,person_ids=excluded.person_ids,include_role_records=excluded.include_role_records,include_candidate_records=excluded.include_candidate_records,conversation_id=excluded.conversation_id,authorization_message_id=excluded.authorization_message_id,source_authorization_message_id=excluded.source_authorization_message_id,authorization_quote=excluded.authorization_quote,source_authorization_quote=excluded.source_authorization_quote,error=NULL,version=hirelix_private_schedules.version+1,updated_at=now()
      RETURNING *`, tx);
    await tx.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled',progress='Agreement changed',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE user_id=${userId}::uuid AND payload->>'schedule_id'=${saved.id} AND status IN ('queued','running')`);
    return saved;
  };
  return runner === db ? db.transaction(save) : save(runner);
}

// One transaction includes locking the agreement, capturing evidence, reserving
// its normal AI allowance, enqueueing and advancing the recurrence.
export async function queueScheduledDrafts(limit = 5, now = new Date().toISOString()) {
  let queued = 0;
  for (let index = 0; index < limit; index++) {
    let claimed: StoredSchedule | null = null;
    try {
      const found = await db.transaction(async (tx) => {
        const [schedule] = await rows<StoredSchedule>(sql`SELECT s.* FROM hirelix_private_schedules s JOIN hirelix_private_roles r ON r.user_id=s.user_id AND r.id=s.role_id
          WHERE s.enabled AND s.error IS NULL AND s.next_run_at<=${now}::timestamptz AND r.status='active' AND NOT EXISTS (
            SELECT 1 FROM hirelix_private_jobs j WHERE j.id=s.last_job_id AND j.payload->>'schedule_version'=s.version::text
              AND (j.status IN ('queued','running','error') OR j.result->>'waiting_for_input'='true'))
          ORDER BY s.next_run_at FOR UPDATE OF s SKIP LOCKED LIMIT 1`, tx);
        if (!schedule) return false;
        claimed = schedule;
        if (!schedule.conversation_id || !schedule.authorization_message_id || !schedule.authorization_quote)
          throw new WorkspaceError("This report agreement needs its original conversation authorization. Recreate it in the conversation.",409);
        const origin: ResolvedOrigin = {conversation_id:schedule.conversation_id, message_id:schedule.authorization_message_id,
          source_message_id:schedule.source_authorization_message_id, authorization_quote:schedule.authorization_quote, source_authorization_quote:schedule.source_authorization_quote};
        await verifyOrigin(schedule.user_id, origin, schedule.include_role_records || schedule.include_candidate_records, tx);
        const due = new Date(schedule.next_run_at).toISOString();
        const [period] = await rows<{ start: string }>(sql`SELECT coalesce(${schedule.last_period_end}::timestamptz, ((${due}::timestamptz AT TIME ZONE ${schedule.timezone})-${schedule.interval_weeks * 7}*interval '1 day') AT TIME ZONE ${schedule.timezone}) AS start`, tx);
        const start = new Date(period.start).toISOString();
        const records = await rows<{ id: string; version: number; file_id: string | null; file_sha256: string | null }>(sql`SELECT r.id,r.version,r.file_id,
          (SELECT f.sha256 FROM hirelix_private_files f WHERE f.user_id=r.user_id AND f.id=r.file_id AND f.upload_id IS NULL) AS file_sha256 FROM hirelix_private_records r
          WHERE user_id=${schedule.user_id}::uuid AND (
            (occurred_at>${start}::timestamptz AND occurred_at<=${now}::timestamptz)
            OR (occurred_at IS NULL AND details->>'occurred_on'>=${localDate(start, schedule.timezone)} AND details->>'occurred_on'<=${localDate(now, schedule.timezone)})
          )
          AND ((${schedule.include_role_records} AND role_id=${schedule.role_id}::uuid AND person_id IS NULL)
          OR (${schedule.include_candidate_records} AND person_id=ANY(${uuidArray(schedule.person_ids)}) AND (role_id IS NULL OR role_id=${schedule.role_id}::uuid)))
          ORDER BY occurred_at,id LIMIT 101`, tx);
        if (records.length > 100) throw new WorkspaceError("This period has more than 100 selected records. Prepare a reviewed update manually, then adjust the agreement.");
        const sourceInput = preparationInput.parse({
          kind: "search_update", role_id: schedule.role_id, person_ids: schedule.person_ids,
          record_ids: records.map((record) => record.id), file_ids: [],
          period_start: start, period_end: now,
          report_timezone: schedule.timezone,
          language: schedule.language,
          request_key: `scheduled:${schedule.id}:${due}`,
        });
        validateDocumentSources(sourceInput);
        const source = await captureDocumentSources(schedule.user_id, sourceInput, tx);
        const digest = createHash("sha256").update(JSON.stringify({ ...source, period_start: undefined, period_end: undefined, period_local_start: undefined, period_local_end: undefined, captured_at: undefined })).digest("hex");
        const next = await nextScheduleRun(schedule, now, due, tx);
        if (schedule.only_when_changed && digest === schedule.last_record_digest) {
          await tx.execute(sql`UPDATE hirelix_private_schedules SET next_run_at=${next}::timestamptz,last_period_end=${now}::timestamptz,updated_at=now() WHERE id=${schedule.id}::uuid`);
          return "skipped" as const;
        }
        const job = await enqueue(schedule.user_id, "chat", sourceInput.request_key, {
          conversation_id:origin.conversation_id, message_id:origin.message_id,
          request:{locale:schedule.language,timezone:schedule.timezone},
          schedule_id:schedule.id, schedule_version:schedule.version, record_digest:digest,
          scheduled_report:{role_id:schedule.role_id, person_ids:schedule.person_ids, records:records.map(({id,version})=>({id,version})),
            files:records.flatMap(record=>record.file_id && record.file_sha256 ? [{file_id:record.file_id,sha256:record.file_sha256}] : []),
            period_start:start,period_end:now,period_local_start:source.period_local_start,period_local_end:source.period_local_end,
            report_timezone:schedule.timezone,language:schedule.language,source,authorization_message_id:origin.message_id,
            source_authorization_message_id:origin.source_message_id,authorization_quote:origin.authorization_quote,
            source_authorization_quote:origin.source_authorization_quote,due},
        }, tx);
        await tx.execute(sql`UPDATE hirelix_private_schedules SET next_run_at=${next}::timestamptz,last_period_end=${now}::timestamptz,last_job_id=${job.id}::uuid,updated_at=now() WHERE id=${schedule.id}::uuid`);
        return "queued" as const;
      });
      if (!found) break;
      if (found === "queued") queued++;
    } catch (error) {
      // Persist safe actionable errors, never source text or provider payloads.
      const failed = claimed as StoredSchedule | null;
      if (!failed) throw error;
      const message = error instanceof WorkspaceError ? error.message : "Could not prepare this scheduled draft. Review the agreement and retry.";
      await db.execute(sql`UPDATE hirelix_private_schedules SET error=${message},updated_at=now() WHERE id=${failed.id}::uuid AND next_run_at=${new Date(failed.next_run_at).toISOString()}::timestamptz`);
    }
  }
  return queued;
}

export async function retrySchedule(userId: string, roleId: string) {
  await owned(userId, "role", roleId);
  await db.execute(sql`UPDATE hirelix_private_schedules SET error=NULL,updated_at=now() WHERE user_id=${userId}::uuid AND role_id=${roleId}::uuid AND enabled`);
}
