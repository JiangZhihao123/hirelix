import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_searches } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { getStalledSearchMessage } from "@/lib/search-state";

/**
 * POST /api/searches/mark-stale
 *
 * Body: { ids: string[] }
 *
 * Marks the given searches (must belong to current user) as `error` so the
 * dashboard stops polling them. Replaces the previous direct browser Supabase
 * write.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ids?: unknown };
  try {
    body = (await req.json()) as { ids?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, updated: 0 });
  }

  const ts = new Date();
  const updated = await db
    .update(hirelix_searches)
    .set({
      status: "error",
      pipeline_step: "error",
      error_message: getStalledSearchMessage(),
      updated_at: ts,
    })
    .where(
      and(
        inArray(hirelix_searches.id, ids),
        eq(hirelix_searches.user_id, user.id),
      ),
    )
    .returning({ id: hirelix_searches.id });

  return NextResponse.json({ ok: true, updated: updated.length });
}
