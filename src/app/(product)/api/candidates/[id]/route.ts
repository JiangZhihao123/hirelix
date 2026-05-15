import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_candidates, hirelix_searches } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { isValidCandidateStatus } from "@/lib/candidate-status";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { status } = body;

    if (!isValidCandidateStatus(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const rows = await db
      .select({
        candidateId: hirelix_candidates.id,
        searchUserId: hirelix_searches.user_id,
      })
      .from(hirelix_candidates)
      .innerJoin(hirelix_searches, eq(hirelix_searches.id, hirelix_candidates.search_id))
      .where(eq(hirelix_candidates.id, id))
      .limit(1);

    const candidate = rows[0];
    if (!candidate || candidate.searchUserId !== user.id) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    try {
      await db
        .update(hirelix_candidates)
        .set({ status })
        .where(eq(hirelix_candidates.id, id));
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
