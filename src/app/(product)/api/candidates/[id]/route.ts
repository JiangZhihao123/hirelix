import { NextRequest, NextResponse } from "next/server";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-server";

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

    if (!status || !["new", "contacted", "replied", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data: candidate, error: candidateError } = await supabaseAdmin
      .from("hirelix_candidates")
      .select("id, search:hirelix_searches(user_id)")
      .eq("id", id)
      .single();

    const ownerId =
      candidate && candidate.search && typeof candidate.search === "object"
        ? (candidate.search as { user_id?: string | null }).user_id ?? null
        : null;

    if (candidateError || !candidate || ownerId !== user.id) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const { error } = await supabaseAdmin
      .from("hirelix_candidates")
      .update({ status })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
