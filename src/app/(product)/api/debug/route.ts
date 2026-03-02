import { NextResponse } from "next/server";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export async function GET() {
  const env = {
    ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || "NOT SET",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "SET (length=" + process.env.ANTHROPIC_API_KEY.length + ")" : "NOT SET",
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "NOT SET",
    PDL_API_KEY: process.env.PDL_API_KEY ? "SET (length=" + process.env.PDL_API_KEY.length + ")" : "NOT SET",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "NOT SET",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "NOT SET",
  };

  let claudeTest = "not tested";
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
    claudeTest = `OK: "${text}"`;
  } catch (err) {
    claudeTest = `FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }

  return NextResponse.json({ env, claudeTest });
}
