import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { findEmail } from "@/lib/hunter";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Strip markdown code fences from Claude responses and fix truncated JSON */
function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let result = fenced ? fenced[1].trim() : text.trim();
  if (result.startsWith("{") && !result.endsWith("}")) {
    const lastBrace = result.lastIndexOf("}");
    if (lastBrace > 0) result = result.substring(0, lastBrace + 1);
  }
  return result;
}

/**
 * POST /api/candidates/[id]/enrich
 *
 * On-demand: find email + generate personalized outreach for a single candidate.
 * Called when user clicks "Contact" or "Get Email" on a candidate card.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get candidate + parent search
    const { data: candidate, error: candErr } = await supabaseAdmin
      .from("hirelix_candidates")
      .select("*, search:hirelix_searches(jd_text, parsed_requirements)")
      .eq("id", id)
      .single();

    if (candErr || !candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const apolloApiKey = process.env.APOLLO_API_KEY || null;
    const hunterApiKey = process.env.HUNTER_API_KEY || null;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const anthropicBaseUrl = process.env.ANTHROPIC_BASE_URL;
    const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

    const updates: Record<string, unknown> = {};

    // ── Step 1: Find email (if not already found) ──
    if (!candidate.email && (apolloApiKey || hunterApiKey)) {
      const nameParts = (candidate.name || "").split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";
      const company = candidate.headline?.match(/at\s+(.+)$/i)?.[1]?.trim() || "";

      if (firstName && candidate.profile_url) {
        try {
          const emailResult = await findEmail({
            apolloApiKey,
            hunterApiKey,
            firstName,
            lastName,
            company,
            linkedinUrl: candidate.profile_url,
          });
          if (emailResult.email) {
            updates.email = emailResult.email;
            console.log(`[enrich] Email found for ${candidate.name}: ${emailResult.email} (via ${emailResult.source})`);
          }
        } catch (err) {
          console.log(`[enrich] Email lookup failed for ${candidate.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // ── Step 2: Generate outreach draft (if not already generated) ──
    if (!candidate.outreach_draft && anthropicApiKey) {
      const anthropic = createAnthropic({
        apiKey: anthropicApiKey,
        ...(anthropicBaseUrl ? { baseURL: anthropicBaseUrl } : {}),
      });

      const parsed = candidate.search?.parsed_requirements || {};
      const roleTitle = parsed.title || "this role";
      const email = updates.email || candidate.email;
      const hasEmail = !!email;

      const prompt = `Write a personalized recruiting outreach for this candidate. Sound human, not templated.

## Role
${roleTitle}${parsed.company ? ` at ${parsed.company}` : ""}

## Candidate
Name: ${candidate.name}
Headline: ${candidate.headline || "Professional"}
Skills: ${(Array.isArray(candidate.skills) ? candidate.skills : []).slice(0, 6).join(", ")}
Experience: ${candidate.experience_years || "?"} years
Match reasons: ${(Array.isArray(candidate.match_reasons) ? candidate.match_reasons : []).slice(0, 3).join("; ")}
Location: ${candidate.location || "N/A"}

## Return JSON with:
- subject: string (compelling subject line, under 10 words)
- linkedin: string (LinkedIn InMail, under 80 words, casual, starts with "Hi ${(candidate.name || "").split(" ")[0]},")
${hasEmail ? `- email: string (email body, under 100 words, slightly more formal, starts with "Hi ${(candidate.name || "").split(" ")[0]},")` : ""}

Return ONLY valid JSON, no markdown.`;

      try {
        const { text } = await generateText({
          model: anthropic(anthropicModel),
          prompt,
          maxOutputTokens: 1000,
        });

        const draft = JSON.parse(extractJSON(text));
        updates.outreach_draft = JSON.stringify(draft);
        console.log(`[enrich] Outreach generated for ${candidate.name}`);
      } catch (err) {
        console.log(`[enrich] Outreach generation failed: ${err instanceof Error ? err.message : String(err)}`);
        // Fallback
        const firstName = (candidate.name || "").split(" ")[0];
        updates.outreach_draft = JSON.stringify({
          subject: `${roleTitle} opportunity`,
          linkedin: `Hi ${firstName}, I came across your profile and thought your background would be a great fit for our ${roleTitle} role. Would you be open to a quick chat?`,
          ...(hasEmail ? { email: `Hi ${firstName}, I came across your profile and thought your background would be a great fit for our ${roleTitle} role. Would you be open to a quick chat?\n\nBest regards` } : {}),
        });
      }
    }

    // ── Update DB ──
    if (Object.keys(updates).length > 0) {
      await supabaseAdmin
        .from("hirelix_candidates")
        .update(updates)
        .eq("id", id);
    }

    return NextResponse.json({
      ok: true,
      email: updates.email || candidate.email || null,
      outreach_draft: updates.outreach_draft || candidate.outreach_draft || null,
    });
  } catch (err) {
    console.error("[enrich] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
