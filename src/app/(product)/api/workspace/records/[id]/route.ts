import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { owned } from "@/lib/workspace/database";
import { updateRecord } from "@/lib/workspace/records";
import { idSchema, recordInput } from "@/lib/workspace/types";
type Context = { params: Promise<{ id: string }> };
export function GET(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => ({
    record: await owned(
      user.id,
      "record",
      idSchema.parse((await context.params).id),
    ),
  }));
}
export function PATCH(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => {
    const input = recordInput
      .extend({ expected_version: z.number().int().positive() })
      .parse(await readBody(req));
    return {
      record: await updateRecord(
        user.id,
        idSchema.parse((await context.params).id),
        input,
        input.expected_version,
      ),
    };
  });
}
