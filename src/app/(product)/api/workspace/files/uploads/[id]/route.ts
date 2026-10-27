import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi } from "@/lib/workspace/http";
import { WorkspaceError } from "@/lib/workspace/database";
import { completeFileUpload, saveUploadPart } from "@/lib/workspace/file-uploads";
import { UPLOAD_PART_BYTES, MAX_UPLOAD_PARTS } from "@/lib/workspace/attachments";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return workspaceApi(req, async user => completeFileUpload(user.id, (await context.params).id, await req.json()));
}
export async function PUT(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return workspaceApi(req, async user => {
    const part = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(MAX_UPLOAD_PARTS - 1)).parse(req.nextUrl.searchParams.get("part"));
    const encodedName = z.string().min(1).max(2250).parse(req.headers.get("x-upload-filename"));
    let name: string;
    try { name = decodeURIComponent(encodedName); }
    catch { throw new WorkspaceError("The uploaded filename is not valid UTF-8."); }
    z.string().min(1).max(250).parse(name);
    if (Number(req.headers.get("content-length")) > UPLOAD_PART_BYTES) throw new WorkspaceError("Upload parts must be at most 2 MB.");
    if (!req.body) throw new WorkspaceError("Upload a non-empty part.");
    const reader = req.body.getReader(), chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > UPLOAD_PART_BYTES) {
          await reader.cancel();
          throw new WorkspaceError("Upload parts must be at most 2 MB.");
        }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    return saveUploadPart(user.id, (await context.params).id, part, name, bytes);
  });
}
