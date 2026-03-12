import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let result = fenced ? fenced[1].trim() : text.trim();
  if (result.startsWith("{") && !result.endsWith("}")) {
    const lastBrace = result.lastIndexOf("}");
    if (lastBrace > 0) result = result.substring(0, lastBrace + 1);
  }
  return result;
}

async function getUser(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const { data: { user } } = await supabaseUser.auth.getUser();
  return user;
}

/**
 * POST /api/settings/ai-company
 *
 * Uses Claude to research a company based on its website/name and return a structured profile.
 */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { website } = await req.json();
  if (!website || typeof website !== "string") {
    return NextResponse.json({ error: "Website is required" }, { status: 400 });
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

  if (!anthropicApiKey) {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  try {
    const anthropic = createAnthropic({
      apiKey: anthropicApiKey,
      ...(anthropicBaseUrl ? { baseURL: anthropicBaseUrl } : {}),
    });

    const prompt = `Based on your knowledge of the company "${website}", provide a detailed company profile for recruiting purposes. This will be used to write personalized outreach messages to potential candidates.

If you know this company, provide accurate information. If you're not sure, make reasonable inferences based on the domain/name, but mark uncertain fields as empty strings.

Return a JSON object with these fields:
- name: string (official company name)
- website: string (the website URL)
- industry: string (e.g. "Fintech", "SaaS", "E-commerce")
- size: string (e.g. "50-200 employees", "1000+")
- mission: string (1-2 sentences about what the company does and the problem they solve)
- culture: string (1-2 sentences about work culture, remote policy, team dynamics)
- benefits: string (comma-separated list of typical benefits/perks)
- tech_stack: string (comma-separated list of key technologies used)
- selling_points: string (2-3 sentences about why a top engineer would want to join - growth, funding, interesting problems, impact)

Return ONLY valid JSON, no markdown fences.`;

    const { text } = await generateText({
      model: anthropic(anthropicModel),
      prompt,
      maxOutputTokens: 1500,
    });

    const profile = JSON.parse(extractJSON(text));
    return NextResponse.json({ profile });
  } catch (err) {
    console.error("[ai-company] Error:", err);
    return NextResponse.json({ error: "AI research failed" }, { status: 500 });
  }
}
