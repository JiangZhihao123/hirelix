import { NextRequest, NextResponse } from "next/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_candidates, hirelix_searches } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";

const candidateDeliveryPrioritySql = sql`
  CASE ${hirelix_candidates.metadata}->>'delivery_bucket'
    WHEN 'reach_first' THEN 0
    WHEN 'review_next' THEN 1
    WHEN 'lower_priority' THEN 2
    WHEN 'not_recommended' THEN 3
    ELSE 2
  END
`;
const candidateQualityScoreSql = sql`
  COALESCE(
    NULLIF(${hirelix_candidates.metadata}->>'quality_score', '')::numeric,
    NULLIF(${hirelix_candidates.metadata}->'scoring_breakdown'->>'quality_score', '')::numeric,
    ${hirelix_candidates.match_score}
  )
`;
const candidateAdvanceScoreSql = sql`
  COALESCE(
    NULLIF(${hirelix_candidates.metadata}->>'advance_score', '')::numeric,
    NULLIF(${hirelix_candidates.metadata}->'scoring_breakdown'->>'advance_score', '')::numeric,
    ${hirelix_candidates.match_score}
  )
`;
const candidateTriggerScoreSql = sql`
  COALESCE(
    NULLIF(${hirelix_candidates.metadata}->>'subscription_trigger_score', '')::numeric,
    NULLIF(${hirelix_candidates.metadata}->'suitability'->>'subscription_trigger_score', '')::numeric,
    ${hirelix_candidates.match_score}
  )
`;

/**
 * GET /api/searches/[id]
 *
 * Returns a single search owned by the current user, plus the candidates that
 * belong to it. Replaces the previous browser Supabase calls on
 * `/app/search/[id]`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const searchRows = await db
    .select()
    .from(hirelix_searches)
    .where(and(eq(hirelix_searches.id, id), eq(hirelix_searches.user_id, user.id)))
    .limit(1);
  const search = searchRows[0];
  if (!search) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  const candidateRows = await db
    .select()
    .from(hirelix_candidates)
    .where(eq(hirelix_candidates.search_id, id))
    .orderBy(
      sql`${hirelix_candidates.final_rank} ASC NULLS LAST`,
      candidateDeliveryPrioritySql,
      sql`${candidateQualityScoreSql} DESC NULLS LAST`,
      sql`${candidateAdvanceScoreSql} DESC NULLS LAST`,
      desc(hirelix_candidates.match_score),
      sql`${candidateTriggerScoreSql} DESC NULLS LAST`,
      sql`(${hirelix_candidates.metadata}->>'scored_rank')::int ASC NULLS LAST`,
      asc(hirelix_candidates.created_at),
    );

  // Normalize Date columns to ISO strings to keep the API response stable for
  // the existing client components that expect strings.
  const stripDates = <T extends Record<string, unknown>>(row: T): T => {
    const out: Record<string, unknown> = { ...row };
    for (const key of Object.keys(out)) {
      const value = out[key];
      if (value instanceof Date) out[key] = value.toISOString();
    }
    return out as T;
  };

  return NextResponse.json({
    search: stripDates(search),
    candidates: candidateRows.map(stripDates),
  });
}

/**
 * PATCH /api/searches/[id]
 *
 * Apply a small set of allowed status transitions on a search owned by the
 * current user. Used by the dashboard / detail page to mark a stalled search
 * as `error`.
 *
 * Body: { status: 'error', pipeline_step?, error_message? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  let body: {
    status?: unknown;
    pipeline_step?: unknown;
    error_message?: unknown;
  };
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.status !== "error") {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    status: body.status,
    updated_at: new Date(),
  };
  if (typeof body.pipeline_step === "string") patch.pipeline_step = body.pipeline_step;
  if (typeof body.error_message === "string") patch.error_message = body.error_message;

  const updated = await db
    .update(hirelix_searches)
    .set(patch)
    .where(and(eq(hirelix_searches.id, id), eq(hirelix_searches.user_id, user.id)))
    .returning({ id: hirelix_searches.id });

  if (updated.length === 0) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/searches/[id]
 *
 * Deletes a search (and via FK cascade its candidates / jobs / notifications).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const deleted = await db
    .delete(hirelix_searches)
    .where(and(eq(hirelix_searches.id, id), eq(hirelix_searches.user_id, user.id)))
    .returning({ id: hirelix_searches.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "Search not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
