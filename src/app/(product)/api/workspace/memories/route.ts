import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { listPersonalMemories } from "@/lib/workspace/memories";

export function GET(req: NextRequest) {
  return workspaceApi(req, async user => ({
    memories: await listPersonalMemories(user.id),
    archived: await listPersonalMemories(user.id, true),
  }));
}
