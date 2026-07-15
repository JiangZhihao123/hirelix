import { and, eq, or } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_profile_experiences, hirelix_profiles } from "@/db/schema";
import type { BrightDataProfile } from "@/lib/brightdata";
import { generateEmbeddings } from "@/lib/candidate-index/embedding";
import { buildExperienceSearchDocument, normalizeBrightProfile } from "@/lib/candidate-index/profile";
import { buildProfileSearchDocument, generateProfileRepresentation } from "@/lib/candidate-index/representation";
import { runWithConcurrency } from "@/lib/search/concurrency";

export type IndexProfilesResult = {
  indexedProfileIds: string[];
  reused: number;
  rejected: Array<{ index: number; reason: string }>;
};

async function findExisting(linkedinId: string | null, linkedinUrl: string | null) {
  if (!linkedinId && !linkedinUrl) return null;
  const conditions = [
    linkedinId ? eq(hirelix_profiles.linkedin_id, linkedinId) : null,
    linkedinUrl ? eq(hirelix_profiles.linkedin_url, linkedinUrl) : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const rows = await db.select().from(hirelix_profiles).where(or(...conditions)).limit(1);
  return rows[0] || null;
}

async function indexOne(
  profile: BrightDataProfile,
  options: { snapshotId: string | null; searchId?: string; jobId?: string; userId?: string },
) {
  const normalized = normalizeBrightProfile(profile);
  const existing = await findExisting(normalized.linkedinId, normalized.linkedinUrl);
  if (
    existing?.raw_content_hash === normalized.rawContentHash &&
    existing.processing_status === "ready" &&
    existing.representation_version === 1
  ) {
    return { profileId: existing.id, reused: true };
  }

  const base = {
    linkedin_id: normalized.linkedinId,
    linkedin_url: normalized.linkedinUrl,
    name: normalized.name,
    current_title: normalized.currentTitle,
    current_company: normalized.currentCompany,
    years_experience: normalized.yearsExperience == null ? null : String(normalized.yearsExperience),
    country_code: normalized.countryCode,
    city: normalized.city,
    highest_degree: normalized.highestDegree,
    schools: normalized.schools,
    fields_of_study: normalized.fieldsOfStudy,
    raw_profile: normalized.rawProfile,
    raw_content_hash: normalized.rawContentHash,
    source_snapshot_id: options.snapshotId,
    representation_version: 1,
    processing_status: "representing",
    processing_error: null,
    updated_at: new Date(),
  };
  const profileRow = existing
    ? (await db.update(hirelix_profiles).set(base).where(eq(hirelix_profiles.id, existing.id)).returning())[0]
    : (await db.insert(hirelix_profiles).values(base).returning())[0];

  try {
    await db.delete(hirelix_profile_experiences).where(eq(hirelix_profile_experiences.profile_id, profileRow.id));
    const experienceRows = normalized.experiences.length > 0
      ? await db.insert(hirelix_profile_experiences).values(normalized.experiences.map((item) => ({
        profile_id: profileRow.id,
        source_ordinal: item.sourceOrdinal,
        title: item.title,
        company: item.company,
        start_date: item.startDate,
        end_date: item.endDate,
        is_current: item.isCurrent,
        location: item.location,
        description: item.description,
        search_document: buildExperienceSearchDocument(item),
      }))).returning()
      : [];

    const { representation, model } = await generateProfileRepresentation(normalized, options);
    const byRef = new Map(representation.experiences.map((item) => [item.experience_ref, item]));
    const experienceDocuments = normalized.experiences.map((item) => buildExperienceSearchDocument(item, byRef.get(item.ref)));
    const profileDocument = buildProfileSearchDocument(normalized, representation);
    const embeddingResult = await generateEmbeddings([profileDocument, ...experienceDocuments]);

    await db.update(hirelix_profiles).set({
      seniority: representation.seniority,
      role_families: representation.role_families,
      adjacent_roles: representation.adjacent_roles,
      skills: representation.skills,
      domains: representation.domains,
      capabilities: representation.capabilities,
      profile_summary: representation.summary,
      semantic_evidence: representation.evidence,
      search_document: profileDocument,
      embedding: embeddingResult.embeddings[0],
      representation_model: model,
      embedding_model: embeddingResult.model,
      processing_status: "ready",
      represented_at: new Date(),
      embedded_at: new Date(),
      updated_at: new Date(),
    }).where(eq(hirelix_profiles.id, profileRow.id));

    for (const [index, experienceRow] of experienceRows.entries()) {
      await db.update(hirelix_profile_experiences).set({
        search_document: experienceDocuments[index],
        embedding: embeddingResult.embeddings[index + 1],
        embedding_model: embeddingResult.model,
        embedded_at: new Date(),
        updated_at: new Date(),
      }).where(and(
        eq(hirelix_profile_experiences.id, experienceRow.id),
        eq(hirelix_profile_experiences.profile_id, profileRow.id),
      ));
    }
    return { profileId: profileRow.id, reused: false };
  } catch (error) {
    await db.update(hirelix_profiles).set({
      processing_status: "error",
      processing_error: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000),
      updated_at: new Date(),
    }).where(eq(hirelix_profiles.id, profileRow.id));
    throw error;
  }
}

export async function indexBrightProfiles(
  profiles: BrightDataProfile[],
  options: { snapshotId: string | null; searchId?: string; jobId?: string; userId?: string },
): Promise<IndexProfilesResult> {
  const result: IndexProfilesResult = { indexedProfileIds: [], reused: 0, rejected: [] };
  const concurrency = Math.max(1, Math.min(16, Number(process.env.SEARCH_PROFILE_INDEX_CONCURRENCY || 12)));
  const indexedRows = await runWithConcurrency(profiles.map((profile, index) => ({ profile, index })), concurrency, async ({ profile, index }) => {
    try {
      return { index, indexed: await indexOne(profile, options), error: null };
    } catch (error) {
      return { index, indexed: null, error };
    }
  });
  for (const row of indexedRows) {
    if (row.indexed) {
      const indexed = row.indexed;
      result.indexedProfileIds.push(indexed.profileId);
      if (indexed.reused) result.reused += 1;
    } else {
      result.rejected.push({ index: row.index, reason: row.error instanceof Error ? row.error.message : String(row.error) });
    }
  }
  return result;
}
