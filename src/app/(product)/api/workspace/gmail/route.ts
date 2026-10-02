import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { gmailConnection, disconnectGmail } from "@/lib/workspace/gmail";
export function GET(req: NextRequest) {
  return workspaceApi(req, (user) => gmailConnection(user.id));
}
export function DELETE(req: NextRequest) {
  return workspaceApi(req, async (user) => {
    await disconnectGmail(user.id);
    return { ok: true };
  });
}
