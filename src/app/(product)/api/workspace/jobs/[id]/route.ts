import { z } from "zod";
import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { owned } from "@/lib/workspace/database";
import { cancelJob, retryJob } from "@/lib/workspace/jobs";
import { idSchema } from "@/lib/workspace/types";
type Context = { params: Promise<{ id: string }> };
export function GET(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => ({
    job: await owned(user.id, "job", idSchema.parse((await context.params).id)),
  }));
}
export function POST(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => ({
    job: await retryJob(user.id, idSchema.parse((await context.params).id)),
  }));
}

export function DELETE(req: NextRequest, context: Context) {
  return workspaceApi(req, async user => {
    const visible = z.object({stream_epoch: z.string().optional(), stream_sequence: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()}).parse(await req.json().catch(() => ({})));
    return {job: await cancelJob(user.id, idSchema.parse((await context.params).id), visible)};
  });
}
