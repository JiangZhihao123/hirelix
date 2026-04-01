import { NextRequest, NextResponse } from "next/server";
import { getUserFromApiRequest } from "@/lib/api-auth";
import {
  parseJobDescriptionToDraft,
  summarizeParsedJob,
} from "@/lib/jd-parse";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { jd_text } = await req.json();

    if (!jd_text || typeof jd_text !== "string" || jd_text.trim().length < 50) {
      return NextResponse.json(
        { error: "Job description is too short (min 50 chars)" },
        { status: 400 },
      );
    }

    const parsed = await parseJobDescriptionToDraft(jd_text.trim());

    const recallSpec = parsed.recall_spec as Record<string, unknown> | undefined;
    const parsedAny = parsed as Record<string, unknown>;
    return NextResponse.json({
      parsed_requirements: parsed,
      summary: summarizeParsedJob(parsed),
      _debug: {
        recall_strategy: recallSpec?.recall_strategy,
        target_companies_count: Array.isArray(recallSpec?.target_companies) ? (recallSpec.target_companies as unknown[]).length : -1,
        lateral_count: Array.isArray(recallSpec?.lateral_title_variants) ? (recallSpec.lateral_title_variants as unknown[]).length : -1,
        second_call: parsedAny._secondCallDebug,
      },
    });
  } catch (error) {
    console.error("[search/parse] Error:", error);
    return NextResponse.json(
      { error: "Failed to parse job description" },
      { status: 500 },
    );
  }
}
