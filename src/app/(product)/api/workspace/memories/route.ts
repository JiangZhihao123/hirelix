import { NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { listPersonalMemories, deletePersonalMemories } from "@/lib/workspace/memories";

export function GET(req: NextRequest) {
  return workspaceApi(req, async user => ({
    memories: await listPersonalMemories(user.id),
    archived: await listPersonalMemories(user.id, true),
  }));
}

export function DELETE(req: NextRequest) {
  return workspaceApi(req, async user => deletePersonalMemories(user.id, await readBody(req)));
}
