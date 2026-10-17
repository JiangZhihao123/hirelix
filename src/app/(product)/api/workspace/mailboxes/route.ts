import { z } from "zod";
import { NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { mailboxConnections, disconnectMailbox, defaultMailboxProvider, setDefaultMailboxProvider } from "@/lib/workspace/mailbox";
import { mailboxProvider } from "@/lib/workspace/mailbox-contract";
export function GET(req: NextRequest) {
  return workspaceApi(req, async user => ({connections: await mailboxConnections(user.id), default_provider: await defaultMailboxProvider(user.id)}));
}
export function DELETE(req: NextRequest) {
  return workspaceApi(req, async user => {
    await disconnectMailbox(user.id, mailboxProvider.parse(req.nextUrl.searchParams.get("provider")));
    return {ok:true};
  });
}

export function PATCH(req: NextRequest) {
  return workspaceApi(req, async user => {
    const body = z.object({provider:mailboxProvider}).parse(await readBody(req));
    await setDefaultMailboxProvider(user.id,mailboxProvider.parse(body.provider));
    return {ok:true};
  });
}
