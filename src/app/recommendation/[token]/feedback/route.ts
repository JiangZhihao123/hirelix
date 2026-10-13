import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { saveRecommendationFeedback } from "@/lib/workspace/recommendation-feedback";
import { WorkspaceError } from "@/lib/workspace/database";
import { getLogger } from "@/lib/logger";

export async function POST(req: NextRequest, {params}: {params: Promise<{token: string}>}) {
  const reply = (body: unknown, status = 200) => NextResponse.json(body, {status, headers: {"Cache-Control": "no-store"}});
  if (req.headers.get("origin") !== req.nextUrl.origin || !req.headers.get("content-type")?.startsWith("application/json"))
    return reply({error: "Submit feedback from the recommendation page"}, 403);
  try {
    const text = await req.text();
    if (text.length > 16000) return reply({error: "Feedback is too long"}, 413);
    let input: unknown;
    try { input = JSON.parse(text); } catch { return reply({error: "Invalid feedback"}, 400); }
    return reply(await saveRecommendationFeedback((await params).token, input));
  } catch (error) {
    if (error instanceof ZodError) return reply({error: "Choose a candidate, enter your name and provide valid feedback"}, 400);
    if (error instanceof WorkspaceError) return reply({error: error.message}, error.status);
    getLogger({component: "recommendation_feedback"}).error({error_type: error instanceof Error ? error.name : "Unknown"}, "Feedback could not be saved");
    return reply({error: "Could not save feedback. Please try again."}, 500);
  }
}
