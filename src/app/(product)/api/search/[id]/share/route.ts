import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_search_shares, hirelix_searches } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";
import {
  createSearchShareToken,
  DEFAULT_SHARED_CANDIDATE_LIMIT,
  hashSearchShareToken,
} from "@/lib/search-share";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromApiRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const [search] = await db
    .select({ id: hirelix_searches.id, status: hirelix_searches.status })
    .from(hirelix_searches)
    .where(and(eq(hirelix_searches.id, id), eq(hirelix_searches.user_id, user.id)))
    .limit(1);

  if (!search) return NextResponse.json({ error: "Search not found" }, { status: 404 });
  if (search.status !== "done") {
    return NextResponse.json({ error: "The candidate pool must be complete before sharing." }, { status: 409 });
  }

  const now = new Date();
  const token = createSearchShareToken();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000);

  await db.transaction(async (tx) => {
    await tx
      .update(hirelix_search_shares)
      .set({ revoked_at: now, updated_at: now })
      .where(
        and(
          eq(hirelix_search_shares.search_id, id),
          eq(hirelix_search_shares.user_id, user.id),
          isNull(hirelix_search_shares.revoked_at),
        ),
      );
    await tx.insert(hirelix_search_shares).values({
      search_id: id,
      user_id: user.id,
      token_hash: hashSearchShareToken(token),
      candidate_limit: DEFAULT_SHARED_CANDIDATE_LIMIT,
      expires_at: expiresAt,
    });
  });

  return NextResponse.json({
    shareUrl: `${req.nextUrl.origin}/share/${token}`,
    candidateLimit: DEFAULT_SHARED_CANDIDATE_LIMIT,
    expiresAt: expiresAt.toISOString(),
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUserFromApiRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const now = new Date();
  await db
    .update(hirelix_search_shares)
    .set({ revoked_at: now, updated_at: now })
    .where(
      and(
        eq(hirelix_search_shares.search_id, id),
        eq(hirelix_search_shares.user_id, user.id),
        isNull(hirelix_search_shares.revoked_at),
      ),
    );
  return NextResponse.json({ ok: true });
}
