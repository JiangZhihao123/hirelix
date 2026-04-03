import { NextRequest, NextResponse } from "next/server";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import { findEmail } from "@/lib/hunter";
import { getUserFromApiRequest } from "@/lib/api-auth";
import {
  generateOpenRouterJson,
  getDefaultOpenRouterModel,
  getOpenRouterApiKey,
} from "@/lib/openrouter";
import { buildOutreachDraftJsonSchema } from "@/lib/openrouter-schemas";
import { enqueueGithubEnrichmentJob } from "@/lib/github-enrichment-jobs";
import {
  buildFallbackOutreachDraft,
  buildRecruiterOutreachEvidence,
} from "@/lib/recruiter-outreach";
import { supabaseAdmin } from "@/lib/supabase-server";

/**
 * POST /api/candidates/[id]/enrich
 *
 * On-demand: find email/contact details for a single candidate.
 * Draft generation normally happens in the main search pipeline; this route
 * only backfills a draft when one is unexpectedly missing.
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
    const user = await getUserFromApiRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const billing = await getBillingSummaryForUser(supabaseAdmin, user.id);

    // Get candidate + parent search
    const { data: candidate, error: candErr } = await supabaseAdmin
      .from("hirelix_candidates")
      .select("*, search:hirelix_searches(jd_text, parsed_requirements)")
      .eq("id", id)
      .single();

    if (candErr || !candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const needsContactLookup = !candidate.email;
    const needsDraftBackfill = !candidate.outreach_draft;
    if (needsContactLookup && billing.usage.enrichesRemaining <= 0) {
      return NextResponse.json(
        {
          error:
            billing.plan.code === "free"
              ? "Free accounts do not include email enrichment. Upgrade to Pro to unlock 25 contact enriches each month."
              : "You have reached this month's contact enrich limit. Add a Contact Pack or wait for your next billing cycle.",
        },
        { status: 403 },
      );
    }

    // Get company profile from user settings
    let companyProfile: Record<string, string> | null = null;
    if (user) {
      const { data: settings } = await supabaseAdmin
        .from("hirelix_user_settings")
        .select("company_profile")
        .eq("user_id", user.id)
        .single();
      if (settings?.company_profile && typeof settings.company_profile === "object") {
        companyProfile = settings.company_profile as Record<string, string>;
      }
    }

    const apolloApiKey = process.env.APOLLO_API_KEY || null;
    const hunterApiKey = process.env.HUNTER_API_KEY || null;
    let openRouterConfigured = true;
    try {
      getOpenRouterApiKey();
    } catch {
      openRouterConfigured = false;
    }

    const updates: Record<string, unknown> = {};
    const parsedRequirements =
      candidate.search?.parsed_requirements && typeof candidate.search.parsed_requirements === "object"
        ? (candidate.search.parsed_requirements as Record<string, unknown>)
        : {};
    const hiringBrief =
      parsedRequirements.hiring_brief && typeof parsedRequirements.hiring_brief === "object"
        ? (parsedRequirements.hiring_brief as Record<string, unknown>)
        : {};
    const roleCore =
      hiringBrief.role_core && typeof hiringBrief.role_core === "object"
        ? (hiringBrief.role_core as Record<string, unknown>)
        : {};
    const requiredSkills = Array.isArray(roleCore.required_skills)
      ? roleCore.required_skills.filter((value): value is string => typeof value === "string")
      : Array.isArray(parsedRequirements.required_skills)
        ? parsedRequirements.required_skills.filter((value): value is string => typeof value === "string")
        : [];
    const currentMetadata =
      candidate.metadata && typeof candidate.metadata === "object"
        ? (candidate.metadata as Record<string, unknown>)
        : {};

    let effectiveMetadata = { ...currentMetadata };
    let effectiveGithubSignals =
      effectiveMetadata.github_signals && typeof effectiveMetadata.github_signals === "object"
        ? (effectiveMetadata.github_signals as Record<string, unknown>)
        : null;
    const effectiveGithubUrl = typeof candidate.github_url === "string" ? candidate.github_url : null;

    const githubStatus = typeof effectiveGithubSignals?.status === "string"
      ? effectiveGithubSignals.status
      : null;
    if (!effectiveGithubSignals || githubStatus !== "verified") {
      const queuedGithub = await enqueueGithubEnrichmentJob({
        candidateId: candidate.id,
        searchId: candidate.search_id,
        userId: user.id,
      });
      effectiveMetadata =
        queuedGithub.metadata && typeof queuedGithub.metadata === "object"
          ? (queuedGithub.metadata as Record<string, unknown>)
          : effectiveMetadata;
      effectiveGithubSignals =
        effectiveMetadata.github_signals && typeof effectiveMetadata.github_signals === "object"
          ? (effectiveMetadata.github_signals as Record<string, unknown>)
          : effectiveGithubSignals;
      updates.metadata = effectiveMetadata;
    }

    // ── Step 1: Find email (if not already found) ──
    if (needsContactLookup && (apolloApiKey || hunterApiKey)) {
      const nameParts = (candidate.name || "").split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      if (firstName && candidate.profile_url) {
        try {
          const emailResult = await findEmail({
            apolloApiKey,
            hunterApiKey,
            firstName,
            lastName,
            linkedinUrl: candidate.profile_url,
            metadata: (candidate.metadata as Record<string, unknown>) || {},
            headline: candidate.headline,
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
    if (needsDraftBackfill && openRouterConfigured) {
      const model = getDefaultOpenRouterModel();
      const parsed = parsedRequirements;
      const roleTitle = parsed.title || "this role";
      const parsedRequiredSkills = Array.isArray(parsed.required_skills)
        ? parsed.required_skills.filter((value): value is string => typeof value === "string")
        : requiredSkills;
      const email = updates.email || candidate.email;
      const hasEmail = !!email;
      const firstName = (candidate.name || "").split(" ")[0];
      const evidence = buildRecruiterOutreachEvidence({
        name: candidate.name,
        headline: candidate.headline,
        location: candidate.location,
        skills: Array.isArray(candidate.skills) ? candidate.skills : [],
        matchReasons: Array.isArray(candidate.match_reasons) ? candidate.match_reasons : [],
        githubSignals: effectiveGithubSignals,
      });

      // Build company context section
      let companySection = "";
      if (companyProfile && companyProfile.name) {
        const parts: string[] = [];
        if (companyProfile.name) parts.push(`Company: ${companyProfile.name}`);
        if (companyProfile.industry) parts.push(`Industry: ${companyProfile.industry}`);
        if (companyProfile.size) parts.push(`Size: ${companyProfile.size}`);
        if (companyProfile.mission) parts.push(`Mission: ${companyProfile.mission}`);
        if (companyProfile.culture) parts.push(`Culture: ${companyProfile.culture}`);
        if (companyProfile.benefits) parts.push(`Benefits: ${companyProfile.benefits}`);
        if (companyProfile.tech_stack) parts.push(`Tech stack: ${companyProfile.tech_stack}`);
        if (companyProfile.selling_points) parts.push(`Why join: ${companyProfile.selling_points}`);
        companySection = `\n## Hiring Company\n${parts.join("\n")}\n`;
      }

      const prompt = `Write a highly personalized recruiting outreach for this candidate. The message must feel genuinely crafted for THIS specific person, referencing their actual background and connecting it to what the company offers.

## Job Description
Role: ${roleTitle}${parsed.company ? ` at ${parsed.company}` : ""}
${parsedRequiredSkills.length > 0 ? `Key skills: ${parsedRequiredSkills.join(", ")}` : ""}
${companySection}
## Candidate
Name: ${candidate.name}
Headline: ${candidate.headline || "Professional"}
Skills: ${(Array.isArray(candidate.skills) ? candidate.skills : []).slice(0, 6).join(", ")}
Experience: ${candidate.experience_years || "?"} years
Match reasons: ${(Array.isArray(candidate.match_reasons) ? candidate.match_reasons : []).slice(0, 3).join("; ")}
Location: ${candidate.location || "N/A"}
Evidence source: ${evidence.evidenceSourceLabel}
Evidence strength: ${evidence.evidenceStrength}
Recruiter summary: ${evidence.recruiterSummary}
Proof to reference: ${evidence.proofToReference}
Outreach angle: ${evidence.outreachAngle}

## Guidelines
- Reference something SPECIFIC from the candidate's background (a skill, company, or achievement)
- You must use the proof line above. Do not invent extra proof.
- If the evidence source is GitHub, use that concrete code/project/PR detail.
- If the evidence source is LinkedIn, use a concrete LinkedIn detail instead.
- If company info is provided, mention 1-2 compelling things about the company (mission, growth, tech stack, culture)
- Connect the candidate's experience to WHY they'd be excited about this opportunity
- Sound like a real person, not a template. No buzzwords.
- Be concise and direct.

## Return JSON with:
- subject: string (compelling subject line, under 10 words, personalized to THIS candidate)
- linkedin: string (LinkedIn InMail, under 80 words, casual, starts with "Hi ${firstName},")
${hasEmail ? `- email: string (email body, under 100 words, slightly more formal, starts with "Hi ${firstName},")` : ""}

      Return ONLY valid JSON, no markdown.`;

      try {
        const { data: draft } = await generateOpenRouterJson<{
          subject?: string;
          linkedin?: string;
          email?: string;
        }>({
          model,
          prompt,
          maxOutputTokens: 1000,
          temperature: 0,
          jsonSchema: buildOutreachDraftJsonSchema({
            includeEmail: hasEmail,
          }),
        });
        updates.outreach_draft = JSON.stringify(draft);
        console.log(`[enrich] Outreach generated for ${candidate.name}`);
      } catch (err) {
        console.log(`[enrich] Outreach generation failed: ${err instanceof Error ? err.message : String(err)}`);
        // Fallback
        updates.outreach_draft = JSON.stringify(
          buildFallbackOutreachDraft({
            firstName,
            roleTitle: String(roleTitle),
            evidence,
            hasEmail,
          }),
        );
      }
    }

    // ── Update DB ──
    if (Object.keys(updates).length > 0) {
      if (!candidate.enriched_at && needsContactLookup) {
        updates.enriched_at = new Date().toISOString();
      }
      await supabaseAdmin
        .from("hirelix_candidates")
        .update(updates)
        .eq("id", id);
    }

    if (!candidate.enriched_at && needsContactLookup) {
      await supabaseAdmin.from("hirelix_usage_events").insert({
        user_id: user.id,
        event_type: "candidate_enriched",
        related_id: candidate.id,
        metadata: {
          plan_code: billing.plan.code,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      email: updates.email || candidate.email || null,
      github_url: updates.github_url || effectiveGithubUrl || candidate.github_url || null,
      metadata: updates.metadata || effectiveMetadata,
      outreach_draft: updates.outreach_draft || candidate.outreach_draft || null,
    });
  } catch (err) {
    console.error("[enrich] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
