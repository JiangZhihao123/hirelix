import { NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { listConversations, sendMessage } from "@/lib/workspace/conversations";
export function GET(req: NextRequest) {
  return workspaceApi(req, async (user) => ({
    conversations: await listConversations(user.id),
  }));
}
export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) =>
    sendMessage(user.id, await readBody(req)),
  );
}
