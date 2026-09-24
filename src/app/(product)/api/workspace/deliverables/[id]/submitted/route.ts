import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { markSubmitted } from "@/lib/workspace/deliverables";
export function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return workspaceApi(req, async (user) => ({
    deliverable: await markSubmitted(
      user.id,
      z.uuid().parse((await params).id),
      await readBody(req),
    ),
  }));
}
