import { sql } from "drizzle-orm";

import { db } from "@/db/client";
import { generateEmbeddings } from "@/lib/candidate-index/embedding";
import { reciprocalRankFusion, type FusedRetrieval, type RetrievalChannel } from "@/lib/candidate-index/ranking";

type RetrievalRow = { profile_id: string; experience_id?: string | null; score: number | string };

export type HybridRetrievalItem = FusedRetrieval & {
  evidence: {
    profileFtsScore?: number;
    experienceFts?: { experienceId: string | null; score: number };
    profileVectorDistance?: number;
    experienceVector?: { experienceId: string | null; distance: number };
  };
};

export type HybridSearchIntent = {
  searchDocument: string;
  lexicalQuery: string;
  allowedCountries?: string[];
  minimumYearsExperience?: number | null;
  requiredDegree?: string | null;
};

export async function countEligibleProfiles(intent: HybridSearchIntent) {
  const countries = (intent.allowedCountries || []).map((item) => item.toUpperCase());
  const result = rows<{ count: number | string }>(await db.execute(sql`
    SELECT count(*) AS count
    FROM hirelix_profiles p
    WHERE p.processing_status = 'ready'
      AND (${countries.length === 0} OR p.country_code = ANY(${countries}))
      AND (${intent.minimumYearsExperience == null} OR p.years_experience >= ${intent.minimumYearsExperience ?? 0})
      AND (${intent.requiredDegree == null} OR p.highest_degree = ${intent.requiredDegree})
  `));
  return Number(result[0]?.count || 0);
}

function rows<T>(result: unknown) {
  return result as T[];
}

function vectorLiteral(vector: number[]) {
  return JSON.stringify(vector);
}

export async function hybridRetrieve(intent: HybridSearchIntent, limit = 500): Promise<HybridRetrievalItem[]> {
  const queryEmbedding = (await generateEmbeddings([intent.searchDocument])).embeddings[0];
  const countries = (intent.allowedCountries || []).map((item) => item.toUpperCase());
  const eligibility = sql`
    p.processing_status = 'ready'
    AND (${countries.length === 0} OR p.country_code = ANY(${countries}))
    AND (${intent.minimumYearsExperience == null} OR p.years_experience >= ${intent.minimumYearsExperience ?? 0})
    AND (${intent.requiredDegree == null} OR p.highest_degree = ${intent.requiredDegree})
  `;
  const profileFts = rows<RetrievalRow>(await db.execute(sql`
    SELECT p.id AS profile_id,
           ts_rank_cd(p.search_vector, websearch_to_tsquery('simple', ${intent.lexicalQuery})) AS score
    FROM hirelix_profiles p
    WHERE ${eligibility} AND p.search_vector @@ websearch_to_tsquery('simple', ${intent.lexicalQuery})
    ORDER BY score DESC, p.id
    LIMIT 300
  `));
  const experienceFts = rows<RetrievalRow>(await db.execute(sql`
    WITH ranked AS (
      SELECT p.id AS profile_id, e.id AS experience_id,
             ts_rank_cd(e.search_vector, websearch_to_tsquery('simple', ${intent.lexicalQuery})) AS score,
             row_number() OVER (
               PARTITION BY p.id
               ORDER BY ts_rank_cd(e.search_vector, websearch_to_tsquery('simple', ${intent.lexicalQuery})) DESC, e.id
             ) AS profile_row
      FROM hirelix_profiles p
      JOIN hirelix_profile_experiences e ON e.profile_id = p.id
      WHERE ${eligibility} AND e.search_vector @@ websearch_to_tsquery('simple', ${intent.lexicalQuery})
    )
    SELECT profile_id, experience_id, score FROM ranked
    WHERE profile_row = 1
    ORDER BY score DESC, profile_id
    LIMIT 300
  `));
  const profileVector = rows<RetrievalRow>(await db.execute(sql`
    SELECT p.id AS profile_id, p.embedding <=> ${vectorLiteral(queryEmbedding)}::vector AS score
    FROM hirelix_profiles p
    WHERE ${eligibility} AND p.embedding IS NOT NULL
    ORDER BY p.embedding <=> ${vectorLiteral(queryEmbedding)}::vector, p.id
    LIMIT 300
  `));
  const experienceVector = rows<RetrievalRow>(await db.execute(sql`
    WITH ranked AS (
      SELECT p.id AS profile_id, e.id AS experience_id,
             e.embedding <=> ${vectorLiteral(queryEmbedding)}::vector AS score,
             row_number() OVER (
               PARTITION BY p.id
               ORDER BY e.embedding <=> ${vectorLiteral(queryEmbedding)}::vector, e.id
             ) AS profile_row
      FROM hirelix_profiles p
      JOIN hirelix_profile_experiences e ON e.profile_id = p.id
      WHERE ${eligibility} AND e.embedding IS NOT NULL
    )
    SELECT profile_id, experience_id, score FROM ranked
    WHERE profile_row = 1
    ORDER BY score ASC, profile_id
    LIMIT 300
  `));

  const channelRows: Record<RetrievalChannel, RetrievalRow[]> = {
    profile_fts: profileFts,
    experience_fts: [...experienceFts].sort((a, b) => Number(b.score) - Number(a.score)),
    profile_vector: profileVector,
    experience_vector: [...experienceVector].sort((a, b) => Number(a.score) - Number(b.score)),
  };
  const fused = reciprocalRankFusion(Object.fromEntries(
    Object.entries(channelRows).map(([channel, channelResult]) => [channel, channelResult.map((item) => item.profile_id)]),
  ), { k: 60, limit });
  const rowFor = (channel: RetrievalChannel, profileId: string) => channelRows[channel].find((item) => item.profile_id === profileId);
  return fused.map((item) => {
    const profileFtsRow = rowFor("profile_fts", item.profileId);
    const experienceFtsRow = rowFor("experience_fts", item.profileId);
    const profileVectorRow = rowFor("profile_vector", item.profileId);
    const experienceVectorRow = rowFor("experience_vector", item.profileId);
    return {
      ...item,
      evidence: {
        ...(profileFtsRow ? { profileFtsScore: Number(profileFtsRow.score) } : {}),
        ...(experienceFtsRow ? { experienceFts: { experienceId: experienceFtsRow.experience_id || null, score: Number(experienceFtsRow.score) } } : {}),
        ...(profileVectorRow ? { profileVectorDistance: Number(profileVectorRow.score) } : {}),
        ...(experienceVectorRow ? { experienceVector: { experienceId: experienceVectorRow.experience_id || null, distance: Number(experienceVectorRow.score) } } : {}),
      },
    };
  });
}
