import { NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import { listConversations, sendMessage } from "@/lib/workspace/conversations";
import { MAX_FILE_BYTES } from "@/lib/workspace/files";
import { WorkspaceError } from "@/lib/workspace/database";
export function GET(req: NextRequest) {
  return workspaceApi(req, async (user) => ({
    conversations: await listConversations(user.id),
  }));
}
export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) => {
    if (!req.headers.get("content-type")?.includes("multipart/form-data"))
      return sendMessage(user.id, await readBody(req));
    const form = await req.formData();
    const selected = form.get("file");
    if (!(selected instanceof File))
      throw new WorkspaceError("Choose a file to attach");
    if (!/\.(csv|pdf|docx|txt|md)$/i.test(selected.name))
      throw new WorkspaceError("Attach a CSV, text PDF, DOCX, TXT or Markdown file");
    if (!selected.size || selected.size > MAX_FILE_BYTES)
      throw new WorkspaceError("Attach a non-empty file up to 4 MB");
    return sendMessage(
      user.id,
      {
        message: form.get("message") || "",
        locale: form.get("locale") || "en",
        request_key: form.get("request_key"),
        conversation_id: form.get("conversation_id") || null,
        role_id: form.get("role_id") || null,
        person_id: form.get("person_id") || null,
      },
      {
        name: selected.name,
        type: selected.type,
        bytes: new Uint8Array(await selected.arrayBuffer()),
      },
    );
  });
}
