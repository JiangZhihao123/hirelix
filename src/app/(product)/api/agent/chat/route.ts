import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { hirelix_agent_messages } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { answerPrivateAgent } from "@/lib/private-agent";
import { getLogger, errorLogFields } from "@/lib/logger";

const logger = getLogger({ component: "api_agent_chat" });

export async function GET(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rows = await db
      .select()
      .from(hirelix_agent_messages)
      .where(eq(hirelix_agent_messages.user_id, user.id))
      .orderBy(desc(hirelix_agent_messages.created_at))
      .limit(60);
    return NextResponse.json({ messages: rows.reverse() });
  } catch (error) {
    logger.error(
      { user_id: user.id, ...errorLogFields(error) },
      "Agent conversation load failed",
    );
    return NextResponse.json(
      { error: "Could not load your conversation" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    message?: unknown;
    search_id?: unknown;
  } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  const searchId =
    typeof body?.search_id === "string" && body.search_id
      ? body.search_id
      : null;
  if (!message || message.length > 4000)
    return NextResponse.json(
      { error: "Write a message under 4,000 characters" },
      { status: 400 },
    );
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::integer` })
      .from(hirelix_agent_messages)
      .where(
        and(
          eq(hirelix_agent_messages.user_id, user.id),
          eq(hirelix_agent_messages.role, "user"),
          gte(hirelix_agent_messages.created_at, since),
        ),
      );
    if (count >= 30)
      return NextResponse.json(
        { error: "Daily agent message limit reached. Try again tomorrow." },
        { status: 429 },
      );

    const history = await db
      .select({
        role: hirelix_agent_messages.role,
        content: hirelix_agent_messages.content,
      })
      .from(hirelix_agent_messages)
      .where(
        and(
          eq(hirelix_agent_messages.user_id, user.id),
          searchId
            ? eq(hirelix_agent_messages.search_id, searchId)
            : isNull(hirelix_agent_messages.search_id),
        ),
      )
      .orderBy(desc(hirelix_agent_messages.created_at))
      .limit(8);
    const answer = await answerPrivateAgent({
      userId: user.id,
      question: message,
      searchId,
      history: history
        .reverse()
        .filter(
          (item): item is { role: "user" | "assistant"; content: string } =>
            item.role === "user" || item.role === "assistant",
        ),
    });
    const saved = await db.transaction(async (tx) => {
      const [question] = await tx
        .insert(hirelix_agent_messages)
        .values({
          user_id: user.id,
          role: "user",
          content: message,
          search_id: searchId,
        })
        .returning();
      const [response] = await tx
        .insert(hirelix_agent_messages)
        .values({
          user_id: user.id,
          role: "assistant",
          content: answer,
          search_id: searchId,
        })
        .returning();
      return { question, response };
    });
    return NextResponse.json(saved);
  } catch (error) {
    if (error instanceof Error && error.message === "Role not found") {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    logger.error(
      { user_id: user.id, ...errorLogFields(error) },
      "Agent answer failed",
    );
    return NextResponse.json(
      { error: "The agent could not answer right now. Please retry." },
      { status: 500 },
    );
  }
}
