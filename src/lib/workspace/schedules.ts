import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { owned, rows, json, uuidArray, WorkspaceError, type Runner } from "./database";
import { prepareDeliverable } from "./deliverables";
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
type Agreement = z.infer<typeof scheduleInput>;

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

export async function saveSchedule(userId: string, roleId: string, value: unknown, runner: Runner = db) {
  const input = scheduleInput.parse(value);
  const save = async (tx: Runner) => {
    await owned<Role>(userId, "role", roleId, tx, true);
    for (const id of input.person_ids) {
      const linked = await rows(sql`SELECT person_id FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND role_id=${roleId}::uuid AND person_id=${id}::uuid`, tx);
      if (!linked.length) throw new WorkspaceError("Choose candidates linked to this role");
    }
    const [current] = await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE user_id=${userId}::uuid AND role_id=${roleId}::uuid FOR UPDATE`, tx);
    const sameTiming = current && current.timezone === input.timezone && current.weekday === input.weekday && current.local_time === input.local_time && current.interval_weeks === input.interval_weeks;
    const next = sameTiming && (!input.enabled || (current.enabled && !current.error))
      ? new Date(current.next_run_at).toISOString()
      : await nextScheduleRun(input, new Date().toISOString(), sameTiming ? current.next_run_at : null, tx);
    const [saved] = await rows<Schedule>(sql`INSERT INTO hirelix_private_schedules(user_id,role_id,enabled,timezone,weekday,local_time,interval_weeks,next_run_at,only_when_changed,language,person_ids,include_role_records,include_candidate_records)
      VALUES(${userId}::uuid,${roleId}::uuid,${input.enabled},${input.timezone},${input.weekday},${input.local_time},${input.interval_weeks},${next}::timestamptz,${input.only_when_changed},${input.language},${uuidArray(input.person_ids)},${input.include_role_records},${input.include_candidate_records})
      ON CONFLICT(user_id,role_id) DO UPDATE SET enabled=excluded.enabled,timezone=excluded.timezone,weekday=excluded.weekday,local_time=excluded.local_time,interval_weeks=excluded.interval_weeks,next_run_at=excluded.next_run_at,only_when_changed=excluded.only_when_changed,language=excluded.language,person_ids=excluded.person_ids,include_role_records=excluded.include_role_records,include_candidate_records=excluded.include_candidate_records,error=NULL,updated_at=now()
      RETURNING *`, tx);
    return saved;
  };
  return runner === db ? db.transaction(save) : save(runner);
}

// One transaction includes locking the agreement, capturing evidence, reserving
// its normal AI allowance, enqueueing and advancing the recurrence.
export async function queueScheduledDrafts(limit = 5, now = new Date().toISOString()) {
  let queued = 0;
  for (let index = 0; index < limit; index++) {
    let claimed: Schedule | null = null;
    try {
      const found = await db.transaction(async (tx) => {
        const [schedule] = await rows<Schedule>(sql`SELECT s.* FROM hirelix_private_schedules s JOIN hirelix_private_roles r ON r.user_id=s.user_id AND r.id=s.role_id
          WHERE s.enabled AND s.error IS NULL AND s.next_run_at<=${now}::timestamptz AND r.status='active' AND NOT EXISTS (SELECT 1 FROM hirelix_private_jobs j WHERE j.id=s.last_job_id AND j.status IN ('queued','running','error'))
          ORDER BY s.next_run_at FOR UPDATE OF s SKIP LOCKED LIMIT 1`, tx);
        if (!schedule) return false;
        claimed = schedule;
        const due = new Date(schedule.next_run_at).toISOString();
        const [period] = await rows<{ start: string }>(sql`SELECT coalesce(${schedule.last_period_end}::timestamptz, ((${due}::timestamptz AT TIME ZONE ${schedule.timezone})-${schedule.interval_weeks * 7}*interval '1 day') AT TIME ZONE ${schedule.timezone}) AS start`, tx);
        const start = new Date(period.start).toISOString();
        const records = await rows<{ id: string; version: number }>(sql`SELECT id,version FROM hirelix_private_records
          WHERE user_id=${schedule.user_id}::uuid AND occurred_at>${start}::timestamptz AND occurred_at<=${now}::timestamptz
          AND ((${schedule.include_role_records} AND role_id=${schedule.role_id}::uuid AND person_id IS NULL)
          OR (${schedule.include_candidate_records} AND person_id=ANY(${uuidArray(schedule.person_ids)}) AND (role_id IS NULL OR role_id=${schedule.role_id}::uuid)))
          ORDER BY occurred_at,id LIMIT 101`, tx);
        if (records.length > 100) throw new WorkspaceError("This period has more than 100 selected records. Prepare a reviewed update manually, then adjust the agreement.");
        const dateInZone = (instant: string) => new Intl.DateTimeFormat("en-CA", { timeZone: schedule.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));
        const job = await prepareDeliverable(schedule.user_id, {
          kind: "search_update", role_id: schedule.role_id, person_ids: schedule.person_ids,
          record_ids: records.map((record) => record.id), file_ids: [],
          period_start: start, period_end: now, period_local_start: dateInZone(start), period_local_end: dateInZone(now),
          report_timezone: schedule.timezone,
          language: schedule.language, instructions: "Prepare the agreed search update for review. Only describe dated selected records as recorded activity; unrecorded activity is unknown. Nothing has been sent by this task.",
          request_key: `scheduled:${schedule.id}:${due}`,
        }, tx);
        const digest = createHash("sha256").update(JSON.stringify({ ...(job.payload.source as object), period_start: undefined, period_end: undefined, period_local_start: undefined, period_local_end: undefined, captured_at: undefined })).digest("hex");
        const [origin] = await rows<{ conversation_id: string }>(sql`SELECT m.conversation_id FROM hirelix_agent_messages m
          WHERE m.user_id=${schedule.user_id}::uuid AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(m.metadata->'schedules','[]'::jsonb)) receipt WHERE receipt->>'id'=${schedule.id})
          ORDER BY m.created_at DESC,m.id DESC LIMIT 1`, tx);
        if (origin) await tx.execute(sql`UPDATE hirelix_private_jobs SET payload=payload || ${json({ conversation_id: origin.conversation_id })} WHERE id=${job.id}::uuid`);
        await tx.execute(sql`UPDATE hirelix_private_jobs SET payload=payload || jsonb_build_object('schedule_id',${schedule.id}::text,'notify_ready',${!schedule.only_when_changed || digest !== schedule.last_record_digest}::boolean,'record_digest',${digest}::text) WHERE id=${job.id}::uuid`);
        const next = await nextScheduleRun(schedule, now, due, tx);
        await tx.execute(sql`UPDATE hirelix_private_schedules SET next_run_at=${next}::timestamptz,last_period_end=${now}::timestamptz,last_job_id=${job.id}::uuid,updated_at=now() WHERE id=${schedule.id}::uuid`);
        return true;
      });
      if (!found) break;
      queued++;
    } catch (error) {
      // Persist safe actionable errors, never source text or provider payloads.
      const failed = claimed as Schedule | null;
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
