import { NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { listRoles, createRole } from "@/lib/workspace/roles";
export function GET(req: NextRequest) {
  return workspaceApi(req, async (user) => ({
    roles: await listRoles(user.id),
  }));
}
export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) => ({
    role: await createRole(user.id, await readBody(req)),
  }));
}
