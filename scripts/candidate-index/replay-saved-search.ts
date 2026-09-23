/** Real-service replay in an isolated database. Never creates a Bright snapshot. */
import fs from "node:fs";
import { and, eq, ne } from "drizzle-orm";
import { db, closeDb } from "@/db/client";
import { hirelix_searches, hirelix_candidates, hirelix_profiles, hirelix_profile_experiences, hirelix_usage_events, user } from "@/db/schema";
import { enqueueSearchJob, processNextSearchJob } from "@/lib/search";
import { indexBrightProfiles } from "@/lib/candidate-index/store";
import type { BrightDataProfile } from "@/lib/brightdata";
import { planSearchNextAction } from "@/lib/candidate-index/search-agent";
import { readDecisionContract, type SearchOutcome } from "@/lib/search/decision-contract";
import { initializeGlobalOutboundProxy } from "@/lib/server-outbound-proxy";

async function validateSavedProfile(searchId: string, userId: string) {
  const [profile] = await db.select().from(hirelix_profiles).where(and(eq(hirelix_profiles.processing_status, "ready"), ne(hirelix_profiles.representation_version, 3))).limit(1);
  if (!profile) throw new Error("No older ready profile is available for fresh ingestion validation.");
  const indexed = await indexBrightProfiles([profile.raw_profile as BrightDataProfile], { snapshotId: profile.source_snapshot_id, searchId, userId });
  if (indexed.indexedProfileIds.length !== 1 || indexed.reused !== 0) throw new Error(`Real profile ingestion failed: ${indexed.rejected.map((row) => row.reason).join("; ")}`);
  const [updated] = await db.select().from(hirelix_profiles).where(eq(hirelix_profiles.id, indexed.indexedProfileIds[0]));
  const experiences = await db.select().from(hirelix_profile_experiences).where(eq(hirelix_profile_experiences.profile_id, updated.id));
  const indexProof = { status: updated.processing_status, version: updated.representation_version, semanticEvidenceCount: (updated.semantic_evidence as unknown[]).length, experiences: experiences.length, allExperiencesEmbedded: experiences.every((row) => Boolean(row.embedding?.length)) };
  if (updated.processing_status !== "ready" || experiences.some((row) => !row.embedding?.length)) throw new Error("Profile was published without complete vectors.");
  console.log(JSON.stringify({ event: "real_index_validation", reused: indexed.reused, ...indexProof }));
  return indexProof;
}

async function main() {
  const database = new URL(process.env.DATABASE_URL || "").pathname.slice(1);
  if (!/^hirelix_.*qa/.test(database)) throw new Error("Replay requires a dedicated hirelix QA database.");
  if (process.env.SEARCH_ALLOW_BRIGHT_RECALL !== "false" || process.env.BRIGHTDATA_API_TOKEN) throw new Error("Disable external recall and remove the Bright token before replay.");
  initializeGlobalOutboundProxy();
  const sourceId = process.argv[2];
  if (!sourceId) throw new Error("Pass the saved source search UUID.");
  const [source] = await db.select().from(hirelix_searches).where(eq(hirelix_searches.id, sourceId));
  if (!source) throw new Error("Saved search not found in QA database.");
  const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, process.env.QA_USER_EMAIL || "noahjiang2@gmail.com"));
  if (!owner) throw new Error("Log in to QA with the authorized local account first.");
  if (process.argv.includes("--validate-index-only")) {
    await validateSavedProfile(sourceId, owner.id);
    return;
  }
  const parsed = { ...(source.parsed_requirements as Record<string, unknown>) };
  for (const key of ["decision_contract", "candidate_index_checkpoint", "search_agent", "rerun_mode", "expand_requested_at", "expand_completed_at", "display_stats", "search_error_type"]) delete parsed[key];
  Object.assign(parsed, { allow_external_recall: false, candidate_index_force_bright: false, profile_scan_budget: 0, internal_operator: false, execution_profile: "bright_production_full", validation_source_search_id: sourceId });
  const [search] = await db.insert(hirelix_searches).values({ user_id: owner.id, title: source.title, jd_text: source.jd_text, parsed_requirements: parsed, status: "queued", pipeline_step: "accepted", queued_at: new Date(), parse_completed_at: source.parse_completed_at }).returning();
  const job = await enqueueSearchJob({ searchId: search.id, userId: search.user_id, jdText: search.jd_text, candidateCount: 200 });
  await db.insert(hirelix_usage_events).values({ user_id: owner.id, related_id: search.id, event_type: "search_created", metadata: { plan_code: "free", profile_scans_reserved: 0, profile_scans_used: 0, client_roles_used: 1, internal_operator: false, validation_only: true } });
  fs.writeFileSync("/tmp/hirelix-pipeline-qa-search.json", JSON.stringify({ searchId: search.id, sourceId, database }));
  console.log(JSON.stringify({ event: "replay_started", searchId: search.id, sourceId, database }));
  const indexProof = process.argv.includes("--validate-index") ? await validateSavedProfile(search.id, search.user_id) : null;
  const result = await processNextSearchJob(search.id);
  const [finished] = await db.select().from(hirelix_searches).where(eq(hirelix_searches.id, search.id));
  const rows = await db.select({ decision: hirelix_candidates.final_decision, score: hirelix_candidates.match_score, metadata: hirelix_candidates.metadata }).from(hirelix_candidates).where(eq(hirelix_candidates.search_id, search.id));
  const finalParsed = finished.parsed_requirements as Record<string, unknown>;
  const outcome = (finalParsed.display_stats as { search_outcome?: SearchOutcome })?.search_outcome;
  const plannerProposal = outcome ? await planSearchNextAction({ contract: readDecisionContract(finalParsed.decision_contract)!, outcome, unresolved: [], sourceAllowed: true, sourceAlreadyRequested: false, scanBudget: 500, usage: { searchId: search.id, jobId: job.id, userId: search.user_id } }) : null;
  const [billingEvent] = await db.select().from(hirelix_usage_events).where(eq(hirelix_usage_events.related_id, search.id));
  const report = { billingMetadata: billingEvent?.metadata, indexProof, plannerProposalOnly: plannerProposal, searchId: search.id, result, status: finished.status, error: finished.error_message, stats: finalParsed.display_stats, candidateCount: rows.length, numericScoreCount: rows.filter((row) => row.score !== null).length, decisionCounts: Object.fromEntries(["contact", "review", "hold", "reject"].map((decision) => [decision, rows.filter((row) => row.decision === decision).length])) };
  fs.writeFileSync("/tmp/hirelix-pipeline-qa-report.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (finished.status !== "done" || rows.some((row) => row.score !== null)) throw new Error("Real replay did not complete with evidence-based decisions.");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(() => closeDb());
