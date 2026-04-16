import { collectCompanyEvidence, normalizeCompanyUrl } from "../src/lib/company-research";
import {
  COMPANY_PROFILE_FALLBACK_PROMPT,
  COMPANY_PROFILE_FROM_EVIDENCE_PROMPT,
} from "../src/lib/prompts";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let result = fenced ? fenced[1].trim() : text.trim();
  if (result.startsWith("{") && !result.endsWith("}")) {
    const lastBrace = result.lastIndexOf("}");
    if (lastBrace > 0) result = result.substring(0, lastBrace + 1);
  }
  return result;
}

function buildEvidencePrompt(evidence: {
  baseUrl: string;
  pages: Array<{
    url: string;
    title: string;
    metaDescription: string;
    headings: string[];
    bodyText: string;
  }>;
}) {
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

  return `${COMPANY_PROFILE_FROM_EVIDENCE_PROMPT}\n\nWebsite: ${evidence.baseUrl}\nTotal Pages: ${evidence.pages.length}\n\n${pages}`;
}

function buildFallbackPrompt(website: string) {
  return `${COMPANY_PROFILE_FALLBACK_PROMPT}\n\nCompany website/domain: ${website}`;
}

async function main() {
  const website = process.argv[2] || "https://www.tryglimpse.com/";
  const normalizedUrl = normalizeCompanyUrl(website);

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing");
  }

  const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const anthropic = createAnthropic({
    apiKey: anthropicApiKey,
    ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
  });

  const evidence = await collectCompanyEvidence(normalizedUrl);
  const mode = evidence ? "website_evidence" : "fallback_domain_inference";
  const prompt = evidence
    ? buildEvidencePrompt(evidence)
    : buildFallbackPrompt(normalizedUrl.toString());

  const { text } = await generateText({
    model: anthropic(anthropicModel),
    prompt,
    maxOutputTokens: 1800,
  });

  const parsed = JSON.parse(extractJSON(text));

  const output = {
    website: normalizedUrl.toString(),
    model: anthropicModel,
    mode,
    evidence_summary: evidence
      ? {
          page_count: evidence.pages.length,
          total_body_chars: evidence.totalBodyChars,
          pages: evidence.pages.map((page) => ({
            url: page.url,
            title: page.title,
            body_len: page.bodyText.length,
          })),
        }
      : null,
    result: parsed,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
