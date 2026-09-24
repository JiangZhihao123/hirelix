import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { mergePeople } from "@/lib/workspace/people";
import { idSchema, personInput } from "@/lib/workspace/types";
const inputSchema = z.object({
  source_id: idSchema,
  fields: personInput,
  expected_version: z.number().int().positive(),
  source_version: z.number().int().positive(),
});
export function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return workspaceApi(req, async (user) => {
    const input = inputSchema.parse(await readBody(req));
    return {
      person: await mergePeople(
        user.id,
        idSchema.parse((await context.params).id),
        input.source_id,
        input.fields,
        input.expected_version,
        input.source_version,
      ),
    };
  });
}
