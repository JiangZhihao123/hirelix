import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { mailboxConnections, disconnectMailbox } from "@/lib/workspace/mailbox";
import { mailboxProvider } from "@/lib/workspace/mailbox-contract";
export function GET(req: NextRequest) {
  return workspaceApi(req, async user => ({connections: await mailboxConnections(user.id)}));
}
export function DELETE(req: NextRequest) {
  return workspaceApi(req, async user => {
    await disconnectMailbox(user.id, mailboxProvider.parse(req.nextUrl.searchParams.get("provider")));
    return {ok:true};
  });
}
