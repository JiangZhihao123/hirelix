import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { hirelix_agent_briefs } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { draftPrivateBrief } from "@/lib/private-agent";
import { getLogger, errorLogFields } from "@/lib/logger";

const logger = getLogger({ component: "api_agent_briefs" });

export async function GET(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const briefs = await db
      .select()
      .from(hirelix_agent_briefs)
      .where(eq(hirelix_agent_briefs.user_id, user.id))
      .orderBy(desc(hirelix_agent_briefs.updated_at))
      .limit(50);
    return NextResponse.json({ briefs });
  } catch (error) {
    logger.error(
      { user_id: user.id, ...errorLogFields(error) },
      "Brief load failed",
    );
    return NextResponse.json(
      { error: "Could not load your briefs" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    search_id?: unknown;
  } | null;
  if (typeof body?.search_id !== "string")
    return NextResponse.json(
      { error: "Choose a client role" },
      { status: 400 },
    );
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::integer` })
      .from(hirelix_agent_briefs)
      .where(
        and(
          eq(hirelix_agent_briefs.user_id, user.id),
          gte(hirelix_agent_briefs.created_at, since),
        ),
      );
    if (count >= 6)
      return NextResponse.json(
        { error: "Daily draft limit reached. Try again tomorrow." },
        { status: 429 },
      );
    const draft = await draftPrivateBrief({
      userId: user.id,
      searchId: body.search_id,
    });
    const [brief] = await db
      .insert(hirelix_agent_briefs)
      .values({
        user_id: user.id,
        search_id: body.search_id,
        title: draft.title,
        content: draft.content,
      })
      .returning();
    return NextResponse.json({ brief }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Role not found")
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    logger.error(
      { user_id: user.id, ...errorLogFields(error) },
      "Brief generation failed",
    );
    return NextResponse.json(
      { error: "Could not draft the brief right now" },
      { status: 500 },
    );
  }
}
