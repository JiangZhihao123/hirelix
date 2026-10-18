import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { workspaceApi } from "@/lib/workspace/http";
import { rows, WorkspaceError } from "@/lib/workspace/database";
import { requireFeedbackAdmin } from "@/lib/product-feedback";
export function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return workspaceApi(req, async (user) => {
    await requireFeedbackAdmin(user);
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
