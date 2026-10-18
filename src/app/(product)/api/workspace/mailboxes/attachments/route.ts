import {NextRequest} from "next/server";
import {z} from "zod";
import {workspaceApi} from "@/lib/workspace/http";
import {mailboxReadInput} from "@/lib/workspace/mailbox-contract";
import {readMailboxAttachment} from "@/lib/workspace/mailbox";
import {attachment} from "@/lib/workspace/files";

export function GET(req: NextRequest) {
  return workspaceApi(req,async user=>{
    const input=mailboxReadInput.extend({attachment_id:z.string().min(1).max(2048)}).parse(Object.fromEntries(req.nextUrl.searchParams));
    const file=await readMailboxAttachment(user.id,input);
    return attachment(file.bytes,file.name,"application/octet-stream");
  });
}
