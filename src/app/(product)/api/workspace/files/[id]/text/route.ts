import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { readFile } from "@/lib/workspace/files";
import { readDocument } from "@/lib/workspace/document-reader";
import { attachmentPreviewType } from "@/lib/workspace/attachments";
import { idSchema } from "@/lib/workspace/types";
export function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return workspaceApi(req, async user => {
    const file = await readFile(user.id, idSchema.parse((await context.params).id));
    const previewType = attachmentPreviewType(file.name);
    // Browsing a source must never start another model call or OCR job.
    const text = previewType ? "" : (await readDocument(file, 0, false)).text;
    return { name: file.name, preview_type: previewType, content: text.slice(0, 100000), truncated: text.length > 100000 };
  });
}
