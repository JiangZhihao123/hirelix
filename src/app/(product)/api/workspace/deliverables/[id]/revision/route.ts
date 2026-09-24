import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import {
  requestRevision,
  latestRevision,
  applyRevision,
} from "@/lib/workspace/revisions";
type Context = { params: Promise<{ id: string }> };
export function GET(req: NextRequest, { params }: Context) {
  return workspaceApi(req, async (user) => ({
    job: await latestRevision(user.id, z.uuid().parse((await params).id)),
  }));
}
export function POST(req: NextRequest, { params }: Context) {
  return workspaceApi(req, async (user) => ({
    job: await requestRevision(
      user.id,
      z.uuid().parse((await params).id),
      await readBody(req),
    ),
  }));
}
export function PATCH(req: NextRequest, { params }: Context) {
  return workspaceApi(req, async (user) => ({
    deliverable: await applyRevision(
      user.id,
      z.uuid().parse((await params).id),
      await readBody(req),
    ),
  }));
}
