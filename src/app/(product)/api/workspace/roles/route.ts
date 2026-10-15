import { NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { listRoles, listRolesPage, createRole } from "@/lib/workspace/roles";
import { roleListOptions } from "@/lib/workspace/list-options";
export function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("view") === "list")
    return workspaceApi(req, (user) =>
      listRolesPage(
        user.id,
        roleListOptions.parse(Object.fromEntries(req.nextUrl.searchParams)),
      ),
    );
  return workspaceApi(req, async (user) => ({
    roles: await listRoles(user.id),
  }));
}
export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) => ({
    role: await createRole(user.id, await readBody(req)),
  }));
}
