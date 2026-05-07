import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";

import type { GithubDiscoveryResult } from "./types";
import { extractCurrentCompanyFromHeadline, extractCurrentCompanyFromMetadata, normalizeText } from "./discovery";
import { GITHUB_IDENTITY_JUDGE_VERSION } from "./identity-judge";
import { db } from "@/db/client";
import { hirelix_github_identity_cache } from "@/db/schema";

function addDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
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
    const rows = await db
      .select({
        github_login: hirelix_github_identity_cache.github_login,
        github_url: hirelix_github_identity_cache.github_url,
        status: hirelix_github_identity_cache.status,
        discovery_source: hirelix_github_identity_cache.discovery_source,
        confidence: hirelix_github_identity_cache.confidence,
        evidence: hirelix_github_identity_cache.evidence,
      })
      .from(hirelix_github_identity_cache)
      .where(
        and(
          eq(hirelix_github_identity_cache.fingerprint, fingerprint),
          gt(hirelix_github_identity_cache.expires_at, new Date()),
        ),
      )
      .limit(1);

    const data = rows[0];
    if (!data) return null;

    // `confidence` comes back as `string | null` from numeric columns via postgres.js;
    // normalize to number for downstream consumers.
    const confidenceNum =
      data.confidence === null || data.confidence === undefined
        ? null
        : typeof data.confidence === "number"
          ? data.confidence
          : Number(data.confidence);

    const evidence =
      data.evidence && typeof data.evidence === "object"
        ? (data.evidence as GithubDiscoveryResult["evidence"])
        : undefined;
    const hasCurrentResolutionEvidence =
      evidence?.identity_resolution_version === GITHUB_IDENTITY_JUDGE_VERSION ||
      data.discovery_source === "explicit_url" ||
      data.discovery_source === "owned_website" ||
      (typeof confidenceNum === "number" && confidenceNum >= 0.78);
    if (!hasCurrentResolutionEvidence) return null;

    return {
      username: typeof data.github_login === "string" ? data.github_login : null,
      url: typeof data.github_url === "string" ? data.github_url : null,
      confidence: typeof confidenceNum === "number" ? confidenceNum : 0,
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
    const values = {
      fingerprint: input.fingerprint,
      linkedin_url: input.profileUrl || null,
      candidate_name: input.name,
      current_company: currentCompany || null,
      github_login: input.discovery.username,
      github_url: input.discovery.url,
      status: input.discovery.username && input.discovery.url ? "matched" : "missing",
      discovery_source: input.discovery.source,
      // numeric column accepts string | number; pass through as number
      confidence: input.discovery.confidence as unknown as string,
      evidence: {
        ...(input.discovery.evidence || {}),
        identity_resolution_version: GITHUB_IDENTITY_JUDGE_VERSION,
      },
      expires_at: addDays(90),
      updated_at: new Date(),
    };
    await db
      .insert(hirelix_github_identity_cache)
      .values(values)
      .onConflictDoUpdate({
        target: hirelix_github_identity_cache.fingerprint,
        set: {
          linkedin_url: values.linkedin_url,
          candidate_name: values.candidate_name,
          current_company: values.current_company,
          github_login: values.github_login,
          github_url: values.github_url,
          status: values.status,
          discovery_source: values.discovery_source,
          confidence: values.confidence,
          evidence: values.evidence,
          expires_at: values.expires_at,
          updated_at: values.updated_at,
        },
      });
  } catch {
    // Cache writes are best-effort; enrichment must not depend on migration timing.
  }
}
