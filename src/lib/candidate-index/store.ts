import { and, eq, or } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_profile_experiences, hirelix_profiles } from "@/db/schema";
import type { BrightDataProfile } from "@/lib/brightdata";
import { generateEmbeddings } from "@/lib/candidate-index/embedding";
import {
  buildExperienceSearchDocument,
  normalizeBrightProfile,
  type NormalizedProfile,
} from "@/lib/candidate-index/profile";
import {
  generateProfileRepresentation,
  buildProfileSearchDocument,
  type ProfileRepresentation,
} from "@/lib/candidate-index/representation";
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

type ExistingProfile = Awaited<ReturnType<typeof findExisting>>;

type PreparedProfile = {
  index: number;
  normalized: NormalizedProfile;
  existing: ExistingProfile;
  representation: ProfileRepresentation;
  representationModel: string;
  profileDocument: string;
  experienceDocuments: string[];
};

function profileBase(
  prepared: PreparedProfile,
  snapshotId: string | null,
) {
  const { normalized } = prepared;
  return {
    linkedin_id: normalized.linkedinId,
    linkedin_url: normalized.linkedinUrl,
    name: normalized.name,
    current_title: normalized.currentTitle,
    current_company: normalized.currentCompany,
    years_experience: normalized.yearsExperience == null ? null : String(normalized.yearsExperience),
    country_code: normalized.countryCode,
    city: prepared.representation.location?.city || normalized.city,
    state_or_region: prepared.representation.location?.state_or_region || null,
    metro_area: prepared.representation.location?.metro_area || null,
    highest_degree: normalized.highestDegree,
    schools: normalized.schools,
    fields_of_study: normalized.fieldsOfStudy,
    raw_profile: normalized.rawProfile,
    raw_content_hash: normalized.rawContentHash,
    source_snapshot_id: snapshotId,
    representation_version: 3,
    processing_status: "representing",
    processing_error: null,
    updated_at: new Date(),
  };
}

async function persistPreparedProfile(
  prepared: PreparedProfile,
  options: { snapshotId: string | null },
  embeddingModel: string,
  profileEmbedding: number[],
  experienceEmbeddings: number[][],
) {
  const { normalized, representation } = prepared;
  const base = {
    ...profileBase(prepared, options.snapshotId),
  };
  return db.transaction(async (tx) => {
    const profileRow = prepared.existing
      ? (await tx.update(hirelix_profiles).set(base).where(eq(hirelix_profiles.id, prepared.existing.id)).returning())[0]
      : (await tx.insert(hirelix_profiles).values(base).returning())[0];
    if (!profileRow) throw new Error("Profile insert or update returned no row");
    const profileId = profileRow.id;
    await tx.delete(hirelix_profile_experiences).where(eq(hirelix_profile_experiences.profile_id, profileId));
    const experienceRows = normalized.experiences.length > 0
      ? await tx.insert(hirelix_profile_experiences).values(normalized.experiences.map((item) => ({
        profile_id: profileId,
        source_ordinal: item.sourceOrdinal,
        title: item.title,
        company: item.company,
        start_date: item.startDate,
        end_date: item.endDate,
        is_current: item.isCurrent,
        location: item.location,
        description: item.description,
        search_document: prepared.experienceDocuments[item.sourceOrdinal],
      }))).returning()
      : [];

    await tx.update(hirelix_profiles).set({
      seniority: representation.seniority,
      role_families: representation.role_families,
      adjacent_roles: representation.adjacent_roles,
      skills: representation.skills,
      domains: representation.domains,
      capabilities: representation.capabilities,
      profile_summary: representation.summary,
      semantic_evidence: representation.evidence,
      search_document: prepared.profileDocument,
      embedding: profileEmbedding,
      representation_model: prepared.representationModel,
      embedding_model: embeddingModel,
      processing_status: "embedding",
      represented_at: new Date(),
      embedded_at: new Date(),
      updated_at: new Date(),
    }).where(eq(hirelix_profiles.id, profileId));

    for (const [index, experienceRow] of experienceRows.entries()) {
      await tx.update(hirelix_profile_experiences).set({
        search_document: prepared.experienceDocuments[index],
        embedding: experienceEmbeddings[index],
        embedding_model: embeddingModel,
        embedded_at: new Date(),
        updated_at: new Date(),
      }).where(and(
        eq(hirelix_profile_experiences.id, experienceRow.id),
        eq(hirelix_profile_experiences.profile_id, profileId),
      ));
    }
    await tx.update(hirelix_profiles).set({ processing_status: "ready" }).where(eq(hirelix_profiles.id, profileId));
    return profileId;
  });
}

export async function indexBrightProfiles(
  profiles: BrightDataProfile[],
  options: { snapshotId: string | null; searchId?: string; jobId?: string; userId?: string },
): Promise<IndexProfilesResult> {
  const result: IndexProfilesResult = { indexedProfileIds: [], reused: 0, rejected: [] };
  const concurrency = Math.max(1, Math.min(32, Number(process.env.SEARCH_PROFILE_INDEX_CONCURRENCY || 24)));
  const preparedRows = await runWithConcurrency(profiles.map((profile, index) => ({ profile, index })), concurrency, async ({ profile, index }) => {
    try {
      const normalized = normalizeBrightProfile(profile);
      const existing = await findExisting(normalized.linkedinId, normalized.linkedinUrl);
      if (existing?.raw_content_hash === normalized.rawContentHash && existing.processing_status === "ready" && existing.representation_version === 3) {
        return { index, reusedProfileId: existing.id, prepared: null, error: null };
      }
      const { representation, model: representationModel } = await generateProfileRepresentation(normalized, options);
      const byRef = new Map(representation.experiences.map((item) => [item.experience_ref, item]));
      const experienceDocuments = normalized.experiences.map((item) =>
        buildExperienceSearchDocument(item, byRef.get(item.ref)),
      );
      return {
        index,
        reusedProfileId: null,
        prepared: {
          index,
          normalized,
          existing,
          representation,
          representationModel,
          profileDocument: buildProfileSearchDocument(normalized, representation),
          experienceDocuments,
        } satisfies PreparedProfile,
        error: null,
      };
    } catch (error) {
      return { index, reusedProfileId: null, prepared: null, error };
    }
  });
  const prepared = preparedRows.flatMap((row) => row.prepared ? [row.prepared] : []);
  for (const row of preparedRows) {
    if (row.reusedProfileId) {
      result.indexedProfileIds.push(row.reusedProfileId);
      result.reused += 1;
    } else if (row.error) {
      result.rejected.push({ index: row.index, reason: row.error instanceof Error ? row.error.message : String(row.error) });
    }
  }
  if (prepared.length === 0) return result;

  const documents = prepared.flatMap((item) => [item.profileDocument, ...item.experienceDocuments]);
  const embeddingResult = await generateEmbeddings(documents);
  let embeddingOffset = 0;
  const preparedWithVectors = prepared.map((item) => {
    const documentCount = 1 + item.experienceDocuments.length;
    const vectors = embeddingResult.embeddings.slice(embeddingOffset, embeddingOffset + documentCount);
    embeddingOffset += documentCount;
    return { item, vectors };
  });
  const persistedRows = await runWithConcurrency(preparedWithVectors, concurrency, async ({ item, vectors }) => {
    try {
      const profileId = await persistPreparedProfile(
        item,
        options,
        embeddingResult.model,
        vectors[0],
        vectors.slice(1),
      );
      return { index: item.index, profileId, error: null };
    } catch (error) {
      return { index: item.index, profileId: null, error };
    }
  });
  for (const row of persistedRows) {
    if (row.profileId) result.indexedProfileIds.push(row.profileId);
    else result.rejected.push({ index: row.index, reason: row.error instanceof Error ? row.error.message : String(row.error) });
  }
  return result;
}
