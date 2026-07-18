import assert from "node:assert/strict";
import test from "node:test";

import type { BrightDataProfile } from "@/lib/brightdata";
import { precheckBrightProfile, screenBrightProfilesForIndex } from "@/lib/candidate-index/intake";

function profile(name: string, overrides: Partial<BrightDataProfile> = {}): BrightDataProfile {
  return {
    name,
    first_name: name,
    last_name: null,
    linkedin_id: `id-${name}`,
    headline: "Machine Learning Engineer",
    about: null,
    city: "Seattle",
    country_code: "US",
    current_company: { name: "Example", company_id: null, title: "Machine Learning Engineer", location: "US" },
    experience: [{
      title: "Machine Learning Engineer",
      company: "Example",
      company_id: null,
      location: "US",
      duration: "2023 - Present",
      description: "Built production machine learning systems.",
    }],
    education: [],
    skills: ["Python"],
    connections: null,
    followers: null,
    url: `https://linkedin.com/in/${name}`,
    avatar: null,
    languages: [],
    certifications: [],
    recommendations_count: null,
    input: { url: `https://linkedin.com/in/${name}` },
    ...overrides,
  };
}

test("precheckBrightProfile rejects profiles that cannot be reused", () => {
  const missingIdentity = precheckBrightProfile(profile("missing-id", { linkedin_id: null, url: null }));
  assert.equal(missingIdentity?.decision, "incomplete");
  assert.deepEqual(missingIdentity?.missingInformation, ["Missing LinkedIn identity"]);

  const missingExperience = precheckBrightProfile(profile("missing-experience", { experience: [] }));
  assert.equal(missingExperience?.decision, "incomplete");
  assert.ok(missingExperience?.missingInformation.includes("Missing work experience"));
});

test("screenBrightProfilesForIndex spends the index budget on advance before maybe", async () => {
  const profiles = [profile("maybe-first"), profile("reject"), profile("advance-one"), profile("advance-two")];
  const judged: string[] = [];
  const result = await screenBrightProfilesForIndex({
    jd: { title: "Machine Learning Engineer" },
    profiles,
    usage: { searchId: "search", jobId: "job", userId: "user" },
    limit: 2,
    judgeProfile: async (_jd, candidate) => {
      judged.push(candidate.name);
      const decision = candidate.name.startsWith("advance")
        ? "advance" as const
        : candidate.name === "reject" ? "reject" as const : "maybe" as const;
      return {
        decision,
        evidence: [candidate.experience[0].description || ""],
        risks: [],
        missingInformation: [],
        reason: decision,
        model: "test",
      };
    },
  });

  assert.deepEqual(judged, profiles.map((item) => item.name));
  assert.deepEqual(result.selectedProfiles.map((item) => item.name), ["advance-one", "advance-two"]);
  assert.deepEqual(result.metrics, {
    reviewed_count: 4,
    selected_count: 2,
    advance: 2,
    maybe: 1,
    reject: 1,
    incomplete: 0,
  });
});

test("screenBrightProfilesForIndex does not call the model for incomplete profiles", async () => {
  let calls = 0;
  const result = await screenBrightProfilesForIndex({
    jd: {},
    profiles: [profile("empty", { experience: [] })],
    usage: { searchId: "search", jobId: "job", userId: "user" },
    judgeProfile: async () => {
      calls += 1;
      throw new Error("should not run");
    },
  });

  assert.equal(calls, 0);
  assert.equal(result.metrics.incomplete, 1);
  assert.equal(result.selectedProfiles.length, 0);
});
