import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { emailReceipts, sendRecommendation } from "@/lib/workspace/gmail";
import { owned } from "@/lib/workspace/database";
import { roleRecipient } from "@/lib/workspace/roles";
import type { Deliverable } from "@/lib/workspace/types";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export function GET(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => {
    const id = z.uuid().parse((await context.params).id);
    const document = await owned<Deliverable>(user.id, "deliverable", id);
    return {
      receipts: await emailReceipts(user.id, id),
      default_recipient: await roleRecipient(user.id, document.role_id),
    };
  });
}
export function POST(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) =>
    sendRecommendation(
      user.id,
      z.uuid().parse((await context.params).id),
      await readBody(req),
      req.nextUrl.origin,
    ),
  );
}
