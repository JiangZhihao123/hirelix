import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { readMailboxMessage } from "@/lib/workspace/mailbox";
import { mailboxReadInput } from "@/lib/workspace/mailbox-contract";
import { toolResultMailbox } from "@/lib/workspace/tool-result-view";

export async function GET(req: NextRequest) {
  const response = await workspaceApi(req, async user => {
    const input = mailboxReadInput.parse(Object.fromEntries(req.nextUrl.searchParams));
    const message = await readMailboxMessage(user.id, input);
    return {message: toolResultMailbox("read_mail", {provider: input.provider, ...message})!.messages[0]};
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
