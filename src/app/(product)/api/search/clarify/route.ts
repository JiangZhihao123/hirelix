import { NextRequest, NextResponse } from "next/server";
import { getUserFromApiRequest } from "@/lib/api-auth";
import {
  buildHeuristicJobDescriptionDraft,
  buildFallbackJobClarification,
  summarizeParsedJob,
} from "@/lib/jd-parse";
import {
  generateLlmJson,
  getLightweightLlmModel,
  resolveDeepSeekThinkingMode,
} from "@/lib/llm-client";

export const maxDuration = 60;
const DEFAULT_CLARIFY_TIMEOUT_MS = 12_000;

function getClarifyTimeoutMs() {
  const raw = process.env.SEARCH_CLARIFY_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return DEFAULT_CLARIFY_TIMEOUT_MS;
  }

  return Math.min(Math.max(parsed, 3_000), 30_000);
}

function buildClarifyPrompt(
  jdText: string,
  summary: {
    title: string;
    requiredSkills: string[];
    workModel: string;
    locationScope: string | null;
    experienceYearsMin: number | null;
  },
) {
  return `You are a smart recruiting assistant helping a headhunter set up a candidate sourcing run.

You've just analyzed a job description. Decide whether you need any clarification before starting the search.

Ask only if the answer would meaningfully change the search strategy. Don't ask about things clearly stated in the JD. Don't ask just to appear thorough. If you have everything you need, confirm briefly and say you're ready.

If you do have questions, ask at most 2, in a natural conversational tone — not a numbered list, not bullet points. Just talk.

## What I understood from the JD
- Role: ${summary.title}
- Required skills: ${summary.requiredSkills.join(", ") || "not specified"}
- Work model: ${summary.workModel}
- Location: ${summary.locationScope || "not specified"}
- Min experience: ${summary.experienceYearsMin != null ? `${summary.experienceYearsMin}+ years` : "not specified"}

## Original JD
${jdText.slice(0, 1200)}${jdText.length > 1200 ? "\n[truncated]" : ""}

Return JSON only: { "message": "string", "ready_to_launch": boolean }
The message is shown directly to the headhunter — keep it concise, direct, no markdown.`;
}

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

    const parsed = {
      ...buildHeuristicJobDescriptionDraft(jd_text.trim()),
      parse_origin: "clarify_preview",
    };
    const summary = summarizeParsedJob(parsed);

    const fallbackClarification = buildFallbackJobClarification(summary);
    let clarification = fallbackClarification;

    try {
      const { data } = await generateLlmJson<{
        message: string;
        ready_to_launch: boolean;
      }>({
        model: getLightweightLlmModel(),
        prompt: buildClarifyPrompt(jd_text.trim(), summary),
        maxOutputTokens: 160,
        temperature: 0.3,
        timeoutMs: getClarifyTimeoutMs(),
        deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_PARSE_THINKING", "disabled"),
      });

      clarification = {
        message:
          typeof data.message === "string" && data.message.trim().length > 0
            ? data.message.trim()
            : fallbackClarification.message,
        ready_to_launch:
          typeof data.ready_to_launch === "boolean"
            ? data.ready_to_launch
            : fallbackClarification.ready_to_launch,
      };
    } catch (error) {
      console.error(
        "[search/clarify] Falling back to heuristic clarification:",
        error,
      );
    }

    return NextResponse.json({
      parsed_requirements: parsed,
      summary,
      clarification: {
        message: clarification.message,
        ready_to_launch: clarification.ready_to_launch,
      },
    });
  } catch (error) {
    console.error("[search/clarify] Error:", error);
    return NextResponse.json(
      { error: "Failed to analyze job description" },
      { status: 500 },
    );
  }
}
