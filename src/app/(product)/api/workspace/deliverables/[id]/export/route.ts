import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi } from "@/lib/workspace/http";
import { exportDocument } from "@/lib/workspace/document-export";
export const runtime = "nodejs";
export function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return workspaceApi(req, async (user) =>
    exportDocument(
      user.id,
      z.uuid().parse((await params).id),
      z.enum(["pdf", "docx"]).parse(req.nextUrl.searchParams.get("format")),
      z.coerce
        .number()
        .int()
        .positive()
        .parse(req.nextUrl.searchParams.get("version")),
    ),
  );
}
