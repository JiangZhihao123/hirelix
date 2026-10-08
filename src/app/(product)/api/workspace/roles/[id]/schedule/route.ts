import { NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { retrySchedule, saveSchedule } from "@/lib/workspace/schedules";
import { idSchema } from "@/lib/workspace/types";
import { owned, rows } from "@/lib/workspace/database";
import { sql } from "drizzle-orm";
type Context = { params: Promise<{ id: string }> };
export function GET(req: NextRequest, context: Context) {
  return workspaceApi(req, async user => {
    const roleId = idSchema.parse((await context.params).id);
    await owned(user.id, "role", roleId);
    const [schedule] = await rows(sql`SELECT * FROM hirelix_private_schedules WHERE user_id=${user.id}::uuid AND role_id=${roleId}::uuid`);
    return { schedule: schedule ?? null };
  });
}
export function PUT(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => ({ schedule: await saveSchedule(user.id, idSchema.parse((await context.params).id), await readBody(req)) }));
}
export function POST(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => {
    await retrySchedule(user.id, idSchema.parse((await context.params).id));
    return { ok: true };
  });
}
