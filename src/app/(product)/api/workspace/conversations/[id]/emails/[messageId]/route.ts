import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi } from "@/lib/workspace/http";
import { cancelConversationEmail } from "@/lib/workspace/conversation-email";
export function DELETE(req:NextRequest, context:{params:Promise<{id:string;messageId:string}>}) {
  return workspaceApi(req,async user => {
    const params = await context.params;
    return cancelConversationEmail(user.id,z.uuid().parse(params.id),z.uuid().parse(params.messageId));
  });
}
