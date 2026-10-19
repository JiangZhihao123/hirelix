import { NextRequest } from "next/server";
import { readBody } from "@/lib/workspace/http";
import { adminApi } from "@/lib/admin-http";
import { listFeedback, updateFeedback } from "@/lib/product-feedback";
export function GET(req: NextRequest) {
  return adminApi(req, async (token) => ({
    items: await listFeedback(
      token,
      req.nextUrl.searchParams.get("before"),
      req.nextUrl.searchParams.get("report"),
    ),
  }));
}
export function PATCH(req: NextRequest) {
  return adminApi(req, async (token) =>
    updateFeedback(token, await readBody(req)),
  );
}
