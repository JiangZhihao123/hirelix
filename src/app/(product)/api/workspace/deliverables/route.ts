import { NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { z } from "zod";
import { listDeliverables } from "@/lib/workspace/deliverables";
import { conversationInput, sendMessage } from "@/lib/workspace/conversations";
export function GET(req: NextRequest) {
  return workspaceApi(req, async (user) => ({
    deliverables: await listDeliverables(user.id),
  }));
}
export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) => {
    const input = conversationInput.extend({ role_id: z.uuid() }).parse(await readBody(req));
    return sendMessage(user.id, input);
  });
}
