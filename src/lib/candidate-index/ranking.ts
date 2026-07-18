import { createHash } from "node:crypto";
import { conjugateGradient } from "fmin";

export type RetrievalChannel = "profile_fts" | "experience_fts" | "profile_vector" | "experience_vector";

export type FusedRetrieval = {
  profileId: string;
  score: number;
  rank: number;
  channelRanks: Partial<Record<RetrievalChannel, number>>;
  channelCount: number;
};

export function reciprocalRankFusion(
  channels: Partial<Record<RetrievalChannel, string[]>>,
  options: { k?: number; limit?: number } = {},
): FusedRetrieval[] {
  const k = options.k ?? 60;
  const byProfile = new Map<string, Omit<FusedRetrieval, "rank">>();

  for (const [channel, ids] of Object.entries(channels) as Array<[RetrievalChannel, string[] | undefined]>) {
    const seen = new Set<string>();
    for (const [index, profileId] of (ids || []).entries()) {
      if (seen.has(profileId)) continue;
      seen.add(profileId);
      const rank = index + 1;
      const current = byProfile.get(profileId) || {
        profileId,
        score: 0,
        channelRanks: {},
        channelCount: 0,
      };
      current.score += 1 / (k + rank);
      current.channelRanks[channel] = rank;
      current.channelCount += 1;
      byProfile.set(profileId, current);
    }
  }

  return [...byProfile.values()]
    .sort((left, right) =>
      right.score - left.score ||
      right.channelCount - left.channelCount ||
      left.profileId.localeCompare(right.profileId),
    )
    .slice(0, options.limit ?? 500)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export type ComparisonPair = {
  a: string;
  b: string;
  pairKey: string;
  orderSwap: boolean;
};

function stableUnit(seed: string) {
  return Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) / 0xffffffff;
}

export function buildConnectedComparisonPairs(
  candidateIds: string[],
  options: { comparisonsPerCandidate?: number; orderSwapRate?: number; seed?: string } = {},
): ComparisonPair[] {
  const ids = [...new Set(candidateIds)];
  if (ids.length < 2) return [];
  const target = Math.min(
    (ids.length * (ids.length - 1)) / 2,
    Math.max(ids.length - 1, Math.ceil(ids.length * (options.comparisonsPerCandidate ?? 5) / 2)),
  );
  const seed = options.seed || "hirelix";
  ids.sort((left, right) => stableUnit(`${seed}:${left}`) - stableUnit(`${seed}:${right}`));

  const pairs: ComparisonPair[] = [];
  const seen = new Set<string>();
  const add = (left: string, right: string) => {
    const [a, b] = left < right ? [left, right] : [right, left];
    const pairKey = `${a}:${b}`;
    if (seen.has(pairKey)) return;
    seen.add(pairKey);
    pairs.push({
      a,
      b,
      pairKey,
      orderSwap: stableUnit(`${seed}:swap:${pairKey}`) < (options.orderSwapRate ?? 0.15),
    });
  };

  for (let index = 1; index < ids.length; index += 1) add(ids[index - 1], ids[index]);
  for (let offset = 2; pairs.length < target && offset < ids.length; offset += 1) {
    for (let index = 0; index < ids.length && pairs.length < target; index += 1) {
      add(ids[index], ids[(index + offset) % ids.length]);
    }
  }
  return pairs;
}

export type ComparisonOutcome = {
  a: string;
  b: string;
  outcome: "a" | "b" | "tie";
};

export type StableCandidateToken = "candidate_1" | "candidate_2";

export function stableDecisionToPresentedOutcome(
  decision: StableCandidateToken | "tie",
  firstToken: StableCandidateToken,
): "a" | "b" | "tie" {
  if (decision === "tie") return "tie";
  return decision === firstToken ? "a" : "b";
}

export type DavidsonRank = {
  profileId: string;
  score: number;
  rank: number;
  rankLow: number;
  rankHigh: number;
};

function logSumExp(values: number[]) {
  const max = Math.max(...values);
  return max + Math.log(values.reduce((sum, value) => sum + Math.exp(value - max), 0));
}

function fitScores(candidateIds: string[], comparisons: ComparisonOutcome[], lambda: number) {
  const indexById = new Map(candidateIds.map((id, index) => [id, index]));
  const baseline = candidateIds.length - 1;
  const dimension = candidateIds.length;
  const objective = (parameters: number[], gradient: number[]) => {
    gradient.fill(0);
    const logTie = Math.max(-8, Math.min(8, parameters[dimension - 1]));
    let value = 0;
    for (const comparison of comparisons) {
      const aIndex = indexById.get(comparison.a);
      const bIndex = indexById.get(comparison.b);
      if (aIndex == null || bIndex == null || aIndex === bIndex) continue;
      const aScore = aIndex === baseline ? 0 : parameters[aIndex];
      const bScore = bIndex === baseline ? 0 : parameters[bIndex];
      const tieTerm = logTie + (aScore + bScore) / 2;
      const denominator = logSumExp([aScore, bScore, tieTerm]);
      const probabilities = [
        Math.exp(aScore - denominator),
        Math.exp(bScore - denominator),
        Math.exp(tieTerm - denominator),
      ];
      const targetA = comparison.outcome === "a" ? 1 : comparison.outcome === "tie" ? 0.5 : 0;
      const targetB = comparison.outcome === "b" ? 1 : comparison.outcome === "tie" ? 0.5 : 0;
      const targetTie = comparison.outcome === "tie" ? 1 : 0;
      value += denominator - (comparison.outcome === "a" ? aScore : comparison.outcome === "b" ? bScore : tieTerm);
      if (aIndex !== baseline) gradient[aIndex] += probabilities[0] + probabilities[2] / 2 - targetA;
      if (bIndex !== baseline) gradient[bIndex] += probabilities[1] + probabilities[2] / 2 - targetB;
      gradient[dimension - 1] += probabilities[2] - targetTie;
    }
    for (let index = 0; index < baseline; index += 1) {
      value += lambda * parameters[index] ** 2 / 2;
      gradient[index] += lambda * parameters[index];
    }
    return value;
  };
  const result = conjugateGradient(objective, Array(dimension).fill(0), { maxIterations: 400 });
  return candidateIds.map((_, index) => index === baseline ? 0 : result.x[index]);
}

function seededRandom(seed: string) {
  let state = Number.parseInt(createHash("sha256").update(seed).digest("hex").slice(0, 8), 16) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

function ranksForScores(scores: number[]) {
  const order = scores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score || a.index - b.index);
  const ranks = Array(scores.length).fill(0);
  order.forEach((item, index) => { ranks[item.index] = index + 1; });
  return ranks;
}

function percentile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)))] ?? 1;
}

export function fitDavidsonRanking(
  candidateIds: string[],
  comparisons: ComparisonOutcome[],
  options: { lambda?: number; bootstrapRounds?: number; seed?: string } = {},
): DavidsonRank[] {
  const ids = [...new Set(candidateIds)];
  if (ids.length === 0) return [];
  if (ids.length === 1) return [{ profileId: ids[0], score: 0, rank: 1, rankLow: 1, rankHigh: 1 }];
  const valid = comparisons.filter((item) => ids.includes(item.a) && ids.includes(item.b) && item.a !== item.b);
  if (valid.length === 0) throw new Error("Davidson ranking requires at least one valid comparison");
  const lambda = options.lambda ?? 0.1;
  const scores = fitScores(ids, valid, lambda);
  const ranks = ranksForScores(scores);
  const bootstrapRanks = ids.map(() => [] as number[]);
  const random = seededRandom(options.seed || "hirelix-davidson");
  for (let round = 0; round < (options.bootstrapRounds ?? 200); round += 1) {
    const sample = Array.from({ length: valid.length }, () => valid[Math.floor(random() * valid.length)]);
    const sampleRanks = ranksForScores(fitScores(ids, sample, lambda));
    sampleRanks.forEach((rank, index) => bootstrapRanks[index].push(rank));
  }
  return ids
    .map((profileId, index) => ({
      profileId,
      score: scores[index],
      rank: ranks[index],
      rankLow: percentile(bootstrapRanks[index], 0.05),
      rankHigh: percentile(bootstrapRanks[index], 0.95),
    }))
    .sort((left, right) => left.rank - right.rank);
}

export function areOrderSwapDecisionsConsistent(
  original: "a" | "b" | "tie",
  swapped: "a" | "b" | "tie",
) {
  if (original === "tie" || swapped === "tie") return original === swapped;
  return original !== swapped;
}
