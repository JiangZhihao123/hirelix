import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { owned, rows, WorkspaceError, type Runner } from "./database";
import { scheduleInput } from "./schedules";
export const reminderActionSchema = z.object({
  id: z.uuid().nullable(),
  title: z.string().trim().min(1).max(500),
  due_at: z.iso.datetime({offset: true}),
  timezone: scheduleInput.shape.timezone,
  enabled: z.boolean(),
  authorization_quote: z.string().min(2).max(1000),
});
export type Reminder = { id: string; title: string; next_run_at: string; timezone: string; enabled: boolean; completed_at: string | null; version: number; conversation_id: string };
export async function listReminders(userId: string, runner: Runner = db, id: string | null = null) {
  return rows<Reminder>(sql`SELECT id,title,next_run_at,timezone,enabled,completed_at,version,conversation_id FROM hirelix_private_schedules WHERE user_id=${userId}::uuid AND kind='reminder' AND (${id}::uuid IS NULL OR id=${id}::uuid) ORDER BY next_run_at DESC LIMIT 100`,runner);
}
export type ManagedReminder = Reminder & { kind: "reminder" | "search_update"; role_id: string | null; role_status: string | null; interval_weeks: number; weekday: number; local_time: string; error: string | null; last_status: string | null; result_href: string | null };
export async function reminderOverview(userId: string, kind: "reminder" | "search_update", page: number) {
  const [count] = await rows<{total: number}>(sql`SELECT count(*)::int AS total FROM hirelix_private_schedules WHERE user_id=${userId}::uuid AND kind=${kind}`);
  const items = await rows<ManagedReminder>(sql`
    SELECT s.id,s.kind,coalesce(s.title,r.title) AS title,s.next_run_at,s.timezone,s.enabled,s.completed_at,s.version,
      coalesce(s.conversation_id,origin.conversation_id) AS conversation_id,s.role_id,r.status AS role_status,
      s.interval_weeks,s.weekday,s.local_time,coalesce(s.error,j.error) AS error,j.status AS last_status,j.result->>'href' AS result_href
    FROM hirelix_private_schedules s
    LEFT JOIN hirelix_private_roles r ON r.id=s.role_id AND r.user_id=s.user_id
    LEFT JOIN hirelix_private_jobs j ON j.id=s.last_job_id AND j.user_id=s.user_id
    LEFT JOIN LATERAL (
      SELECT m.conversation_id FROM hirelix_agent_messages m WHERE m.user_id=s.user_id
        AND m.metadata->'schedules' @> jsonb_build_array(jsonb_build_object('id',s.id::text))
      ORDER BY m.created_at DESC LIMIT 1
    ) origin ON s.kind='search_update'
    WHERE s.user_id=${userId}::uuid AND s.kind=${kind}
    ORDER BY (s.completed_at IS NULL AND s.enabled) DESC,s.next_run_at DESC,s.id LIMIT 30 OFFSET ${(page - 1) * 30}
  `);
  return { items, total: count.total, page, page_size: 30 };
}
export const reminderEditSchema = z.object({
  id: z.uuid(), expected_version: z.number().int().positive(), enabled: z.boolean(),
  due_at: z.iso.datetime({offset: true}).optional(), timezone: scheduleInput.shape.timezone.optional(),
});
export async function editReminder(userId: string, value: unknown) {
  const input = reminderEditSchema.parse(value);
  if (input.due_at && new Date(input.due_at).getTime() <= Date.now()) throw new WorkspaceError("Choose a future reminder time.");
  const result = await rows(sql`UPDATE hirelix_private_schedules SET enabled=${input.enabled},version=version+1,updated_at=now(),
    next_run_at=coalesce(${input.due_at || null}::timestamptz,next_run_at),timezone=coalesce(${input.timezone || null},timezone),
    completed_at=CASE WHEN ${!!input.due_at} THEN NULL ELSE completed_at END
    WHERE user_id=${userId}::uuid AND id=${input.id}::uuid AND kind='reminder' AND version=${input.expected_version}
      AND (${!!input.due_at} OR (completed_at IS NULL AND (${!input.enabled} OR next_run_at>now()))) RETURNING id`);
  if (!result.length) throw new WorkspaceError("This reminder changed or is already due. Ask to reschedule it.",409);
  return {ok: true};
}
export async function saveReminder(userId: string, conversationId: string, input: z.infer<typeof reminderActionSchema>, runner: Runner, expectedVersion?: number, language: "en" | "zh" = "en") {
  await owned(userId,"conversation",conversationId,runner);
  if (input.enabled && new Date(input.due_at).getTime()<=Date.now()) throw new WorkspaceError("Choose a future reminder time.");
  if (input.id) {
    const [updated]=await rows<Reminder>(sql`UPDATE hirelix_private_schedules SET title=${input.title},next_run_at=${input.due_at}::timestamptz,timezone=${input.timezone},enabled=${input.enabled},completed_at=NULL,version=version+1,updated_at=now() WHERE user_id=${userId}::uuid AND id=${input.id}::uuid AND kind='reminder' AND version=${expectedVersion ?? -1} RETURNING *`,runner);
    if(!updated) throw new WorkspaceError("This reminder changed or is unavailable. Reload before editing.",409);
    return updated;
  }
  const [saved]=await rows<Reminder>(sql`INSERT INTO hirelix_private_schedules(user_id,kind,title,conversation_id,enabled,timezone,next_run_at,language) VALUES(${userId}::uuid,'reminder',${input.title},${conversationId}::uuid,${input.enabled},${input.timezone},${input.due_at}::timestamptz,${language}) RETURNING *`,runner);
  return saved;
}
export async function deliverReminders(now=new Date().toISOString()) {
  return db.transaction(async tx=>{
    const due=await rows<Reminder & {user_id:string;language: string}>(sql`SELECT * FROM hirelix_private_schedules WHERE kind='reminder' AND enabled AND completed_at IS NULL AND next_run_at<=${now}::timestamptz ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 20`,tx);
    for(const item of due){
      const original=new Intl.DateTimeFormat(item.language === 'zh' ? 'zh-CN' : 'en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:item.timezone}).format(new Date(item.next_run_at));
      const content=item.language === 'zh' ? `提醒：${item.title}\n\n约定时间：${original}（${item.timezone}）。这次提醒已送达，不会重复触发。` : `Reminder: ${item.title}\n\nScheduled for ${original} (${item.timezone}). This one-time reminder has been delivered.`;
      await tx.execute(sql`INSERT INTO hirelix_agent_messages(user_id,role,conversation_id,content,metadata) VALUES(${item.user_id}::uuid,'assistant',${item.conversation_id}::uuid,${content},jsonb_build_object('reminder_id',${item.id}::text))`);
      await tx.execute(sql`UPDATE hirelix_private_conversations SET updated_at=now() WHERE id=${item.conversation_id}::uuid AND user_id=${item.user_id}::uuid`);
      await tx.execute(sql`INSERT INTO hirelix_private_notifications(user_id,title,href,kind,request_key) VALUES(${item.user_id}::uuid,${item.title},${`/app?conversation=${item.conversation_id}`},'reminder',${`reminder:${item.id}:${item.version}`}) ON CONFLICT DO NOTHING`);
      await tx.execute(sql`UPDATE hirelix_private_schedules SET enabled=false,completed_at=${now}::timestamptz,updated_at=now() WHERE id=${item.id}::uuid AND user_id=${item.user_id}::uuid`);
    }
    return due.length;
  });
}
