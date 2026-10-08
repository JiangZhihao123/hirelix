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
export async function listReminders(userId: string, runner: Runner = db) {
  return rows<Reminder>(sql`SELECT id,title,next_run_at,timezone,enabled,completed_at,version,conversation_id FROM hirelix_private_schedules WHERE user_id=${userId}::uuid AND kind='reminder' ORDER BY next_run_at DESC LIMIT 100`,runner);
}
export async function saveReminder(userId: string, conversationId: string, input: z.infer<typeof reminderActionSchema>, runner: Runner, expectedVersion?: number) {
  await owned(userId,"conversation",conversationId,runner);
  if (input.enabled && new Date(input.due_at).getTime()<=Date.now()) throw new WorkspaceError("Choose a future reminder time.");
  if (input.id) {
    const [updated]=await rows<Reminder>(sql`UPDATE hirelix_private_schedules SET title=${input.title},next_run_at=${input.due_at}::timestamptz,timezone=${input.timezone},enabled=${input.enabled},completed_at=NULL,version=version+1,updated_at=now() WHERE user_id=${userId}::uuid AND id=${input.id}::uuid AND kind='reminder' AND version=${expectedVersion ?? -1} RETURNING *`,runner);
    if(!updated) throw new WorkspaceError("This reminder changed or is unavailable. Reload before editing.",409);
    return updated;
  }
  const [saved]=await rows<Reminder>(sql`INSERT INTO hirelix_private_schedules(user_id,kind,title,conversation_id,enabled,timezone,next_run_at) VALUES(${userId}::uuid,'reminder',${input.title},${conversationId}::uuid,${input.enabled},${input.timezone},${input.due_at}::timestamptz) RETURNING *`,runner);
  return saved;
}
export async function deliverReminders(now=new Date().toISOString()) {
  return db.transaction(async tx=>{
    const due=await rows<Reminder & {user_id:string}>(sql`SELECT * FROM hirelix_private_schedules WHERE kind='reminder' AND enabled AND completed_at IS NULL AND next_run_at<=${now}::timestamptz ORDER BY next_run_at FOR UPDATE SKIP LOCKED LIMIT 20`,tx);
    for(const item of due){
      const original=new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:item.timezone}).format(new Date(item.next_run_at));
      const content=`Reminder: ${item.title}\n\nScheduled for ${original} (${item.timezone}).`;
      await tx.execute(sql`INSERT INTO hirelix_agent_messages(user_id,role,conversation_id,content,metadata) VALUES(${item.user_id}::uuid,'assistant',${item.conversation_id}::uuid,${content},jsonb_build_object('reminder_id',${item.id}::text))`);
      await tx.execute(sql`UPDATE hirelix_private_conversations SET updated_at=now() WHERE id=${item.conversation_id}::uuid AND user_id=${item.user_id}::uuid`);
      await tx.execute(sql`INSERT INTO hirelix_private_notifications(user_id,title,href,kind,request_key) VALUES(${item.user_id}::uuid,${item.title},${`/app?conversation=${item.conversation_id}`},'reminder',${`reminder:${item.id}:${item.version}`}) ON CONFLICT DO NOTHING`);
      await tx.execute(sql`UPDATE hirelix_private_schedules SET enabled=false,completed_at=${now}::timestamptz,updated_at=now() WHERE id=${item.id}::uuid AND user_id=${item.user_id}::uuid`);
    }
    return due.length;
  });
}
