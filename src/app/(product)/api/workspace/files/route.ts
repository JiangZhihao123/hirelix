import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { WorkspaceError } from "@/lib/workspace/database";
import { uploadConversationFile } from "@/lib/workspace/files";
import { attachmentError, DIRECT_UPLOAD_BYTES } from "@/lib/workspace/attachments";

export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) => {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new WorkspaceError("Choose a file to attach");
    if (file.size > DIRECT_UPLOAD_BYTES) throw new WorkspaceError("Use resumable upload for files larger than 4 MB.");
    const error = attachmentError(file.name, file.size);
    if (error) throw new WorkspaceError(error);
    const saved = await uploadConversationFile(user.id, {
      name: file.name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return { file: { file_id: saved.id, name: saved.name, size: saved.byte_size } };
  });
}
