import { after, NextRequest } from "next/server";
import { workspaceApi, readBody } from "@/lib/workspace/http";
import {
  feedbackAdmin,
  saveFeedback,
  listFeedback,
  updateFeedback,
  notifyProductFeedback,
} from "@/lib/product-feedback";
import { WorkspaceError } from "@/lib/workspace/database";
import { getLogger } from "@/lib/logger";
export const runtime = "nodejs";
export function GET(req: NextRequest) {
  return workspaceApi(req, async (user) =>
    req.nextUrl.searchParams.get("access") === "1"
      ? { admin: await feedbackAdmin(user) }
      : {
          items: await listFeedback(
            user,
            req.nextUrl.searchParams.get("before"),
            req.nextUrl.searchParams.get("report"),
          ),
        },
  );
}
export function POST(req: NextRequest) {
  return workspaceApi(req, async (user) => {
    // Bound streamed bodies as well as declared lengths before parsing multipart.
    const reader = req.body?.getReader();
    if (!reader) throw new WorkspaceError("Feedback is required");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 3 * 1024 * 1024) {
        await reader.cancel();
        throw new WorkspaceError("Feedback upload is too large", 413);
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": req.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("screenshot");
    const result = await saveFeedback(
      user,
      {
        request_key: form.get("request_key"),
        category: form.get("category") || "other",
        message: form.get("message"),
        page_path: form.get("page_path"),
      },
      file instanceof File ? file : null,
    );
    after(async () => {
      try {
        await notifyProductFeedback();
      } catch {
        getLogger({ component: "product_feedback" }).warn(
          "Feedback notification deferred to worker",
        );
      }
    });
    return result;
  });
}
export function PATCH(req: NextRequest) {
  return workspaceApi(req, async (user) =>
    updateFeedback(user, await readBody(req)),
  );
}
