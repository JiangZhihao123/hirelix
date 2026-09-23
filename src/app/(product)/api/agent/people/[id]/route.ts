import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { hirelix_agent_people } from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getUserFromApiRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    note?: unknown;
  } | null;
  if (!body || typeof body.note !== "string")
    return NextResponse.json({ error: "Note is required" }, { status: 400 });
  try {
    const [person] = await db
      .update(hirelix_agent_people)
      .set({ note: body.note.trim().slice(0, 5000), updated_at: new Date() })
      .where(
        and(
          eq(hirelix_agent_people.id, id),
          eq(hirelix_agent_people.user_id, user.id),
        ),
      )
      .returning();
    return person
      ? NextResponse.json({ person })
      : NextResponse.json({ error: "Person not found" }, { status: 404 });
  } catch {
    return NextResponse.json(
      { error: "Could not save your note" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await getUserFromApiRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const [person] = await db
      .delete(hirelix_agent_people)
      .where(
        and(
          eq(hirelix_agent_people.id, id),
          eq(hirelix_agent_people.user_id, user.id),
        ),
      )
      .returning({ id: hirelix_agent_people.id });
    return person
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Person not found" }, { status: 404 });
  } catch {
    return NextResponse.json(
      { error: "Could not remove this person" },
      { status: 500 },
    );
  }
}
