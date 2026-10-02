import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import {
  activeDocumentShare,
  publishDocument,
  revokeDocumentShare,
} from "@/lib/workspace/document-sharing";
type Context = { params: Promise<{ id: string }> };
export function GET(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => ({
    share: await activeDocumentShare(
      user.id,
      z.uuid().parse((await context.params).id),
    ),
  }));
}
export function POST(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => {
    const input = z
      .object({ expected_version: z.number().int().positive() })
      .parse(await readBody(req));
    return {
      share: await publishDocument(
        user.id,
        z.uuid().parse((await context.params).id),
        input.expected_version,
      ),
    };
  });
}
export function DELETE(req: NextRequest, context: Context) {
  return workspaceApi(req, async (user) => {
    await revokeDocumentShare(
      user.id,
      z.uuid().parse((await context.params).id),
    );
    return { ok: true };
  });
}
