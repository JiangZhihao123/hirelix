import { NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { reviewImportRow } from "@/lib/workspace/imports";
import { idSchema } from "@/lib/workspace/types";
export function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; rowId: string }> },
) {
  return workspaceApi(req, async (user) => {
    const params = await context.params;
    return {
      row: await reviewImportRow(
        user.id,
        idSchema.parse(params.id),
        idSchema.parse(params.rowId),
        await readBody(req),
      ),
    };
  });
}
