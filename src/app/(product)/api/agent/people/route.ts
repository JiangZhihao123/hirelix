import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  hirelix_agent_people,
  hirelix_candidates,
  hirelix_searches,
} from "@/db/schema";
import { getUserFromApiRequest } from "@/lib/api-auth";
import { getLogger, errorLogFields } from "@/lib/logger";

const logger = getLogger({ component: "api_agent_people" });

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanUrl(value: unknown) {
  const raw = cleanText(value, 1000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const people = await db
      .select()
      .from(hirelix_agent_people)
      .where(eq(hirelix_agent_people.user_id, user.id))
      .orderBy(desc(hirelix_agent_people.updated_at));
    return NextResponse.json({ people });
  } catch (error) {
    logger.error(
      { user_id: user.id, ...errorLogFields(error) },
      "Private people load failed",
    );
    return NextResponse.json(
      { error: "Could not load your talent memory" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    if (typeof body.candidate_id === "string") {
      const [source] = await db
        .select({
          candidate: hirelix_candidates,
          roleTitle: hirelix_searches.title,
          roleId: hirelix_searches.id,
        })
        .from(hirelix_candidates)
        .innerJoin(
          hirelix_searches,
          eq(hirelix_searches.id, hirelix_candidates.search_id),
        )
        .where(
          and(
            eq(hirelix_candidates.id, body.candidate_id),
            eq(hirelix_searches.user_id, user.id),
          ),
        )
        .limit(1);
      if (!source)
        return NextResponse.json(
          { error: "Candidate not found" },
          { status: 404 },
        );
      const candidate = source.candidate;
      const [person] = await db
        .insert(hirelix_agent_people)
        .values({
          user_id: user.id,
          source_candidate_id: candidate.id,
          source_search_id: source.roleId,
          name: candidate.name,
          headline: candidate.headline,
          location: candidate.location,
          skills: (candidate.skills ?? []).slice(0, 30),
          profile_url: cleanUrl(candidate.profile_url),
          note: cleanText(body.note, 5000),
          source_evidence: {
            kind: "search_candidate",
            role_title: source.roleTitle,
            qualification_evidence: candidate.qualification_evidence,
            match_reasons: candidate.match_reasons,
            captured_at: new Date().toISOString(),
          },
        })
        .onConflictDoNothing({
          target: [
            hirelix_agent_people.user_id,
            hirelix_agent_people.source_candidate_id,
          ],
        })
        .returning();
      if (person) return NextResponse.json({ person }, { status: 201 });
      const [existing] = await db
        .select()
        .from(hirelix_agent_people)
        .where(
          and(
            eq(hirelix_agent_people.user_id, user.id),
            eq(hirelix_agent_people.source_candidate_id, candidate.id),
          ),
        )
        .limit(1);
      return NextResponse.json({ person: existing, already_saved: true });
    }

    const name = cleanText(body.name, 200);
    if (!name)
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    const profileUrl = cleanUrl(body.profile_url);
    if (body.profile_url && !profileUrl)
      return NextResponse.json(
        { error: "Use a valid profile URL" },
        { status: 400 },
      );
    const [person] = await db
      .insert(hirelix_agent_people)
      .values({
        user_id: user.id,
        name,
        headline: cleanText(body.headline, 300) || null,
        location: cleanText(body.location, 200) || null,
        skills: Array.isArray(body.skills)
          ? body.skills
              .filter((item): item is string => typeof item === "string")
              .map((item) => item.trim().slice(0, 80))
              .filter(Boolean)
              .slice(0, 30)
          : [],
        profile_url: profileUrl,
        note: cleanText(body.note, 5000),
        source_evidence: {
          kind: "recruiter_entry",
          captured_at: new Date().toISOString(),
        },
      })
      .returning();
    return NextResponse.json({ person }, { status: 201 });
  } catch (error) {
    logger.error(
      { user_id: user.id, ...errorLogFields(error) },
      "Private person save failed",
    );
    return NextResponse.json(
      { error: "Could not save this person" },
      { status: 500 },
    );
  }
}
