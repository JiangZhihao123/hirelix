import { NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { addRecord } from "@/lib/workspace/records";
export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) => ({
    record: await addRecord(user.id, await readBody(req)),
  }));
}
