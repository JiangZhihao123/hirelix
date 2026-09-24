import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { acceptAction } from "@/lib/workspace/conversations";
export function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return workspaceApi(req, async (user) => {
    const input = z
      .object({
        message_id: z.uuid(),
        action_id: z.uuid(),
        fields: z.unknown(),
      })
      .parse(await readBody(req));
    return acceptAction(
      user.id,
      z.uuid().parse((await params).id),
      input.message_id,
      input.action_id,
      input.fields,
    );
  });
}
