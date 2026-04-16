import type {
  ContributionDay,
  RepositoryContributionSummary,
  MergedPrSignal,
  RecentCommitSample,
  GithubLanguageSignal,
} from "./types";
import { githubFetch, githubGraphql } from "./api";
import { compactStringArray, round } from "./discovery";

const CONTRIBUTION_REPO_LIMIT = 8;
const RECENT_COMMIT_SAMPLE_LIMIT = 25;

function mergeLanguageWeights(entries: GithubLanguageSignal[]) {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.name, (totals.get(entry.name) || 0) + entry.weight);
  }
  return [...totals.entries()]
    .map(([name, weight]) => ({ name, weight: round(weight, 2) }))
    .sort((left, right) => right.weight - left.weight);
}

export { mergeLanguageWeights };

export async function fetchContributionSignals(username: string) {
  const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date().toISOString();

  const data = await githubGraphql<{
    user?: {
      contributionsCollection?: {
        contributionCalendar?: {
          weeks?: Array<{
            contributionDays?: Array<{
              contributionCount?: number;
              date?: string;
            }>;
          }>;
        };
        commitContributionsByRepository?: Array<{
          repository?: {
            nameWithOwner?: string;
            url?: string;
            owner?: { login?: string | null } | null;
            languages?: {
              edges?: Array<{
                size?: number;
                node?: { name?: string | null } | null;
              }>;
            } | null;
          } | null;
          contributions?: { totalCount?: number | null } | null;
        }>;
      };
    };
  }>(
    `query GitHubSignals($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
          commitContributionsByRepository(maxRepositories: ${CONTRIBUTION_REPO_LIMIT}) {
            repository {
              nameWithOwner
              url
              owner { login }
              languages(first: 5, orderBy: { field: SIZE, direction: DESC }) {
                edges {
                  size
                  node { name }
                }
              }
            }
            contributions(first: 1) {
              totalCount
            }
          }
        }
      }
    }`,
    { login: username, from, to },
  );

  const days: ContributionDay[] = [];
  for (const week of data.user?.contributionsCollection?.contributionCalendar?.weeks || []) {
    for (const day of week.contributionDays || []) {
      days.push({
        contributionCount: day.contributionCount || 0,
        date: day.date || "",
      });
    }
  }

  const repoSummaries: RepositoryContributionSummary[] = [];
  for (const item of data.user?.contributionsCollection?.commitContributionsByRepository || []) {
    const repository = item.repository;
    if (!repository?.nameWithOwner) continue;
    const contributionCount = item.contributions?.totalCount || 0;
    const languageWeights = (repository.languages?.edges || [])
      .map((edge) => ({
        name: edge.node?.name || "",
        weight: contributionCount * ((edge.size || 0) / Math.max(1, (repository.languages?.edges || []).reduce((sum, entry) => sum + (entry.size || 0), 0))),
      }))
      .filter((entry) => entry.name && entry.weight > 0);
    repoSummaries.push({
      nameWithOwner: repository.nameWithOwner,
      ownerLogin: repository.owner?.login || null,
      url: repository.url || null,
      languageWeights,
      contributionCount,
    });
  }

  return {
    days,
    repoSummaries,
  };
}

function repositoryNameFromApiUrl(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/\/repos\/([^/]+\/[^/]+)$/);
  return match?.[1] || null;
}

export async function fetchMergedPrSignals(username: string): Promise<MergedPrSignal> {
  const data = await githubFetch(`/search/issues?q=${encodeURIComponent(`type:pr is:merged author:${username} -user:${username} archived:false`)}&per_page=5`) as {
    total_count?: number;
    items?: Array<{
      title?: string | null;
      html_url?: string | null;
      repository_url?: string | null;
    }>;
  };
  return {
    count: data.total_count || 0,
    highlights: (data.items || []).map((item) => ({
      repo: repositoryNameFromApiUrl(item.repository_url),
      title: item.title || null,
      url: item.html_url || null,
    })),
  };
}

export async function fetchRecentCommitSamples(username: string, repoNames: string[]) {
  const samples: RecentCommitSample[] = [];

  const uniqueRepos = compactStringArray(repoNames, 5);
  for (const repo of uniqueRepos) {
    try {
      const commits = await githubFetch(`/repos/${repo}/commits?author=${encodeURIComponent(username)}&per_page=5`) as Array<{
        commit?: { message?: string | null };
      }>;
      for (const entry of commits || []) {
        const message = entry.commit?.message?.trim();
        if (!message) continue;
        samples.push({ repo, message });
        if (samples.length >= RECENT_COMMIT_SAMPLE_LIMIT) {
          return samples;
        }
      }
    } catch {
      // Continue on per-repo failure.
    }
  }

  return samples;
}

export function buildGithubHighlight(params: {
  username: string;
  activityTrend: string;
  topLanguages: string[];
  repoSummaries: RepositoryContributionSummary[];
  mergedPrSignals: MergedPrSignal;
}) {
  const topMergedPr = params.mergedPrSignals.highlights[0];
  if (topMergedPr?.repo && topMergedPr.title) {
    return `${params.username} has a merged PR in ${topMergedPr.repo} titled "${topMergedPr.title}", which is a concrete open-source collaboration signal.`;
  }
  const topRepo = params.repoSummaries[0];
  if (topRepo) {
    const language = topRepo.languageWeights[0]?.name || params.topLanguages[0] || "their main stack";
    return `${params.username} shows concrete public code work in ${topRepo.nameWithOwner}, with ${topRepo.contributionCount} tracked commit contributions concentrated in ${language}.`;
  }
  if (params.mergedPrSignals.count > 0) {
    return `${params.username} has ${params.mergedPrSignals.count} merged PRs into repositories they do not own, which is a strong collaboration signal.`;
  }
  if (params.topLanguages.length > 0) {
    return `${params.username} has recent public contribution activity in ${params.topLanguages.slice(0, 2).join(" and ")}.`;
  }
  return params.activityTrend;
}
