// Re-export everything from the modular github/ directory.
// Other files import from "@/lib/github-signals" — this barrel keeps backward compatibility.
export type { GithubSignals, GithubEnrichmentResult } from "./github/types";
export {
  resetGithubApiRateLimitStateForTests,
  extractGitHubUrlsFromText,
  extractGithubOwnerCandidateFromUrl,
  classifyActivityTrendFromWeeks,
  evaluateCommitMessageQuality,
  computeGithubSignalScore,
  buildRecruiterFacingGithubReadout,
  buildPendingGithubSignals,
  enrichGithubSignalsForCandidate,
  applyGithubSignalsToCandidateRow,
  repoSummariesFromMetadata,
} from "./github/index";
