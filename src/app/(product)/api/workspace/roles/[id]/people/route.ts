import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import {
  linkPerson,
  updateRelationship,
  relationshipInput,
} from "@/lib/workspace/roles";
import { idSchema } from "@/lib/workspace/types";
type Context = { params: Promise<{ id: string }> };
export function POST(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => {
    const input = z.object({ person_id: idSchema }).parse(await readBody(req));
    return {
      relationship: await linkPerson(
        user.id,
        idSchema.parse((await context.params).id),
        input.person_id,
      ),
    };
  });
}
export function PATCH(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => {
    const input = relationshipInput
      .extend({ person_id: idSchema })
      .parse(await readBody(req));
    return {
      relationship: await updateRelationship(
        user.id,
        idSchema.parse((await context.params).id),
        input.person_id,
        input,
      ),
    };
  });
}
