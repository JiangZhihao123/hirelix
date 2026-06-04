import assert from "node:assert/strict";
import test from "node:test";

import type { BrightDataProfile } from "@/lib/brightdata";
import { completeSearch } from "@/lib/search/finalize";
import { getDeliveryBucketForAssessment } from "@/lib/search/pipeline";
import { buildBrightDataCandidateRows } from "@/lib/search/recall";
import { tagPoolRows } from "@/lib/search/scoring";
import type {
  CandidateDisplayTier,
  CandidateRowInput,
  ScoredCandidateAssessment,
  SearchDisplayStats,
} from "@/lib/search/types";
import {
  compareCandidatesForRecruiterRanking,
  getCandidateDeliveryBucket,
  getCandidateDisplayTier,
} from "@/app/(product)/app/search/[id]/_components/utils";
import type { CandidateRow } from "@/app/(product)/app/search/[id]/_components/types";

function profile(index: number): BrightDataProfile {
  return {
    name: `Candidate ${index}`,
    first_name: "Candidate",
    last_name: `${index}`,
    linkedin_id: `linkedin-${index}`,
    headline: `Engineer ${index}`,
    about: null,
    city: "San Francisco",
    country_code: "US",
    current_company: {
      name: "Example",
      company_id: null,
      title: "Software Engineer",
      location: null,
    },
    experience: [],
    education: [],
    skills: ["Go", "Distributed Systems"],
    connections: 500,
    followers: null,
    url: `https://www.linkedin.com/in/candidate-${index}`,
    avatar: null,
    languages: [],
    certifications: [],
    recommendations_count: null,
    input: { url: `https://www.linkedin.com/in/candidate-${index}` },
  };
}

function assessment(index: number, bucket: ScoredCandidateAssessment["suitability"]["bucket"]): ScoredCandidateAssessment {
  const advanceRecommendation = bucket === "do_not_show" ? "reject" : bucket === "strong_now" ? "advance" : "hold";
  const blockingSeverity = bucket === "do_not_show" ? "hard" : "none";
  return {
    index,
    skills: ["Go", "Distributed Systems"],
    experience_years: 8,
    location: "San Francisco, US",
    suitability: {
      fit_decision: bucket === "do_not_show" ? "reject" : "viable_fit",
      actionability: bucket === "do_not_show" ? "not_actionable" : "needs_review",
      bucket,
      match_score: 80 - index,
      quality_score: 80 - index,
      overall_score: 80 - index,
      advance_score: 80 - index,
      advance_recommendation: advanceRecommendation,
      primary_risk: bucket === "do_not_show" ? "Role mismatch" : null,
      first_contact_confidence: bucket === "strong_now" ? "high" : "medium",
      subscription_trigger_score: 80 - index,
      shortlist_decision: bucket === "do_not_show" ? "no" : "yes",
      shortlist_reason: bucket === "do_not_show" ? "Not enough fit" : "Relevant profile",
      blocking_constraints: bucket === "do_not_show" ? ["Role mismatch"] : [],
      blocking_severity: blockingSeverity,
      scoring_breakdown: {
        capability_score: 80 - index,
        relevance_score: 78 - index,
        join_likelihood_score: bucket === "strong_now" ? 65 : 35,
        join_likelihood_reasons: [],
        quality_score: 80 - index,
        overall_score: 80 - index,
        advance_score: 80 - index,
      },
      constraint_verdicts: {
        location_fit: "local",
        work_model_fit: "yes",
        must_have_coverage: "strong",
      },
      constraint_risks: [],
      risk_flags: [],
      why_this_candidate: ["Relevant backend profile"],
      why_not_higher: bucket === "do_not_show" ? ["Role mismatch"] : [],
      evidence_quality: "medium",
    },
  };
}

test("candidate row builder delivers every scored profile with delivery buckets", () => {
  const profiles = Array.from({ length: 4 }, (_, index) => profile(index));
  const selected = [
    assessment(0, "strong_now"),
    assessment(1, "consider_next"),
    assessment(2, "consider_next"),
    assessment(3, "do_not_show"),
  ];

  const rows = buildBrightDataCandidateRows(profiles, selected, selected.length, "main", {
    getDisplayTierForAssessment: (item): CandidateDisplayTier | null => {
      if (item.index === 0) return "priority_outreach";
      if (item.index === 1) return "worth_reviewing";
      return null;
    },
  });

  assert.equal(rows.length, 4);
  assert.deepEqual(
    rows.map((row) => row.metadata.delivery_bucket),
    ["reach_first", "review_next", "lower_priority", "not_recommended"],
  );
  assert.deepEqual(
    rows.map((row) => row.metadata.is_recommended),
    [true, true, false, false],
  );
  assert.deepEqual(
    rows.map((row) => row.metadata.scored_rank),
    [1, 2, 3, 4],
  );
});

test("delivery buckets do not recommend profiles that fail the shortlist gate", () => {
  const a = assessment(0, "strong_now");
  assert.equal(
    getDeliveryBucketForAssessment(a, "priority_outreach", () => false),
    "lower_priority",
  );
});

test("legacy reach-first metadata is downgraded when reachability is low", () => {
  const candidate = {
    id: "candidate-1",
    name: "Low Reachability Engineer",
    headline: "Staff Software Engineer",
    location: "San Francisco",
    skills: [],
    experience_years: null,
    match_score: 82,
    match_reasons: [],
    profile_url: "https://www.linkedin.com/in/low-reachability",
    github_url: null,
    email: null,
    outreach_draft: null,
    status: "new",
    metadata: {
      delivery_bucket: "reach_first",
      scoring_breakdown: {
        capability_score: 90,
        relevance_score: 92,
        join_likelihood_score: 25,
      },
    },
  } satisfies CandidateRow;

  assert.equal(getCandidateDisplayTier(candidate), "worth_reviewing");
  assert.equal(getCandidateDeliveryBucket(candidate), "review_next");
});

test("legacy reach-first metadata is downgraded for active job-search profiles", () => {
  const candidate = {
    id: "candidate-active",
    name: "Active Search Engineer",
    headline: "Actively looking for new positions | Senior Data Engineer | Kafka | Spark",
    location: "United States",
    skills: [],
    experience_years: null,
    match_score: 88,
    match_reasons: [],
    profile_url: "https://www.linkedin.com/in/active-search",
    github_url: null,
    email: null,
    outreach_draft: null,
    status: "new",
    metadata: {
      delivery_bucket: "reach_first",
      scoring_breakdown: {
        capability_score: 88,
        relevance_score: 90,
        join_likelihood_score: 80,
      },
    },
  } satisfies CandidateRow;

  assert.equal(getCandidateDisplayTier(candidate), "worth_reviewing");
  assert.equal(getCandidateDeliveryBucket(candidate), "review_next");
});

function candidateRow(index: number, deliveryBucket: CandidateRowInput["metadata"]["delivery_bucket"]): CandidateRowInput {
  return {
    name: `Candidate ${index}`,
    headline: `Engineer ${index}`,
    location: "San Francisco",
    skills: ["Go"],
    experience_years: 8,
    match_score: 90 - index,
    match_reasons: ["Relevant profile"],
    profile_url: `https://www.linkedin.com/in/final-candidate-${index}`,
    github_url: null,
    email: null,
    outreach_draft: null,
    metadata: {
      delivery_bucket: deliveryBucket,
      scored_rank: index + 1,
    },
  };
}

test("tagPoolRows keeps recruiter recommendations first and sorts same bucket by quality before reachability", () => {
  const rows = [
    {
      ...candidateRow(0, "lower_priority"),
      name: "High Trigger Lower Priority",
      match_score: 99,
      metadata: {
        delivery_bucket: "lower_priority",
        quality_score: 99,
        advance_score: 99,
        subscription_trigger_score: 99,
      },
    },
    {
      ...candidateRow(1, "review_next"),
      name: "High Quality Review Next",
      match_score: 84,
      metadata: {
        delivery_bucket: "review_next",
        quality_score: 92,
        advance_score: 84,
        subscription_trigger_score: 40,
      },
    },
    {
      ...candidateRow(2, "review_next"),
      name: "High Trigger Review Next",
      match_score: 88,
      metadata: {
        delivery_bucket: "review_next",
        quality_score: 75,
        advance_score: 89,
        subscription_trigger_score: 98,
      },
    },
    {
      ...candidateRow(3, "reach_first"),
      name: "Reach First",
      match_score: 78,
      metadata: {
        delivery_bucket: "reach_first",
        quality_score: 80,
        advance_score: 80,
        subscription_trigger_score: 30,
      },
    },
  ];

  const tagged = tagPoolRows(rows, [], rows.length);

  assert.deepEqual(
    tagged.map((row) => row.name),
    [
      "Reach First",
      "High Quality Review Next",
      "High Trigger Review Next",
      "High Trigger Lower Priority",
    ],
  );
});

test("client recruiter ranking preserves delivery buckets and quality before raw match score", () => {
  const candidates = [
    {
      id: "lower-priority",
      status: "new",
      ...candidateRow(0, "lower_priority"),
      name: "High Match Lower Priority",
      match_score: 99,
      metadata: {
        delivery_bucket: "lower_priority",
        quality_score: 99,
        advance_score: 99,
        subscription_trigger_score: 99,
      },
    },
    {
      id: "reach-first",
      status: "new",
      ...candidateRow(1, "reach_first"),
      name: "Reach First Candidate",
      match_score: 80,
      metadata: {
        delivery_bucket: "reach_first",
        quality_score: 86,
        advance_score: 80,
        subscription_trigger_score: 70,
      },
    },
    {
      id: "review-next-quality",
      status: "new",
      ...candidateRow(2, "review_next"),
      name: "High Quality Review Next",
      match_score: 82,
      metadata: {
        delivery_bucket: "review_next",
        quality_score: 92,
        advance_score: 82,
        subscription_trigger_score: 40,
      },
    },
    {
      id: "review-next-trigger",
      status: "new",
      ...candidateRow(3, "review_next"),
      name: "High Trigger Review Next",
      match_score: 84,
      metadata: {
        delivery_bucket: "review_next",
        quality_score: 75,
        advance_score: 89,
        subscription_trigger_score: 98,
      },
    },
  ] satisfies CandidateRow[];

  assert.deepEqual(
    [...candidates].sort(compareCandidatesForRecruiterRanking).map((candidate) => candidate.name),
    [
      "Reach First Candidate",
      "High Quality Review Next",
      "High Trigger Review Next",
      "High Match Lower Priority",
    ],
  );
});

test("completeSearch upserts the full pool and drafts outreach only for recommended rows", async () => {
  const rows = [
    candidateRow(0, "reach_first"),
    candidateRow(1, "review_next"),
    candidateRow(2, "lower_priority"),
    candidateRow(3, "not_recommended"),
  ];
  let upsertedRows: CandidateRowInput[] = [];
  const observed: { finalStats: SearchDisplayStats | null } = { finalStats: null };
  let outreachInputRows: CandidateRowInput[] = [];
  const events: string[] = [];
  const inputStats: SearchDisplayStats = {
    retrieval_count: 4,
    deep_review_count: 4,
    deep_review_requested_count: 4,
    deep_review_completed_count: 4,
    qualified_count: 0,
    outreach_pool_count: 0,
    shortlist_count: 0,
    bright_profiles_returned: 4,
    bright_profiles_requested: 4,
  };

  await completeSearch(
    {
      searchId: "search-1",
      jobId: "job-1",
      userId: "user-1",
      jdText: "JD",
      createdAt: "2026-05-31T00:00:00.000Z",
      planCode: "free",
      candidateCount: 25,
      highlightCount: 5,
      outreachPoolTarget: 25,
    },
    {},
    rows,
    inputStats,
    {
      nowIso: () => "2026-05-31T00:10:00.000Z",
      getSearchStartedAt: () => "2026-05-31T00:00:00.000Z",
      elapsedSince: () => 600_000,
      buildSearchDisplayStats: (overrides) => overrides as SearchDisplayStats,
      generateOutreachDraftsForRows: async (_context, _runtime, _parsed, recommendedRows) => {
        outreachInputRows = recommendedRows;
        return recommendedRows.map((row) => ({
          ...row,
          outreach_draft: JSON.stringify({ linkedin: `Hi ${row.name}` }),
        }));
      },
      getExecutionRuntime: () => ({}) as never,
      getSearchExecutionProfile: () => ({}),
      upsertCandidatesForSearch: async (_searchId, nextRows) => {
        upsertedRows = nextRows;
      },
      withDisplayStats: (_parsed, stats) => {
        observed.finalStats = stats;
        return { display_stats: stats };
      },
      setSearchStatus: async () => {},
      updateSearchUsageEventMetadata: async () => {},
      logSearchEvent: (eventName) => {
        events.push(eventName);
      },
    },
    {
      runtime: {} as never,
    },
  );

  assert.equal(upsertedRows.length, 4);
  assert.deepEqual(
    outreachInputRows.map((row) => row.metadata.delivery_bucket),
    ["reach_first", "review_next"],
  );
  assert.deepEqual(
    upsertedRows.map((row) => Boolean(row.outreach_draft)),
    [true, true, false, false],
  );
  const finalStats = observed.finalStats as SearchDisplayStats;
  assert.ok(finalStats);
  assert.equal(finalStats.delivered_candidate_count, 4);
  assert.equal(finalStats.recommended_count, 2);
  assert.equal(finalStats.lower_priority_count, 2);
  assert.ok(events.includes("public_evidence_available_on_demand"));
});
