export type { GithubSignals, GithubEnrichmentResult } from "./types";
export {
  resetGithubApiRateLimitStateForTests,
} from "./api";
export {
  extractGitHubUrlsFromText,
  extractGithubOwnerCandidateFromUrl,
  compactStringArray,
  extractUsernameFromGithubUrl,
} from "./discovery";
export {
  classifyActivityTrendFromWeeks,
  evaluateCommitMessageQuality,
  computeGithubSignalScore,
  buildRecruiterFacingGithubReadout,
} from "./scoring";

import type {
  GithubCandidateInput,
  GithubEnrichmentResult,
  GithubSignals,
  RecentCommitSample,
} from "./types";
import {
  githubRequestTraceStorage,
  createGithubRequestTrace,
  logGithubTraceSummary,
  getGitHubToken,
  GithubRateLimitError,
} from "./api";
import {
  discoverGithubIdentity,
  extractCurrentCompanyFromMetadata,
  extractCurrentCompanyFromHeadline,
  extractUsernameFromGithubUrl,
  compactStringArray,
  round,
} from "./discovery";
import {
  fetchContributionSignals,
  fetchMergedPrSignals,
  fetchRecentCommitSamples,
  buildGithubHighlight,
  mergeLanguageWeights,
} from "./fetch";
import {
  classifyActivityTrendFromWeeks,
  evaluateCommitMessageQuality,
  computeGithubSignalScore,
  buildRecruiterFacingGithubReadout,
} from "./scoring";
import {
  buildGithubIdentityFingerprint,
  lookupGithubIdentityCache,
  persistGithubIdentityCache,
} from "./cache";
import {
  GITHUB_IDENTITY_JUDGE_VERSION,
  judgeGithubIdentityWithLlm,
} from "./identity-judge";

export function buildPendingGithubSignals(params: {
  status: "queued" | "running";
  candidateName: string;
  headline?: string | null;
  currentCompany?: string | null;
  requiredSkills?: string[];
  existingGithubUrl?: string | null;
  existingSignals?: Record<string, unknown> | null;
  queuedAt?: string;
}): GithubSignals {
  const timestamp = params.queuedAt || new Date().toISOString();
  const readout = buildRecruiterFacingGithubReadout({
    status: params.status,
    candidateName: params.candidateName,
    headline: params.headline,
    currentCompany: params.currentCompany,
    requiredSkills: params.requiredSkills || [],
    activityTrend: null,
    topLanguages: [],
    mergedPrCount: null,
    commitMessageQuality: {
      label: "unknown",
      detail: "No recent public commit messages available to sample.",
    },
    githubSignalScore: null,
    highlight: null,
    discoveryConfidence: 0,
  });

  return {
    status: params.status,
    profile_login:
      typeof params.existingSignals?.profile_login === "string"
        ? (params.existingSignals.profile_login as string)
        : extractUsernameFromGithubUrl(params.existingGithubUrl),
    profile_url:
      typeof params.existingSignals?.profile_url === "string"
        ? (params.existingSignals.profile_url as string)
        : params.existingGithubUrl || null,
    activity_trend: null,
    top_languages: [],
    merged_pr_count: null,
    commit_message_quality: null,
    highlight: null,
    discovery_confidence: 0,
    github_signal_score: null,
    evidence_strength: readout.evidenceStrength,
    recruiter_summary:
      params.status === "queued"
        ? "GitHub review has been queued. Current ranking stays based on LinkedIn evidence until the background check finishes."
        : "GitHub review is in progress. Current ranking stays based on LinkedIn evidence until the background check finishes.",
    outreach_angle: readout.outreachAngle,
    verification_risks: compactStringArray(
      [
        "GitHub evidence is still being verified in the background.",
        ...readout.verificationRisks,
      ],
      3,
    ),
    discovery_notes: [params.status === "queued" ? "github_review_queued" : "github_review_running"],
    evidence_summary: compactStringArray(
      [
        params.status === "queued"
          ? "GitHub review queued."
          : "GitHub review in progress.",
        readout.recruiterSummary,
      ],
      4,
    ),
    last_enriched_at: timestamp,
  };
}

export function repoSummariesFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const workHistory = Array.isArray(metadata?.work_history) ? metadata.work_history : [];
  return workHistory
    .map((entry) => (entry && typeof entry === "object" ? (entry as Record<string, unknown>).company : null))
    .filter((value): value is string => typeof value === "string" && value.includes("/"));
}

export async function enrichGithubSignalsForCandidate(
  input: GithubCandidateInput,
): Promise<GithubEnrichmentResult> {
  return githubRequestTraceStorage.run(createGithubRequestTrace(input.name), async () => {
    const timestamp = new Date().toISOString();
    const currentCompany =
      extractCurrentCompanyFromMetadata(input.metadata) ||
      extractCurrentCompanyFromHeadline(input.headline);

    if (!getGitHubToken()) {
      const readout = buildRecruiterFacingGithubReadout({
        status: "missing_public_data",
        candidateName: input.name,
        headline: input.headline,
        currentCompany,
        requiredSkills: input.requiredSkills || [],
        activityTrend: null,
        topLanguages: [],
        mergedPrCount: null,
        commitMessageQuality: {
          label: "unknown",
          detail: "No recent public commit messages available to sample.",
        },
        githubSignalScore: null,
        highlight: null,
        discoveryConfidence: 0,
      });
      logGithubTraceSummary({
        outcome: "missing_public_data",
        githubLogin: extractUsernameFromGithubUrl(input.githubUrl),
        error: "GITHUB_TOKEN is missing",
      });
      return {
        githubUrl: input.githubUrl || null,
        githubSignals: {
          status: "missing_public_data",
          profile_login: extractUsernameFromGithubUrl(input.githubUrl),
          profile_url: input.githubUrl || null,
          activity_trend: null,
          top_languages: [],
          merged_pr_count: null,
          commit_message_quality: null,
          highlight: null,
          discovery_confidence: 0,
          identity_evidence: undefined,
          github_signal_score: null,
          evidence_strength: readout.evidenceStrength,
          recruiter_summary: readout.recruiterSummary,
          outreach_angle: readout.outreachAngle,
          verification_risks: readout.verificationRisks,
          discovery_notes: ["github_token_missing"],
          evidence_summary: compactStringArray(
            [readout.recruiterSummary, "GitHub API token is not configured."],
            4,
          ),
          last_enriched_at: timestamp,
        },
        githubSignalScore: null,
        githubDiscoveryConfidence: 0,
      };
    }

    try {
      const identityFingerprint = buildGithubIdentityFingerprint({
        name: input.name,
        profileUrl: input.profileUrl,
        headline: input.headline,
        metadata: input.metadata,
      });
      const cachedDiscovery = await lookupGithubIdentityCache(identityFingerprint);
      let discovery = cachedDiscovery || await discoverGithubIdentity(input);
      if (!cachedDiscovery) {
        const llmVerdict = await judgeGithubIdentityWithLlm({
          candidate: input,
          discovery,
          searchId: input.searchId,
          jobId: input.jobId,
          userId: input.userId,
        });
        if (llmVerdict) {
          const llmNotes = llmVerdict.samePerson
            ? [
                "llm_identity_verified",
                `llm_identity_confidence:${llmVerdict.confidence}`,
                `llm_identity_risk:${llmVerdict.riskLevel}`,
                ...llmVerdict.matchedEvidence,
              ]
            : [
                "llm_identity_rejected",
                `llm_identity_confidence:${llmVerdict.confidence}`,
                `llm_identity_risk:${llmVerdict.riskLevel}`,
                ...llmVerdict.rejectionReasons,
              ];
          discovery = {
            ...discovery,
            confidence: llmVerdict.samePerson
              ? Math.max(discovery.confidence, llmVerdict.confidence, 0.82)
              : Math.min(discovery.confidence, llmVerdict.confidence),
            notes: compactStringArray(
              [
                ...discovery.notes,
                ...llmNotes,
                llmVerdict.summary,
              ],
              10,
            ),
            evidence: {
              ...(discovery.evidence || {}),
              llm_identity_judged: true,
              identity_resolution_version: GITHUB_IDENTITY_JUDGE_VERSION,
            },
          };
        }
        void persistGithubIdentityCache({
          fingerprint: identityFingerprint,
          name: input.name,
          profileUrl: input.profileUrl,
          headline: input.headline,
          metadata: input.metadata,
          discovery,
        });
      }
      const identityVerified =
        Boolean(discovery.username && discovery.url) &&
        (discovery.source === "explicit_url" ||
          discovery.source === "owned_website" ||
          discovery.confidence >= 0.78);
      if (!discovery.username || !discovery.url) {
        const missingStatus = discovery.confidence > 0 ? "ambiguous_match" : "missing_public_data";
        const readout = buildRecruiterFacingGithubReadout({
          status: missingStatus,
          candidateName: input.name,
          headline: input.headline,
          currentCompany,
          requiredSkills: input.requiredSkills || [],
          activityTrend: null,
          topLanguages: [],
          mergedPrCount: null,
          commitMessageQuality: {
            label: "unknown",
            detail: "No recent public commit messages available to sample.",
          },
          githubSignalScore: null,
          highlight: null,
          discoveryConfidence: round(discovery.confidence, 3),
          discoveryNotes: discovery.notes,
        });
        logGithubTraceSummary({
          outcome: missingStatus,
          discoverySource: discovery.source,
          error: discovery.notes.join("; "),
        });
        return {
          githubUrl: null,
          githubSignals: {
            status: missingStatus,
            profile_login: null,
            profile_url: null,
            activity_trend: null,
            top_languages: [],
            merged_pr_count: null,
            commit_message_quality: null,
            highlight: null,
          discovery_confidence: round(discovery.confidence, 3),
          identity_evidence: discovery.evidence,
          github_signal_score: null,
            evidence_strength: readout.evidenceStrength,
            recruiter_summary: readout.recruiterSummary,
            outreach_angle: readout.outreachAngle,
            verification_risks: readout.verificationRisks,
            discovery_notes: discovery.notes,
            evidence_summary: compactStringArray(
              [
                readout.recruiterSummary,
                ...discovery.notes,
              ],
              6,
            ),
            last_enriched_at: timestamp,
          },
          githubSignalScore: null,
          githubDiscoveryConfidence: round(discovery.confidence, 3),
        };
      }
      if (!identityVerified) {
        const readout = buildRecruiterFacingGithubReadout({
          status: "ambiguous_match",
          candidateName: input.name,
          headline: input.headline,
          currentCompany,
          requiredSkills: input.requiredSkills || [],
          activityTrend: null,
          topLanguages: [],
          mergedPrCount: null,
          commitMessageQuality: {
            label: "unknown",
            detail: "No recent public commit messages available to sample.",
          },
          githubSignalScore: null,
          highlight: null,
          discoveryConfidence: round(discovery.confidence, 3),
          discoveryNotes: discovery.notes,
        });
        logGithubTraceSummary({
          outcome: "ambiguous_match",
          discoverySource: discovery.source,
          githubLogin: discovery.username,
          error: discovery.notes.join("; "),
        });
        return {
          githubUrl: null,
          githubSignals: {
            status: "ambiguous_match",
            profile_login: discovery.username,
            profile_url: discovery.url,
            activity_trend: null,
            top_languages: [],
            merged_pr_count: null,
            commit_message_quality: null,
            highlight: null,
            discovery_confidence: round(discovery.confidence, 3),
            identity_evidence: discovery.evidence,
            github_signal_score: null,
            evidence_strength: readout.evidenceStrength,
            recruiter_summary: readout.recruiterSummary,
            outreach_angle: readout.outreachAngle,
            verification_risks: readout.verificationRisks,
            discovery_notes: discovery.notes,
            evidence_summary: compactStringArray(
              [
                readout.recruiterSummary,
                "Possible GitHub match was found but identity confidence stayed below the verified threshold.",
                ...discovery.notes,
              ],
              6,
            ),
            last_enriched_at: timestamp,
          },
          githubSignalScore: null,
          githubDiscoveryConfidence: round(discovery.confidence, 3),
        };
      }

      const metadataRepoNames = repoSummariesFromMetadata(input.metadata);
      const { days, repoSummaries } = await fetchContributionSignals(discovery.username);
      const mergedPrSignals = await fetchMergedPrSignals(discovery.username);

      const commitSamples = await fetchRecentCommitSamples(
        discovery.username,
        metadataRepoNames,
      ).catch(() => [] as RecentCommitSample[]);

      const repoBackfillSamples = commitSamples.length > 0
        ? commitSamples
        : await fetchRecentCommitSamples(
          discovery.username,
          repoSummaries.map((entry) => entry.nameWithOwner),
        );

      const activityTrend = classifyActivityTrendFromWeeks(days);
      const topLanguageWeights = mergeLanguageWeights(
        repoSummaries.flatMap((entry) => entry.languageWeights),
      ).slice(0, 5);
      const topLanguages = topLanguageWeights.map((entry) => entry.name);
      const commitMessageQuality = evaluateCommitMessageQuality(
        repoBackfillSamples.map((entry) => entry.message),
      );
      const githubSignalScore = computeGithubSignalScore({
        requiredSkills: input.requiredSkills || [],
        activityTrend,
        topLanguages,
        mergedPrCount: mergedPrSignals.count,
        commitMessageQuality,
      });
      const highlight = buildGithubHighlight({
        username: discovery.username,
        activityTrend,
        topLanguages,
        repoSummaries,
        mergedPrSignals,
      });
      const readout = buildRecruiterFacingGithubReadout({
        status: "verified",
        candidateName: input.name,
        headline: input.headline,
        currentCompany,
        requiredSkills: input.requiredSkills || [],
        activityTrend,
        topLanguages,
        mergedPrCount: mergedPrSignals.count,
        commitMessageQuality,
        githubSignalScore,
        highlight,
        discoveryConfidence: round(discovery.confidence, 3),
        discoveryNotes: discovery.notes,
      });
      logGithubTraceSummary({
        outcome: "verified",
        discoverySource: discovery.source,
        githubLogin: discovery.username,
      });

      return {
        githubUrl: discovery.url,
        githubSignals: {
          status: "verified",
          profile_login: discovery.username,
          profile_url: discovery.url,
          activity_trend: activityTrend,
          top_languages: topLanguages,
          top_language_weights: topLanguageWeights,
          merged_pr_count: mergedPrSignals.count,
          commit_message_quality: `${commitMessageQuality.label}: ${commitMessageQuality.detail}`,
          highlight,
         discovery_confidence: round(discovery.confidence, 3),
          identity_evidence: discovery.evidence,
          github_signal_score: githubSignalScore,
          evidence_strength: readout.evidenceStrength,
          recruiter_summary: readout.recruiterSummary,
          outreach_angle: readout.outreachAngle,
          verification_risks: readout.verificationRisks,
          discovery_notes: discovery.notes,
          evidence_summary: compactStringArray(
            [
              readout.recruiterSummary,
              highlight,
              activityTrend,
              mergedPrSignals.highlights[0]?.title
                ? `Merged PR proof: ${mergedPrSignals.highlights[0]?.title}${mergedPrSignals.highlights[0]?.repo ? ` in ${mergedPrSignals.highlights[0]?.repo}` : ""}`
                : mergedPrSignals.count > 0
                  ? `${mergedPrSignals.count} merged PRs into external repositories`
                  : null,
              commitMessageQuality.detail,
            ],
            6,
          ),
          last_enriched_at: timestamp,
        },
        githubSignalScore,
        githubDiscoveryConfidence: round(discovery.confidence, 3),
      };
    } catch (error) {
      const isRateLimited = error instanceof GithubRateLimitError;
      const rateLimitSummary = isRateLimited
        ? error.message
        : "GitHub enrichment hit an API error; verify manually before relying on code evidence.";
      const readout = buildRecruiterFacingGithubReadout({
        status: "api_error",
        candidateName: input.name,
        headline: input.headline,
        currentCompany,
        requiredSkills: input.requiredSkills || [],
        activityTrend: null,
        topLanguages: [],
        mergedPrCount: null,
        commitMessageQuality: {
          label: "unknown",
          detail: "No recent public commit messages available to sample.",
        },
        githubSignalScore: null,
        highlight: null,
        discoveryConfidence: 0,
      });
      logGithubTraceSummary({
        outcome: "api_error",
        githubLogin: extractUsernameFromGithubUrl(input.githubUrl),
        error: isRateLimited ? rateLimitSummary : (error instanceof Error ? error.message : String(error)),
      });
      return {
        githubUrl: input.githubUrl || null,
        githubSignals: {
          status: "api_error",
          profile_login: extractUsernameFromGithubUrl(input.githubUrl),
          profile_url: input.githubUrl || null,
          activity_trend: null,
          top_languages: [],
          merged_pr_count: null,
          commit_message_quality: null,
          highlight: null,
          discovery_confidence: 0,
          identity_evidence: undefined,
          github_signal_score: null,
          evidence_strength: readout.evidenceStrength,
          recruiter_summary: readout.recruiterSummary,
          outreach_angle: readout.outreachAngle,
          verification_risks: compactStringArray(
            [...readout.verificationRisks, rateLimitSummary],
            3,
          ),
          discovery_notes: [isRateLimited ? "api_rate_limited" : "api_error"],
          evidence_summary: compactStringArray(
            [readout.recruiterSummary, isRateLimited ? rateLimitSummary : (error instanceof Error ? error.message : String(error))],
            4,
          ),
          last_enriched_at: timestamp,
        },
        githubSignalScore: null,
        githubDiscoveryConfidence: 0,
      };
    }
  });
}

export function applyGithubSignalsToCandidateRow<TCandidate extends {
  match_score: number;
  match_reasons: string[];
  github_url: string | null;
  metadata: Record<string, unknown>;
}>(params: {
  candidate: TCandidate;
  enrichment: GithubEnrichmentResult;
}): TCandidate {
  const metadata = { ...(params.candidate.metadata || {}) };
  const baseOverallScore =
    typeof metadata.overall_score === "number"
      ? metadata.overall_score
      : params.candidate.match_score;
  const githubSignalScore = params.enrichment.githubSignalScore;
  const existingBreakdown =
    metadata.scoring_breakdown && typeof metadata.scoring_breakdown === "object"
      ? (metadata.scoring_breakdown as Record<string, unknown>)
      : metadata.suitability &&
          typeof metadata.suitability === "object" &&
          (metadata.suitability as Record<string, unknown>).scoring_breakdown &&
          typeof (metadata.suitability as Record<string, unknown>).scoring_breakdown === "object"
        ? ((metadata.suitability as Record<string, unknown>).scoring_breakdown as Record<string, unknown>)
        : {};
  const baseCapabilityScore =
    typeof existingBreakdown.capability_score === "number"
      ? existingBreakdown.capability_score
      : baseOverallScore;
  const technicalEvidenceScore =
    typeof githubSignalScore === "number"
      ? Math.round(baseCapabilityScore * 0.65 + githubSignalScore * 0.35)
      : baseCapabilityScore;
  const nextOverallScore =
    typeof githubSignalScore === "number"
      ? Math.round(baseOverallScore * 0.7 + githubSignalScore * 0.3)
      : baseOverallScore;

  metadata.github_signals = params.enrichment.githubSignals;
  metadata.github_signal_score = githubSignalScore;
  metadata.github_discovery_confidence = params.enrichment.githubDiscoveryConfidence;
  metadata.technical_evidence_score = technicalEvidenceScore;
  metadata.base_overall_score = baseOverallScore;
  metadata.overall_score = nextOverallScore;
  if (metadata.suitability && typeof metadata.suitability === "object") {
    const suitability = { ...(metadata.suitability as Record<string, unknown>) };
    suitability.overall_score = nextOverallScore;
    if (suitability.scoring_breakdown && typeof suitability.scoring_breakdown === "object") {
      suitability.scoring_breakdown = {
        ...(suitability.scoring_breakdown as Record<string, unknown>),
        capability_score: technicalEvidenceScore,
        overall_score: nextOverallScore,
      };
    }
    metadata.suitability = suitability;
  }
  if (metadata.scoring_breakdown && typeof metadata.scoring_breakdown === "object") {
    const scoringBreakdown = { ...(metadata.scoring_breakdown as Record<string, unknown>) };
    scoringBreakdown.capability_score = technicalEvidenceScore;
    scoringBreakdown.overall_score = nextOverallScore;
    metadata.scoring_breakdown = scoringBreakdown;
  }

  const nextReasons = [...params.candidate.match_reasons];
  if (params.enrichment.githubSignals.recruiter_summary) {
    nextReasons.unshift(params.enrichment.githubSignals.recruiter_summary);
  }
  if (params.enrichment.githubSignals.status === "verified" && params.enrichment.githubSignals.highlight) {
    nextReasons.unshift(params.enrichment.githubSignals.highlight);
  }

  return {
    ...params.candidate,
    github_url: params.enrichment.githubUrl || params.candidate.github_url,
    match_score: nextOverallScore,
    match_reasons: compactStringArray(nextReasons, 5),
    metadata,
  };
}
