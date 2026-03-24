import { NextRequest, NextResponse } from "next/server";
import {
  collectCompanyEvidence,
  normalizeCompanyUrl,
  type CompanyEvidencePacket,
  type CompanyResearchMode,
} from "@/lib/company-research";
import {
  COMPANY_PROFILE_FALLBACK_PROMPT,
  COMPANY_PROFILE_FROM_EVIDENCE_PROMPT,
} from "@/lib/prompts";
import { getUserFromApiRequest } from "@/lib/api-auth";
import {
  generateOpenRouterJson,
  getDefaultOpenRouterModel,
  getOpenRouterApiKey,
} from "@/lib/openrouter";
import { AI_COMPANY_RESPONSE_JSON_SCHEMA } from "@/lib/openrouter-schemas";

type CompanyProfile = {
  name: string;
  website: string;
  industry: string;
  size: string;
  mission: string;
  culture: string;
  benefits: string;
  tech_stack: string;
  selling_points: string;
};

type AiCompanyResponse = {
  profile: CompanyProfile;
  confidence: "high" | "medium" | "low";
  used_sources: string[];
};

function sanitizeProfile(value: unknown, website: string): CompanyProfile {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const getField = (key: keyof CompanyProfile) =>
    typeof source[key] === "string" ? source[key].trim() : "";

  return {
    name: getField("name"),
    website: getField("website") || website,
    industry: getField("industry"),
    size: getField("size"),
    mission: getField("mission"),
    culture: getField("culture"),
    benefits: getField("benefits"),
    tech_stack: getField("tech_stack"),
    selling_points: getField("selling_points"),
  };
}

function sanitizeAiResponse(value: unknown, website: string): AiCompanyResponse {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const confidence =
    source.confidence === "high" || source.confidence === "medium" || source.confidence === "low"
      ? source.confidence
      : "low";
  const usedSources = Array.isArray(source.used_sources)
    ? source.used_sources.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return {
    profile: sanitizeProfile(source.profile, website),
    confidence,
    used_sources: usedSources,
  };
}

function buildEvidencePrompt(evidence: CompanyEvidencePacket) {
  const pages = evidence.pages
    .map((page, index) =>
      [
        `## Page ${index + 1}`,
        `URL: ${page.url}`,
        `Title: ${page.title || "N/A"}`,
        `Meta Description: ${page.metaDescription || "N/A"}`,
        `Headings: ${page.headings.join(" | ") || "N/A"}`,
        `Body Text: ${page.bodyText || "N/A"}`,
      ].join("\n"),
    )
    .join("\n\n");

  return `${COMPANY_PROFILE_FROM_EVIDENCE_PROMPT}

Website: ${evidence.baseUrl}
Total Pages: ${evidence.pages.length}

${pages}`;
}

function buildFallbackPrompt(website: string) {
  return `${COMPANY_PROFILE_FALLBACK_PROMPT}

Company website/domain: ${website}`;
}

async function generateCompanyProfileFromPrompt(
  model: string,
  prompt: string,
  website: string,
) {
  const { data } = await generateOpenRouterJson<AiCompanyResponse>({
    model,
    prompt,
    maxOutputTokens: 1800,
    temperature: 0,
    jsonSchema: AI_COMPANY_RESPONSE_JSON_SCHEMA,
  });
  return sanitizeAiResponse(data, website);
}

function logCompanyResearch(eventName: string, payload: Record<string, unknown>) {
  console.log(`[ai_company:${eventName}] ${JSON.stringify(payload)}`);
}

/**
 * POST /api/settings/ai-company
 *
 * Uses OpenRouter to research a company based on its website and return a structured profile.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromApiRequest(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { website } = await req.json();
  if (!website || typeof website !== "string") {
    return NextResponse.json({ error: "Website is required" }, { status: 400 });
  }

  try {
    getOpenRouterApiKey();
  } catch {
    return NextResponse.json({ error: "AI not configured" }, { status: 500 });
  }

  try {
    const normalizedUrl = normalizeCompanyUrl(website);
    const normalizedWebsite = normalizedUrl.toString();
    const model = process.env.AI_MODEL || getDefaultOpenRouterModel();
    logCompanyResearch("fetch_started", {
      user_id: user.id,
      website: normalizedWebsite,
    });

    const evidence = await collectCompanyEvidence(normalizedUrl);
    if (evidence) {
      logCompanyResearch("fetch_completed", {
        user_id: user.id,
        website: normalizedWebsite,
        page_count: evidence.pages.length,
        total_body_chars: evidence.totalBodyChars,
      });

      try {
        const result = await generateCompanyProfileFromPrompt(
          model,
          buildEvidencePrompt(evidence),
          normalizedWebsite,
        );
        const usedSources =
          result.used_sources.length > 0
            ? result.used_sources
            : evidence.pages.map((page) => page.url);
        logCompanyResearch("generate_completed", {
          user_id: user.id,
          website: normalizedWebsite,
          research_mode: "website_evidence",
          confidence: result.confidence,
          used_sources: usedSources,
        });
        return NextResponse.json({
          ...result,
          used_sources: usedSources,
          research_mode: "website_evidence" satisfies CompanyResearchMode,
        });
      } catch (error) {
        logCompanyResearch("fallback_used", {
          user_id: user.id,
          website: normalizedWebsite,
          reason: error instanceof Error ? error.message : "evidence_generation_failed",
        });
      }
    } else {
      logCompanyResearch("fallback_used", {
        user_id: user.id,
        website: normalizedWebsite,
        reason: "insufficient_website_evidence",
      });
    }

    const fallbackResult = await generateCompanyProfileFromPrompt(
      model,
      buildFallbackPrompt(normalizedWebsite),
      normalizedWebsite,
    );
    const fallbackSources =
      fallbackResult.used_sources.length > 0
        ? fallbackResult.used_sources
        : [normalizedWebsite];
    logCompanyResearch("generate_completed", {
      user_id: user.id,
      website: normalizedWebsite,
      research_mode: "fallback_domain_inference",
      confidence: fallbackResult.confidence,
      used_sources: fallbackSources,
    });
    return NextResponse.json({
      ...fallbackResult,
      used_sources: fallbackSources,
      research_mode: "fallback_domain_inference" satisfies CompanyResearchMode,
    });
  } catch (err) {
    console.error("[ai-company] Error:", err);
    return NextResponse.json(
      { error: "We couldn't read enough from the website. Try another URL or fill the profile manually." },
      { status: 500 },
    );
  }
}
