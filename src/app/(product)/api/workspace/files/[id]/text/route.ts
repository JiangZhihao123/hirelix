import { NextRequest } from "next/server";
import { workspaceApi } from "@/lib/workspace/http";
import { readFile } from "@/lib/workspace/files";
import { extractDocument } from "@/lib/workspace/imports";
import { idSchema } from "@/lib/workspace/types";
export function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  return workspaceApi(req, async user => {
    const file = await readFile(user.id, idSchema.parse((await context.params).id));
    const text = file.name.toLowerCase().endsWith(".csv") ? new TextDecoder("utf-8", {fatal:true}).decode(file.bytes) : await extractDocument(file);
    return { name: file.name, content: text.slice(0, 100000), truncated: text.length > 100000 };
  });
}
