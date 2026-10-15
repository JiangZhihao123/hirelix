import { NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { controlConversation } from "@/lib/workspace/conversation-control";
import { idSchema } from "@/lib/workspace/types";
export function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return workspaceApi(req, async (user) =>
    controlConversation(
      user.id,
      idSchema.parse((await context.params).id),
      await readBody(req),
    ),
  );
}
