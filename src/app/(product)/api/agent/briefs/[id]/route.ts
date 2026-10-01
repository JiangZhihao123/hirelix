import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { hirelix_agent_briefs } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getUserFromApiRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    content?: unknown;
    instruction?: unknown;
  } | null;
  const [existing] = await db
    .select()
    .from(hirelix_agent_briefs)
    .where(
      and(
        eq(hirelix_agent_briefs.id, id),
        eq(hirelix_agent_briefs.user_id, user.id),
      ),
    )
    .limit(1);
  if (!existing)
    return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  try {
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (typeof body?.instruction === "string" && body.instruction.trim()) {
      return NextResponse.json({ error:"Use your Personal Agent workspace to revise AI work.",workspaceUrl:"/app" },{ status:410 });
    }
    if (!content || content.length > 30000)
      return NextResponse.json(
        { error: "Brief must be 1–30,000 characters" },
        { status: 400 },
      );
    const [brief] = await db
      .update(hirelix_agent_briefs)
      .set({ content, updated_at: new Date() })
      .where(
        and(
          eq(hirelix_agent_briefs.id, id),
          eq(hirelix_agent_briefs.user_id, user.id),
        ),
      )
      .returning();
    return NextResponse.json({ brief });
  } catch {
    return NextResponse.json(
      { error: "Could not revise the brief" },
      { status: 500 },
    );
  }
}
