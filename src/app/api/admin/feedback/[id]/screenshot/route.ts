import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { adminApi } from "@/lib/admin-http";
import { rows, WorkspaceError } from "@/lib/workspace/database";

export function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return adminApi(req, async () => {
    const id = z
      .string()
      .uuid()
      .parse((await context.params).id);
    const [item] = await rows<{ encoded: string }>(
      sql`SELECT encode(screenshot,'base64') AS encoded FROM hirelix_product_feedback WHERE id=${id}::uuid AND screenshot IS NOT NULL`,
    );
    if (!item) throw new WorkspaceError("Screenshot not found", 404);
    return new NextResponse(
      new Uint8Array(Buffer.from(item.encoded, "base64")),
      {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": "inline; filename=feedback-screenshot.png",
        },
      },
    );
  });
}
