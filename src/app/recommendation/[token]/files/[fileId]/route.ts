import { sharedDocumentFile } from "@/lib/workspace/document-sharing";
import { attachment } from "@/lib/workspace/files";
import { WorkspaceError } from "@/lib/workspace/database";
import { z } from "zod";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string; fileId: string }> },
) {
  const { token, fileId } = await params;
  if (!z.uuid().safeParse(fileId).success)
    return new Response("Not found", { status: 404 });
  try {
    const file = await sharedDocumentFile(token, fileId);
    return attachment(file.bytes, file.name, file.media_type);
  } catch (error) {
    if (error instanceof WorkspaceError)
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    throw error;
  }
}
