import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { editPersonalMemory } from "@/lib/workspace/memories";

export function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return workspaceApi(req, async user => ({
    memory: await editPersonalMemory(user.id, z.uuid().parse((await params).id), await readBody(req)),
  }));
}
