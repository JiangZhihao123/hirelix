import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi } from "@/lib/workspace/http";
import { startImport } from "@/lib/workspace/imports";
import { DIRECT_UPLOAD_BYTES } from "@/lib/workspace/attachments";
import { WorkspaceError } from "@/lib/workspace/database";
export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) => {
    const form = await req.formData(),
      file = form.get("file"),
      key = z.string().min(1).max(200).parse(form.get("request_key"));
    if (!(file instanceof File))
      throw new WorkspaceError("Choose a CSV, PDF or DOCX file");
    if (file.size > DIRECT_UPLOAD_BYTES)
      throw new WorkspaceError("For files larger than 4 MB, use Add files in a conversation for resumable upload up to 50 MB.");
    return {
      job: await startImport(
        user.id,
        {
          name: file.name,
          type: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        },
        key,
        form.get("in_conversation") === "true"
          ? {
              id: z
                .uuid()
                .nullable()
                .parse(form.get("conversation_id") || null),
              role_id: z
                .uuid()
                .nullable()
                .parse(form.get("role_id") || null),
              person_id: z
                .uuid()
                .nullable()
                .parse(form.get("person_id") || null),
              message: z
                .string()
                .max(50000)
                .parse(form.get("message") || ""),
            }
          : undefined,
      ),
    };
  });
}
