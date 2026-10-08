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
  return workspaceApi(req, async user => ({ job: await cancelJob(user.id, idSchema.parse((await context.params).id)) }));
}
