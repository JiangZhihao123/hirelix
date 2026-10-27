import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { latestDocumentWork } from "@/lib/workspace/revisions";
import { conversationInput, sendMessage } from "@/lib/workspace/conversations";
type Context = { params: Promise<{ id: string }> };
export function GET(req: NextRequest, { params }: Context) {
  return workspaceApi(req, async (user) => ({
    job: await latestDocumentWork(user.id, z.uuid().parse((await params).id)),
  }));
}
export function POST(req: NextRequest, { params }: Context) {
  return workspaceApi(req, async (user) => {
    const input = conversationInput.extend({document_version:z.number().int().positive()}).parse({
      ...await readBody(req) as object, document_id:z.uuid().parse((await params).id), conversation_id:null,
    });
    return sendMessage(user.id, input);
  });
}
