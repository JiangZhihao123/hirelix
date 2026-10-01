import { NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { retrySchedule, saveSchedule } from "@/lib/workspace/schedules";
import { idSchema } from "@/lib/workspace/types";
type Context = { params: Promise<{ id: string }> };
export function PUT(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => ({ schedule: await saveSchedule(user.id, idSchema.parse((await context.params).id), await readBody(req)) }));
}
export function POST(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => {
    await retrySchedule(user.id, idSchema.parse((await context.params).id));
    return { ok: true };
  });
}
