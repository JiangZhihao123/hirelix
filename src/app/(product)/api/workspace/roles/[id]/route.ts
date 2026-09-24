import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { roleDetails, updateRole } from "@/lib/workspace/roles";
import { idSchema, roleInput } from "@/lib/workspace/types";
type Context = { params: Promise<{ id: string }> };
export function GET(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) =>
    roleDetails(user.id, idSchema.parse((await context.params).id)),
  );
}
export function PATCH(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => {
    const input = roleInput
      .extend({ expected_version: z.number().int().positive() })
      .parse(await readBody(req));
    return {
      role: await updateRole(
        user.id,
        idSchema.parse((await context.params).id),
        input,
        input.expected_version,
      ),
    };
  });
}
