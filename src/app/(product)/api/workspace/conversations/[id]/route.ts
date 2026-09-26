import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi } from "@/lib/workspace/http";
import {
  conversationDetails,
  renameConversation,
} from "@/lib/workspace/conversations";
export function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return workspaceApi(req, async (user) =>
    conversationDetails(user.id, z.uuid().parse((await params).id)),
  );
}
export function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return workspaceApi(req, async (user) =>
    renameConversation(
      user.id,
      z.uuid().parse((await params).id),
      await req.json(),
    ),
  );
}
