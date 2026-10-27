import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { readFile, attachment } from "@/lib/workspace/files";
import { idSchema } from "@/lib/workspace/types";
import { attachmentPreviewType } from "@/lib/workspace/attachments";
import { z } from "zod";
import { WorkspaceError } from "@/lib/workspace/database";
export function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return workspaceApi(req, async (user) => {
    const file = await readFile(
      user.id,
      idSchema.parse((await context.params).id),
    );
    if (req.nextUrl.searchParams.has("page")) {
      if (attachmentPreviewType(file.name, file.media_type) !== "application/pdf") throw new WorkspaceError("Choose a PDF to preview pages.");
      const page = z.coerce.number().int().min(1).max(10000).parse(req.nextUrl.searchParams.get("page"));
      const {pdfPagePreview} = await import("@/lib/workspace/file-thumbnail");
      return Response.json(await pdfPagePreview(file.bytes, page), {headers: {"Cache-Control": "private, no-store"}});
    }
    if (req.nextUrl.searchParams.has("thumbnail") && attachmentPreviewType(file.name, file.media_type) === "application/pdf") {
      const {pdfThumbnail} = await import("@/lib/workspace/file-thumbnail");
      return Response.json(await pdfThumbnail(file.bytes), {headers: {"Cache-Control": "private, no-store"}});
    }
    const previewType = req.nextUrl.searchParams.has("preview") ? attachmentPreviewType(file.name, file.media_type) : null;
    return attachment(file.bytes, file.name, previewType || file.media_type, !!previewType);
  });
}
