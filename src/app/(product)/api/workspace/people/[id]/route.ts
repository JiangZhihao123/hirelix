import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import {
  personDetails,
  updatePerson,
  deletePerson,
} from "@/lib/workspace/people";
import { idSchema, personInput } from "@/lib/workspace/types";
type Context = { params: Promise<{ id: string }> };
const version = z.object({ expected_version: z.number().int().positive() });
export function GET(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) =>
    personDetails(user.id, idSchema.parse((await context.params).id)),
  );
}
export function PATCH(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => {
    const input = personInput.extend(version.shape).parse(await readBody(req));
    return {
      person: await updatePerson(
        user.id,
        idSchema.parse((await context.params).id),
        input,
        input.expected_version,
      ),
    };
  });
}
export function DELETE(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => {
    const input = version.parse(await readBody(req));
    return deletePerson(
      user.id,
      idSchema.parse((await context.params).id),
      input.expected_version,
    );
  });
}
