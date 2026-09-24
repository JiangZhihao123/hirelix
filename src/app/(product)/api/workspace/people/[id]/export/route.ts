import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { exportPerson } from "@/lib/workspace/files";
import { idSchema } from "@/lib/workspace/types";
export function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return workspaceApi(req, async (user) =>
    exportPerson(user.id, idSchema.parse((await context.params).id)),
  );
}
