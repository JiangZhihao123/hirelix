import assert from "node:assert/strict";
import test from "node:test";

import type { BrightDataProfile } from "@/lib/brightdata";
import {
  planQualificationBatch,
  selectStructurallyIndexableProfiles,
} from "@/lib/candidate-index/workflow";

function profile(name: string, experienceCount = 1): BrightDataProfile {
  return {
    name,
    first_name: name,
    last_name: null,
    linkedin_id: name,
    headline: "Engineer",
    about: null,
    city: null,
    country_code: "US",
    current_company: null,
    experience: Array.from({ length: experienceCount }, () => ({
      title: "Engineer", company: "Example", company_id: null,
      location: null, duration: "2020 - Present", description: "Built systems",
    })),
    education: [], skills: [], connections: null, followers: null,
    url: `https://linkedin.com/in/${name}`, avatar: null, languages: [],
    certifications: [], recommendations_count: null,
    input: { url: `https://linkedin.com/in/${name}` },
  };
}

test("structural ingestion accepts every reusable profile without JD judgment", () => {
  const result = selectStructurallyIndexableProfiles([
    profile("complete"),
    profile("missing-experience", 0),
  ]);
  assert.deepEqual(result.selected.map((item) => item.name), ["complete"]);
  assert.equal(result.rejected.length, 1);
});

test("qualification evaluates 100 first and expands until target or max", () => {
  const first = planQualificationBatch({
    totalCandidates: 350, evaluatedCount: 0, advanceCount: 0,
    initialLimit: 100, batchSize: 50, maxLimit: 200, advanceTarget: 30,
  });
  assert.deepEqual(first, { size: 100, stopReason: null });
  const expand = planQualificationBatch({
    totalCandidates: 350, evaluatedCount: 100, advanceCount: 18,
    initialLimit: 100, batchSize: 50, maxLimit: 200, advanceTarget: 30,
  });
  assert.deepEqual(expand, { size: 50, stopReason: null });
  const enough = planQualificationBatch({
    totalCandidates: 350, evaluatedCount: 150, advanceCount: 31,
    initialLimit: 100, batchSize: 50, maxLimit: 200, advanceTarget: 30,
  });
  assert.deepEqual(enough, { size: 0, stopReason: "advance_target_reached" });
  const capped = planQualificationBatch({
    totalCandidates: 350, evaluatedCount: 200, advanceCount: 22,
    initialLimit: 100, batchSize: 50, maxLimit: 200, advanceTarget: 30,
  });
  assert.deepEqual(capped, { size: 0, stopReason: "max_limit_reached" });
});
