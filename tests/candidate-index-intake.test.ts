import assert from "node:assert/strict";
import test from "node:test";

import type { BrightDataProfile } from "@/lib/brightdata";
import { precheckBrightProfile } from "@/lib/candidate-index/intake";

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
