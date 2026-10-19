import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  adminCookieName,
  readAdminSession,
  adminSameOrigin,
} from "./admin-auth";
import { WorkspaceError } from "./workspace/database";
import { getLogger } from "./logger";
export async function adminApi(
  req: NextRequest,
  handler: (token: string) => Promise<unknown>,
) {
  const reply = (body: object, status: number) =>
    NextResponse.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  try {
    const token = req.cookies.get(adminCookieName())?.value;
    if (!token || !(await readAdminSession(token)))
      return reply({ error: "Not authorized" }, 401);
    if (!["GET", "HEAD"].includes(req.method) && !adminSameOrigin(req))
      return reply({ error: "Invalid origin" }, 403);
    const result = await handler(token);
    return result instanceof Response ? result : reply(result as object, 200);
  } catch (error) {
    if (error instanceof ZodError)
      return reply({ error: "Invalid request" }, 400);
    if (error instanceof WorkspaceError)
      return reply({ error: error.message }, error.status);
    getLogger({ component: "admin_feedback" }).error(
      "Admin feedback request failed",
    );
    return reply({ error: "Unable to complete request" }, 500);
  }
}
