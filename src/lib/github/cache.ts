import { createHash } from "node:crypto";
import type { GithubDiscoveryResult } from "./types";
import { extractCurrentCompanyFromHeadline, extractCurrentCompanyFromMetadata, normalizeText } from "./discovery";
import { GITHUB_IDENTITY_JUDGE_VERSION } from "./identity-judge";
import { supabaseAdmin } from "@/lib/supabase-server";

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function buildGithubIdentityFingerprint(input: {
  name: string;
  profileUrl?: string | null;
  headline?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const currentCompany =
    extractCurrentCompanyFromMetadata(input.metadata) ||
    extractCurrentCompanyFromHeadline(input.headline);
  return createHash("sha256")
    .update(JSON.stringify({
      name: normalizeText(input.name),
      profileUrl: normalizeText(input.profileUrl || ""),
      currentCompany: normalizeText(currentCompany || ""),
    }))
    .digest("hex");
}

export async function lookupGithubIdentityCache(fingerprint: string): Promise<GithubDiscoveryResult | null> {
  try {
    const { data } = await supabaseAdmin
      .from("hirelix_github_identity_cache")
      .select("github_login,github_url,status,discovery_source,confidence,evidence")
      .eq("fingerprint", fingerprint)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (!data) return null;
    const evidence =
      data.evidence && typeof data.evidence === "object"
        ? (data.evidence as GithubDiscoveryResult["evidence"])
        : undefined;
    const hasCurrentResolutionEvidence =
      evidence?.identity_resolution_version === GITHUB_IDENTITY_JUDGE_VERSION ||
      data.discovery_source === "explicit_url" ||
      data.discovery_source === "owned_website" ||
      (typeof data.confidence === "number" && data.confidence >= 0.78);
    if (!hasCurrentResolutionEvidence) return null;

    return {
      username: typeof data.github_login === "string" ? data.github_login : null,
      url: typeof data.github_url === "string" ? data.github_url : null,
      confidence: typeof data.confidence === "number" ? data.confidence : 0,
      source:
        data.discovery_source === "explicit_url" ||
        data.discovery_source === "owned_website" ||
        data.discovery_source === "external_search" ||
        data.discovery_source === "github_search" ||
        data.discovery_source === "serper_search"
          ? data.discovery_source
          : "none",
      notes: [`identity_cache:${data.status}`],
      evidence,
    };
  } catch {
    return null;
  }
}

export async function persistGithubIdentityCache(input: {
  fingerprint: string;
  name: string;
  profileUrl?: string | null;
  headline?: string | null;
  metadata?: Record<string, unknown> | null;
  discovery: GithubDiscoveryResult;
}) {
  try {
    const currentCompany =
      extractCurrentCompanyFromMetadata(input.metadata) ||
      extractCurrentCompanyFromHeadline(input.headline);
    await supabaseAdmin
      .from("hirelix_github_identity_cache")
      .upsert(
        {
          fingerprint: input.fingerprint,
          linkedin_url: input.profileUrl || null,
          candidate_name: input.name,
          current_company: currentCompany || null,
          github_login: input.discovery.username,
          github_url: input.discovery.url,
          status: input.discovery.username && input.discovery.url ? "matched" : "missing",
          discovery_source: input.discovery.source,
          confidence: input.discovery.confidence,
          evidence: {
            ...(input.discovery.evidence || {}),
            identity_resolution_version: GITHUB_IDENTITY_JUDGE_VERSION,
          },
          expires_at: addDays(90),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "fingerprint" },
      );
  } catch {
    // Cache writes are best-effort; enrichment must not depend on migration timing.
  }
}
