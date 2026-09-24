import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { owned } from "@/lib/workspace/database";
import { updateDeliverable } from "@/lib/workspace/deliverables";
export function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return workspaceApi(req, async (user) => ({
    deliverable: await owned(
      user.id,
      "deliverable",
      z.uuid().parse((await params).id),
    ),
  }));
}
export function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return workspaceApi(req, async (user) => ({
    deliverable: await updateDeliverable(
      user.id,
      z.uuid().parse((await params).id),
      await readBody(req),
    ),
  }));
}
