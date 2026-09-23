import { publicSearchRequirements } from "@/lib/search/decision-contract";
import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_searches } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";

/**
 * GET /api/searches
 *
 * Lists the current user's searches. Replaces the previous direct browser
 * Supabase query so the frontend talks to our own backend (which in turn
 * reads from the self-hosted Postgres) instead of Supabase PostgREST.
 */
export async function GET(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select({
      id: hirelix_searches.id,
      title: hirelix_searches.title,
      parsed_requirements: sql<Record<string, unknown>>`${hirelix_searches.parsed_requirements} - 'candidate_index_checkpoint'`,
      status: hirelix_searches.status,
      pipeline_step: hirelix_searches.pipeline_step,
      parse_completed_at: hirelix_searches.parse_completed_at,
      partial_ready_at: hirelix_searches.partial_ready_at,
      created_at: hirelix_searches.created_at,
      updated_at: hirelix_searches.updated_at,
      error_message: hirelix_searches.error_message,
      jd_text: hirelix_searches.jd_text,
    })
    .from(hirelix_searches)
    .where(eq(hirelix_searches.user_id, user.id))
    .orderBy(desc(hirelix_searches.created_at));

  // Convert Date columns to ISO strings to keep response shape compatible with
  // the previous Supabase-backed client code.
  const searches = rows.map((row) => ({
    ...row,
    parsed_requirements: publicSearchRequirements(row.parsed_requirements),
    parse_completed_at: row.parse_completed_at?.toISOString() ?? null,
    partial_ready_at: row.partial_ready_at?.toISOString() ?? null,
    created_at: row.created_at?.toISOString() ?? null,
    updated_at: row.updated_at?.toISOString() ?? null,
  }));

  return NextResponse.json({ searches });
}
