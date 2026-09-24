import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { readFile, attachment } from "@/lib/workspace/files";
import { idSchema } from "@/lib/workspace/types";
export function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return workspaceApi(req, async (user) => {
    const file = await readFile(
      user.id,
      idSchema.parse((await context.params).id),
    );
    return attachment(file.bytes, file.name, file.media_type);
  });
}
