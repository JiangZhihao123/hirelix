import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  hirelix_candidates,
  hirelix_searches,
  hirelix_usage_events,
  hirelix_user_settings,
} from "@/db/schema";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import { findEmail } from "@/lib/hunter";
import { getUserFromApiRequest } from "@/lib/api-auth";
import {
  generateLlmJson,
  getDefaultLlmModel,
  getLlmApiKey,
  resolveDeepSeekThinkingMode,
} from "@/lib/llm-client";
import { buildOutreachDraftJsonSchema } from "@/lib/llm-schemas";
import { enqueueGithubEnrichmentJob } from "@/lib/github-enrichment-jobs";
import {
  buildFallbackOutreachDraft,
  buildRecruiterOutreachEvidence,
} from "@/lib/recruiter-outreach";
import { sanitizeDisplayName } from "@/lib/display-name";

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
  const body = await req.json().catch(() => ({}));
  const regenerateOutreach =
    body && typeof body === "object" && (body as Record<string, unknown>).regenerate_outreach === true;

  try {
    const user = await getUserFromApiRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const billing = await getBillingSummaryForUser(user.id);

    // Get candidate + parent search
    const candidateRows = await db
      .select({
        id: hirelix_candidates.id,
        search_id: hirelix_candidates.search_id,
        name: hirelix_candidates.name,
        headline: hirelix_candidates.headline,
        location: hirelix_candidates.location,
        skills: hirelix_candidates.skills,
        experience_years: hirelix_candidates.experience_years,
        match_reasons: hirelix_candidates.match_reasons,
        match_score: hirelix_candidates.match_score,
        profile_url: hirelix_candidates.profile_url,
        github_url: hirelix_candidates.github_url,
        email: hirelix_candidates.email,
        outreach_draft: hirelix_candidates.outreach_draft,
        metadata: hirelix_candidates.metadata,
        enriched_at: hirelix_candidates.enriched_at,
        searchJdText: hirelix_searches.jd_text,
        searchParsedRequirements: hirelix_searches.parsed_requirements,
      })
      .from(hirelix_candidates)
      .leftJoin(hirelix_searches, eq(hirelix_searches.id, hirelix_candidates.search_id))
      .where(eq(hirelix_candidates.id, id))
      .limit(1);

    const candidateRow = candidateRows[0];
    if (!candidateRow) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    // Build a candidate object compatible with the original Supabase shape
    // (which embedded `search` as a sub-object).
    const candidate: Record<string, unknown> & {
      id: string;
      name: string;
      search_id: string;
      headline: string | null;
      location: string | null;
      skills: string[] | null;
      experience_years: number | null;
      match_reasons: string[] | null;
      match_score: number | null;
      profile_url: string | null;
      github_url: string | null;
      email: string | null;
      outreach_draft: string | null;
      metadata: unknown;
      enriched_at: Date | null;
      search: { jd_text: string | null; parsed_requirements: unknown } | null;
    } = {
      id: candidateRow.id,
      name: candidateRow.name,
      search_id: candidateRow.search_id,
      headline: candidateRow.headline,
      location: candidateRow.location,
      skills: candidateRow.skills,
      experience_years: candidateRow.experience_years,
      match_reasons: candidateRow.match_reasons,
      match_score: candidateRow.match_score,
      profile_url: candidateRow.profile_url,
      github_url: candidateRow.github_url,
      email: candidateRow.email,
      outreach_draft: candidateRow.outreach_draft,
      metadata: candidateRow.metadata,
      enriched_at: candidateRow.enriched_at,
      search:
        candidateRow.searchJdText !== null && candidateRow.searchJdText !== undefined
          ? {
              jd_text: candidateRow.searchJdText,
              parsed_requirements: candidateRow.searchParsedRequirements,
            }
          : null,
    };

    const updates: Record<string, unknown> = {};
    const needsContactLookup = !candidate.email && !regenerateOutreach;
    const needsDraftBackfill = !candidate.outreach_draft || regenerateOutreach;
    const sanitizedCandidateName = sanitizeDisplayName(candidate.name);
    if (sanitizedCandidateName !== candidate.name) {
      updates.name = sanitizedCandidateName;
      candidate.name = sanitizedCandidateName;
    }
    if (needsContactLookup && billing.usage.enrichesRemaining <= 0) {
      return NextResponse.json(
        {
          error:
            billing.plan.code === "free"
              ? "You have used this month's free contact unlocks. Upgrade for more contact unlocks and outreach drafts."
              : "You have reached this month's contact unlock limit. Add a Contact Pack or wait for your next billing cycle.",
        },
        { status: 403 },
      );
    }

    // Get company profile from user settings
    let companyProfile: Record<string, string> | null = null;
    if (user) {
      const settingsRows = await db
        .select({ company_profile: hirelix_user_settings.company_profile })
        .from(hirelix_user_settings)
        .where(eq(hirelix_user_settings.user_id, user.id))
        .limit(1);
      const settings = settingsRows[0];
      if (settings?.company_profile && typeof settings.company_profile === "object") {
        companyProfile = settings.company_profile as Record<string, string>;
      }
    }

    const apolloApiKey = process.env.APOLLO_API_KEY || null;
    const hunterApiKey = process.env.HUNTER_API_KEY || null;
    let openRouterConfigured = true;
    try {
      getLlmApiKey();
    } catch {
      openRouterConfigured = false;
    }

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
      const nameParts = sanitizedCandidateName.split(" ");
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
            console.log(`[enrich] Email found for ${sanitizedCandidateName}: ${emailResult.email} (via ${emailResult.source})`);
          }
        } catch (err) {
          console.log(`[enrich] Email lookup failed for ${sanitizedCandidateName}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // ── Step 2: Generate outreach draft (if not already generated) ──
    if (needsDraftBackfill && openRouterConfigured) {
      const model = getDefaultLlmModel();
      const parsed = parsedRequirements;
      const roleTitle = parsed.title || "this role";
      const parsedRequiredSkills = Array.isArray(parsed.required_skills)
        ? parsed.required_skills.filter((value): value is string => typeof value === "string")
        : requiredSkills;
      const email = updates.email || candidate.email;
      const hasEmail = !!email;
      const firstName = sanitizedCandidateName.split(" ")[0];
      const evidence = buildRecruiterOutreachEvidence({
        name: sanitizedCandidateName,
        headline: candidate.headline,
        location: candidate.location,
        skills: Array.isArray(candidate.skills) ? candidate.skills : [],
        matchReasons: Array.isArray(candidate.match_reasons) ? candidate.match_reasons : [],
        githubSignals: effectiveGithubSignals,
        publicEvidence:
          effectiveMetadata.public_evidence && typeof effectiveMetadata.public_evidence === "object"
            ? effectiveMetadata.public_evidence
            : null,
        sellingKit:
          effectiveMetadata.selling_kit && typeof effectiveMetadata.selling_kit === "object"
            ? effectiveMetadata.selling_kit
            : null,
      });

      // Build company context section
      let companySection = "";
      if (companyProfile && companyProfile.name) {
        const parts: string[] = [];
        if (companyProfile.industry) parts.push(`Industry: ${companyProfile.industry}`);
        if (companyProfile.size) parts.push(`Size: ${companyProfile.size}`);
        if (companyProfile.mission) parts.push(`Mission: ${companyProfile.mission}`);
        if (companyProfile.culture) parts.push(`Culture: ${companyProfile.culture}`);
        if (companyProfile.benefits) parts.push(`Benefits: ${companyProfile.benefits}`);
        if (companyProfile.tech_stack) parts.push(`Tech stack: ${companyProfile.tech_stack}`);
        if (companyProfile.selling_points) parts.push(`Why join: ${companyProfile.selling_points}`);
        companySection = `\n## Confidential Hiring Company Context\n${parts.join("\n")}\n`;
      }

      const prompt = `Write a highly personalized recruiting outreach for this candidate. The message must feel genuinely crafted for THIS specific person, referencing their actual background and connecting it to what the company offers.

## Job Description
Role: ${roleTitle} for a confidential client
${parsedRequiredSkills.length > 0 ? `Key skills: ${parsedRequiredSkills.join(", ")}` : ""}
${companySection}
## Candidate
Name: ${sanitizedCandidateName}
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
- Never reveal or name the client company. Refer to the role as "one of my clients" or a confidential opportunity.
- You must use the proof line above. Do not invent extra proof.
- If the evidence source is GitHub, use that concrete code/project/PR detail.
- If the evidence source is Public Evidence, use only the proof line and approved public-evidence angle.
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
        const { data: draft } = await generateLlmJson<{
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
          deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_OUTREACH_THINKING", "disabled"),
        });
        updates.outreach_draft = JSON.stringify(draft);
        console.log(`[enrich] Outreach generated for ${sanitizedCandidateName}`);
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
        updates.enriched_at = new Date();
      }
      await db
        .update(hirelix_candidates)
        .set(updates)
        .where(eq(hirelix_candidates.id, id));
    }

    if (!candidate.enriched_at && needsContactLookup) {
      await db.insert(hirelix_usage_events).values({
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
