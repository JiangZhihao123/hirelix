import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { mailboxActivity } from "@/lib/workspace/gmail";
export function GET(req: NextRequest) {
  return workspaceApi(req, async user => ({ emails: await mailboxActivity(user.id, { role: req.nextUrl.searchParams.get("role") || undefined, document: req.nextUrl.searchParams.get("document") || undefined }) }));
}
