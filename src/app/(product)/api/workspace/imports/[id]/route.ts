import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi } from "@/lib/workspace/http";
import { importDetails } from "@/lib/workspace/imports";
import { idSchema } from "@/lib/workspace/types";
type Context = { params: Promise<{ id: string }> };
export function GET(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) =>
    importDetails(
      user.id,
      idSchema.parse((await context.params).id),
      z.coerce
        .number()
        .int()
        .min(1)
        .max(100000)
        .parse(req.nextUrl.searchParams.get("page") || 1),
    ),
  );
}
