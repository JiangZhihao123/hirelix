import { NextRequest } from "next/server";
import { z } from "zod";
import { workspaceApi } from "@/lib/workspace/http";
import { startImport } from "@/lib/workspace/imports";
import { MAX_FILE_BYTES } from "@/lib/workspace/files";
import { WorkspaceError } from "@/lib/workspace/database";
export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) => {
    const form = await req.formData(),
      file = form.get("file"),
      key = z.string().min(1).max(200).parse(form.get("request_key"));
    if (!(file instanceof File))
      throw new WorkspaceError("Choose a CSV, PDF or DOCX file");
    if (file.size > MAX_FILE_BYTES)
      throw new WorkspaceError("Upload files up to 4 MB each");
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
