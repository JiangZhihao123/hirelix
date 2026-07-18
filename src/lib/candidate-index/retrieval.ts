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

export function buildProfileEligibilitySql(intent: HybridSearchIntent) {
  const countries = (intent.allowedCountries || []).map((item) => item.toUpperCase());
  const conditions = [sql`p.processing_status = 'ready'`];
  if (countries.length > 0) {
    conditions.push(sql`(p.country_code IN (${sql.join(countries.map((country) => sql`${country}`), sql`, `)}) OR p.country_code IS NULL)`);
  }
  if (intent.minimumYearsExperience != null) {
    conditions.push(sql`(p.years_experience >= ${intent.minimumYearsExperience} OR p.years_experience IS NULL)`);
  }
  if (intent.requiredDegree != null) {
    conditions.push(sql`(p.highest_degree = ${intent.requiredDegree} OR p.highest_degree IS NULL)`);
  }
  return sql.join(conditions, sql` AND `);
}

export async function countEligibleProfiles(intent: HybridSearchIntent) {
  const result = rows<{ count: number | string }>(await db.execute(sql`
    SELECT count(*) AS count
    FROM hirelix_profiles p
    WHERE ${buildProfileEligibilitySql(intent)}
  `));
  return Number(result[0]?.count || 0);
}

function rows<T>(result: unknown) {
  return result as T[];
}

function vectorLiteral(vector: number[]) {
  return JSON.stringify(vector);
}

export async function hybridRetrieve(intent: HybridSearchIntent, limit = 1000): Promise<HybridRetrievalItem[]> {
  const queryEmbedding = (await generateEmbeddings([intent.searchDocument])).embeddings[0];
  const eligibility = buildProfileEligibilitySql(intent);
  const configuredChannelLimit = Number.parseInt(process.env.SEARCH_RETRIEVAL_CHANNEL_LIMIT || "", 10);
  const channelLimit = Number.isFinite(configuredChannelLimit)
    ? Math.max(100, Math.min(2000, configuredChannelLimit))
    : 500;
  const experienceVectorOversample = Math.min(10_000, channelLimit * 5);
  const [profileFtsResult, experienceFtsResult, profileVectorResult, experienceVectorResult] = await Promise.all([
    db.execute(sql`
    SELECT p.id AS profile_id,
           ts_rank_cd(p.search_vector, websearch_to_tsquery('simple', ${intent.lexicalQuery})) AS score
    FROM hirelix_profiles p
    WHERE ${eligibility} AND p.search_vector @@ websearch_to_tsquery('simple', ${intent.lexicalQuery})
    ORDER BY score DESC, p.id
    LIMIT ${channelLimit}
  `),
    db.execute(sql`
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
    LIMIT ${channelLimit}
  `),
    db.execute(sql`
    SELECT p.id AS profile_id, p.embedding <=> ${vectorLiteral(queryEmbedding)}::vector AS score
    FROM hirelix_profiles p
    WHERE ${eligibility} AND p.embedding IS NOT NULL
    ORDER BY p.embedding <=> ${vectorLiteral(queryEmbedding)}::vector, p.id
    LIMIT ${channelLimit}
  `),
    db.execute(sql`
    WITH nearest_experiences AS MATERIALIZED (
      SELECT e.profile_id, e.id AS experience_id,
             e.embedding <=> ${vectorLiteral(queryEmbedding)}::vector AS score
      FROM hirelix_profile_experiences e
      WHERE e.embedding IS NOT NULL
      ORDER BY e.embedding <=> ${vectorLiteral(queryEmbedding)}::vector, e.id
      LIMIT ${experienceVectorOversample}
    ), ranked AS (
      SELECT p.id AS profile_id, nearest.experience_id, nearest.score,
             row_number() OVER (PARTITION BY p.id ORDER BY nearest.score, nearest.experience_id) AS profile_row
      FROM nearest_experiences nearest
      JOIN hirelix_profiles p ON p.id = nearest.profile_id
      WHERE ${eligibility}
    )
    SELECT profile_id, experience_id, score FROM ranked
    WHERE profile_row = 1
    ORDER BY score ASC, profile_id
    LIMIT ${channelLimit}
  `),
  ]);
  const profileFts = rows<RetrievalRow>(profileFtsResult);
  const experienceFts = rows<RetrievalRow>(experienceFtsResult);
  const profileVector = rows<RetrievalRow>(profileVectorResult);
  const experienceVector = rows<RetrievalRow>(experienceVectorResult);

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
