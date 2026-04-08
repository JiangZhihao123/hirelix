import { buildPendingGithubSignals } from "@/lib/github-signals";
import { supabaseAdmin } from "@/lib/supabase-server";

type EnqueueGithubEnrichmentJobInput = {
  candidateId: string;
  searchId: string;
  userId: string;
};

type GithubEnrichmentJobResult = {
  metadata: Record<string, unknown>;
};

export async function enqueueGithubEnrichmentJob(
  input: EnqueueGithubEnrichmentJobInput,
): Promise<GithubEnrichmentJobResult> {
  const { data: candidate } = await supabaseAdmin
    .from("hirelix_candidates")
    .select("id, name, headline, github_url, metadata")
    .eq("id", input.candidateId)
    .eq("search_id", input.searchId)
    .maybeSingle();

  if (!candidate) {
    return { metadata: {} };
  }

  const metadata =
    candidate.metadata && typeof candidate.metadata === "object"
      ? { ...(candidate.metadata as Record<string, unknown>) }
      : {};

  metadata.github_signals = buildPendingGithubSignals({
    status: "queued",
    candidateName: candidate.name || "Unknown candidate",
    headline: candidate.headline,
    existingGithubUrl: candidate.github_url,
    existingSignals:
      metadata.github_signals && typeof metadata.github_signals === "object"
        ? (metadata.github_signals as Record<string, unknown>)
        : null,
  });
  metadata.github_enrichment = {
    status: "queued",
    queued_at: new Date().toISOString(),
    candidate_id: input.candidateId,
    search_id: input.searchId,
    user_id: input.userId,
  };

  return { metadata };
}
