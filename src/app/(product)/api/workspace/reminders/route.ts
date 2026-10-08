import { NextRequest } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { listReminders } from "@/lib/workspace/reminders";
import { rows, WorkspaceError } from "@/lib/workspace/database";
export function GET(req: NextRequest) { return workspaceApi(req, async user => ({reminders: await listReminders(user.id)})); }
export function PATCH(req: NextRequest) { return workspaceApi(req, async user => {
  const input=z.object({id:z.uuid(),expected_version:z.number().int().positive(),enabled:z.boolean()}).parse(await readBody(req));
  const result=await rows(sql`UPDATE hirelix_private_schedules SET enabled=${input.enabled},version=version+1,updated_at=now() WHERE user_id=${user.id}::uuid AND id=${input.id}::uuid AND kind='reminder' AND version=${input.expected_version} AND completed_at IS NULL AND (${!input.enabled} OR next_run_at>now()) RETURNING id`);
  if(!result.length) throw new WorkspaceError("This reminder changed or is already due. Ask to reschedule it.",409);
  return {ok:true};
}); }
