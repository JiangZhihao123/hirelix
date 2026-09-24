import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi } from "@/lib/workspace/http";
import { listVersions } from "@/lib/workspace/database";
import { idSchema } from "@/lib/workspace/types";
const query = z.object({
  kind: z.enum(["person", "role", "record", "deliverable", "role_candidate"]),
  id: idSchema,
});
export function GET(req: NextRequest) {
  return workspaceApi(req, async (user) => {
    const input = query.parse(Object.fromEntries(req.nextUrl.searchParams));
    return { versions: await listVersions(user.id, input.kind, input.id) };
  });
}
