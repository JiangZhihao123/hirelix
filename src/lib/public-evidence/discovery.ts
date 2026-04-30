import { getSerperApiKey, serperGithubSearch } from "@/lib/github/api";
import { compactStringArray, extractCurrentCompanyFromHeadline, extractCurrentCompanyFromMetadata, normalizeText } from "@/lib/github/discovery";
import { classifyPublicEvidenceSearchResult, isLikelyUsefulPublicEvidenceUrl, normalizeEvidenceUrl } from "./sources";
import type { PublicEvidenceCandidateInput, PublicEvidenceSourceCandidate } from "./types";

function sourcePriority(sourceType: PublicEvidenceSourceCandidate["sourceType"]) {
  switch (sourceType) {
    case "github": return 18;
    case "official_project_credit": return 17;
    case "personal_site": return 16;
    case "paper": return 16;
    case "technical_blog": return 15;
    case "package_registry": return 14;
    case "company_engineering_blog": return 13;
    case "talk": return 11;
    case "stackoverflow": return 10;
    case "portfolio": return 9;
    default: return 6;
  }
}

export function buildPublicEvidenceQueries(input: PublicEvidenceCandidateInput) {
  const company =
    extractCurrentCompanyFromMetadata(input.metadata) ||
    extractCurrentCompanyFromHeadline(input.headline);
  const role = input.headline?.split(" at ")[0]?.trim() || "";
  const skills = compactStringArray(input.requiredSkills, 4);
  return compactStringArray(
    [
      company ? `"${input.name}" "${company}" engineer` : null,
      company ? `"${input.name}" "${company}" GitHub` : null,
      company ? `"${input.name}" "${company}" paper` : null,
      company ? `"${input.name}" "${company}" publication` : null,
      role ? `"${input.name}" "${role}" blog` : null,
      role ? `"${input.name}" "${role}" talk` : null,
      role ? `"${input.name}" "${role}" paper` : null,
      skills[0] ? `"${input.name}" "${skills[0]}" GitHub` : null,
      skills[0] ? `"${input.name}" "${skills[0]}" paper OR publication` : null,
      `"${input.name}" site:github.com`,
      `"${input.name}" site:medium.com`,
      `"${input.name}" site:npmjs.com`,
      `"${input.name}" site:pypi.org`,
      `"${input.name}" site:stackoverflow.com`,
      `"${input.name}" site:scholar.google.com`,
      `"${input.name}" site:semanticscholar.org`,
      `"${input.name}" site:arxiv.org`,
      `"${input.name}" site:openreview.net`,
      `"${input.name}" site:dblp.org`,
      `"${input.name}" site:ifaamas.org`,
      `"${input.name}" site:aclanthology.org`,
      `"${input.name}" site:proceedings.mlr.press`,
      `"${input.name}" site:neurips.cc`,
      `"${input.name}" filetype:pdf paper`,
    ],
    24,
  );
}

function rankEvidenceCandidate(params: {
  input: PublicEvidenceCandidateInput;
  sourceType: PublicEvidenceSourceCandidate["sourceType"];
  title: string | null;
  snippet: string | null;
  query: string;
  resultIndex: number;
}) {
  const combined = normalizeText(`${params.title || ""}\n${params.snippet || ""}`);
  let score = sourcePriority(params.sourceType) - params.resultIndex * 0.5;
  if (combined.includes(normalizeText(params.input.name))) score += 12;
  const company =
    extractCurrentCompanyFromMetadata(params.input.metadata) ||
    extractCurrentCompanyFromHeadline(params.input.headline);
  if (company && combined.includes(normalizeText(company))) score += 5;
  for (const skill of params.input.requiredSkills.slice(0, 6)) {
    if (combined.includes(normalizeText(skill))) score += 2;
  }
  if (params.sourceType === "paper" && /paper|publication|arxiv|scholar|semantic|dblp|openreview|acl|pmlr|neurips/i.test(params.query)) {
    score += 4;
  }
  if (/github|blog|portfolio|package|paper|publication|talk|speaker|engineer/i.test(params.query)) score += 1;
  return Math.round(score * 10) / 10;
}

export async function discoverPublicEvidenceSources(input: PublicEvidenceCandidateInput) {
  const apiKey = getSerperApiKey();
  if (!apiKey) return [];

  const seen = new Set<string>();
  const sources: PublicEvidenceSourceCandidate[] = [];
  for (const query of buildPublicEvidenceQueries(input)) {
    const results = await serperGithubSearch(apiKey, query).catch(() => []);
    for (const [index, result] of results.entries()) {
      if (!result.link) continue;
      const url = normalizeEvidenceUrl(result.link);
      if (!url || seen.has(url) || !isLikelyUsefulPublicEvidenceUrl(url)) continue;
      const sourceType = classifyPublicEvidenceSearchResult({
        url,
        title: result.title || null,
        snippet: result.snippet || null,
      });
      if (!sourceType) continue;
      seen.add(url);
      sources.push({
        url,
        title: result.title || null,
        snippet: result.snippet || null,
        sourceType,
        query,
        rankScore: rankEvidenceCandidate({
          input,
          sourceType,
          title: result.title || null,
          snippet: result.snippet || null,
          query,
          resultIndex: index,
        }),
      });
      if (sources.length >= 40) break;
    }
    if (sources.length >= 40) break;
  }

  return sources
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, 40);
}
