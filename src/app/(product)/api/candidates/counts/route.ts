import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_candidates, hirelix_searches } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";

/**
 * POST /api/candidates/counts
 *
 * Body: { search_ids: string[] }
 *
 * Returns a record keyed by `search_id` with `{ total, starred, contacted }`
 * counts for the dashboard. Only searches owned by the current user are
 * included; foreign / unknown ids are silently dropped.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { search_ids?: unknown };
  try {
    body = (await req.json()) as { search_ids?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.search_ids)
    ? body.search_ids.filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      )
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ counts: {} });
  }

  // Only return counts for searches the user owns.
  const ownedRows = await db
    .select({ id: hirelix_searches.id })
    .from(hirelix_searches)
    .where(
      and(
        inArray(hirelix_searches.id, ids),
        eq(hirelix_searches.user_id, user.id),
      ),
    );
  const ownedIds = ownedRows.map((row) => row.id);
  if (ownedIds.length === 0) {
    return NextResponse.json({ counts: {} });
  }

  const candidates = await db
    .select({
      search_id: hirelix_candidates.search_id,
      status: hirelix_candidates.status,
    })
    .from(hirelix_candidates)
    .where(inArray(hirelix_candidates.search_id, ownedIds));

  const counts: Record<
    string,
    { search_id: string; total: number; starred: number; contacted: number }
  > = {};
  for (const candidate of candidates) {
    const key = candidate.search_id;
    if (!counts[key]) {
      counts[key] = { search_id: key, total: 0, starred: 0, contacted: 0 };
    }
    counts[key].total += 1;
    if (candidate.status === "starred") counts[key].starred += 1;
    if (candidate.status === "contacted") counts[key].contacted += 1;
  }

  return NextResponse.json({ counts });
}
