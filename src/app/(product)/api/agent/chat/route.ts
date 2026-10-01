import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { hirelix_agent_messages } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";
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

// Superseded by the metered private-workspace queue; no public AI bypass.
export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status:401 });
  return NextResponse.json({ error:"Use your Personal Agent workspace to create AI work.",workspaceUrl:"/app" },{ status:410 });
}
