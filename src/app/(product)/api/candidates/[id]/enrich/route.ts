import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import {
  hirelix_candidates,
  hirelix_searches,
  hirelix_user_settings,
} from "@/db/schema";
import { getBillingSummaryForUser } from "@/lib/billing-server";
import { getUserFromApiRequest } from "@/lib/api-auth";
import {
  generateLlmJson,
  getDefaultLlmModel,
  getLlmApiKey,
  resolveDeepSeekThinkingMode,
} from "@/lib/llm-client";
import { buildOutreachDraftJsonSchema } from "@/lib/llm-schemas";
import { enqueuePublicEvidenceJobForCandidate } from "@/lib/public-evidence-jobs";
import { buildRecruiterOutreachEvidence } from "@/lib/recruiter-outreach";
import { sanitizeDisplayName } from "@/lib/display-name";
import { getLogger, errorLogFields } from "@/lib/logger";
import { PUBLIC_CANDIDATE_ENRICH_ERROR_MESSAGE } from "@/lib/public-errors";

const routeLogger = getLogger({ component: "api_candidate_enrich" });

/**
 * POST /api/candidates/[id]/enrich
 *
 * Explicit on-demand actions only: queue candidate research or regenerate a
 * LinkedIn outreach draft. Email lookup is intentionally outside this flow.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const regenerateOutreach =
    body && typeof body === "object" && (body as Record<string, unknown>).regenerate_outreach === true;
  const requestPublicEvidence =
    body && typeof body === "object" && (body as Record<string, unknown>).public_evidence === true;

  try {
    const user = await getUserFromApiRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!regenerateOutreach && !requestPublicEvidence) {
      return NextResponse.json(
        { error: "Specify public_evidence or regenerate_outreach." },
        { status: 400 },
      );
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
    const needsDraftBackfill = regenerateOutreach;
    const sanitizedCandidateName = sanitizeDisplayName(candidate.name);
    if (sanitizedCandidateName !== candidate.name) {
      updates.name = sanitizedCandidateName;
      candidate.name = sanitizedCandidateName;
    }
    if (requestPublicEvidence) {
      if (
        billing.plan.code === "free" ||
        billing.usage.publicEvidenceDeepDivesRemaining <= 0
      ) {
        return NextResponse.json(
          {
            error:
              billing.plan.code === "free"
                ? "Start a subscription to unlock candidate research."
                : "You have reached this month's candidate research limit. Your next cycle will reset automatically.",
          },
          { status: 403 },
        );
      }

      const result = await enqueuePublicEvidenceJobForCandidate({
        candidateId: candidate.id,
        searchId: candidate.search_id,
        userId: user.id,
      });
      return NextResponse.json({
        ok: true,
        public_evidence_queued: result.queued,
        metadata: result.metadata || candidate.metadata || null,
      });
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

    const effectiveMetadata = { ...currentMetadata };
    const effectiveGithubSignals =
      effectiveMetadata.github_signals && typeof effectiveMetadata.github_signals === "object"
        ? (effectiveMetadata.github_signals as Record<string, unknown>)
        : null;
    const effectiveGithubUrl = typeof candidate.github_url === "string" ? candidate.github_url : null;

    // Generate or refresh the LinkedIn outreach draft from the current evidence.
    if (needsDraftBackfill && openRouterConfigured) {
      const model = getDefaultLlmModel();
      const parsed = parsedRequirements;
      const roleTitle = parsed.title || "this role";
      const parsedRequiredSkills = Array.isArray(parsed.required_skills)
        ? parsed.required_skills.filter((value): value is string => typeof value === "string")
        : requiredSkills;
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
Research basis: ${evidence.evidenceSourceLabel}
Evidence strength: ${evidence.evidenceStrength}
Recruiter summary: ${evidence.recruiterSummary}
Proof to reference: ${evidence.proofToReference}
Outreach angle: ${evidence.outreachAngle}

## Guidelines
- Reference something SPECIFIC from the candidate's background (a skill, company, or achievement)
- Never reveal or name the client company. Refer to the role as "one of my clients" or a confidential opportunity.
- You must use the proof line above. Do not invent extra proof.
- If the evidence source is GitHub, use that concrete code/project/PR detail.
- If the research basis is Candidate Research, use only the proof line and approved research angle.
- If the evidence source is LinkedIn, use a concrete LinkedIn detail instead.
- If company info is provided, mention 1-2 compelling things about the company (mission, growth, tech stack, culture)
- Connect the candidate's experience to WHY they'd be excited about this opportunity
- Sound like a real person, not a template. No buzzwords.
- Be concise and direct.

## Return JSON with:
- subject: string (compelling subject line, under 10 words, personalized to THIS candidate)
- linkedin: string (LinkedIn InMail, under 80 words, casual, starts with "Hi ${firstName},")

      Return ONLY valid JSON, no markdown.`;

      const { data: draft } = await generateLlmJson<{
        subject?: string;
        linkedin?: string;
      }>({
        model,
        prompt,
        maxOutputTokens: 1000,
        temperature: 0,
        jsonSchema: buildOutreachDraftJsonSchema({ includeEmail: false }),
        deepSeekThinking: resolveDeepSeekThinkingMode("SEARCH_OUTREACH_THINKING", "disabled"),
      });
      const subject = typeof draft.subject === "string" && draft.subject.trim().length > 0
        ? draft.subject.trim()
        : null;
      const linkedin = typeof draft.linkedin === "string" && draft.linkedin.trim().length > 0
        ? draft.linkedin.trim()
        : null;
      if (!subject || !linkedin) {
        throw new Error(`Outreach generation returned incomplete content for ${sanitizedCandidateName}`);
      }
      updates.outreach_draft = JSON.stringify({
        subject,
        linkedin,
      });
      routeLogger.info(
        {
          candidate_id: candidate.id,
          search_id: candidate.search_id,
          user_id: user.id,
        },
        "Candidate outreach generated",
      );
    }

    // ── Update DB ──
    if (Object.keys(updates).length > 0) {
      await db
        .update(hirelix_candidates)
        .set(updates)
        .where(eq(hirelix_candidates.id, id));
    }

    return NextResponse.json({
      ok: true,
      github_url: updates.github_url || effectiveGithubUrl || candidate.github_url || null,
      metadata: updates.metadata || effectiveMetadata,
      outreach_draft: updates.outreach_draft || candidate.outreach_draft || null,
    });
  } catch (err) {
    routeLogger.error(
      {
        candidate_id: id,
        ...errorLogFields(err),
      },
      "Candidate enrich failed",
    );
    return NextResponse.json({ error: PUBLIC_CANDIDATE_ENRICH_ERROR_MESSAGE }, { status: 500 });
  }
}
