import { NextResponse } from "next/server";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { buildPDLQuery, searchPeople, pdlPersonToCandidate } from "@/lib/pdl";

export const maxDuration = 60;

export async function GET() {
  const results: Record<string, unknown> = {};

  // 1. Env check
  results.env = {
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || "NOT SET",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? `SET (len=${process.env.ANTHROPIC_API_KEY.length})` : "NOT SET",
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "NOT SET",
    PDL_API_KEY: process.env.PDL_API_KEY ? `SET (len=${process.env.PDL_API_KEY.length})` : "NOT SET",
  };

  // 2. Claude test
  try {
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
    });
    const { text } = await generateText({
      model: anthropic(process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514"),
      prompt: "Say OK",
      maxOutputTokens: 5,
    });
    results.claude = `OK: "${text}"`;
  } catch (err) {
    results.claude = `FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }

  // 3. PDL test
  try {
    const parsed = { title: "Frontend Engineer", required_skills: ["react", "typescript"], experience_years_min: 3, seniority: "Senior" };
    const pdlQuery = buildPDLQuery(parsed);
    results.pdlQuery = pdlQuery;
    const pdlResult = await searchPeople(process.env.PDL_API_KEY!, pdlQuery, 2);
    results.pdl = `OK: total=${pdlResult.total}, returned=${pdlResult.data.length}`;
    if (pdlResult.data[0]) {
      const c = pdlPersonToCandidate(pdlResult.data[0]);
      results.pdlSample = { name: c.name, headline: c.headline, skills: c.skills.slice(0, 5) };
    }
  } catch (err) {
    results.pdl = `FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json(results);
}
