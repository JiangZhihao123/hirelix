import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { emailReceipts, sendRecommendation } from "@/lib/workspace/gmail";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export function GET(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => ({
    receipts: await emailReceipts(
      user.id,
      z.uuid().parse((await context.params).id),
    ),
  }));
}
export function POST(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) =>
    sendRecommendation(
      user.id,
      z.uuid().parse((await context.params).id),
      await readBody(req),
    ),
  );
}
