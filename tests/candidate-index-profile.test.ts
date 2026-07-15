import assert from "node:assert/strict";
import test from "node:test";

import type { BrightDataProfile } from "@/lib/brightdata";
import { buildExperienceSearchDocument, normalizeBrightProfile } from "@/lib/candidate-index/profile";
import { PROFILE_REPRESENTATION_SCHEMA, validateProfileRepresentation } from "@/lib/candidate-index/representation";
import { COMPARISON_SCHEMA, FINAL_SCHEMA, QUALIFICATION_SCHEMA } from "@/lib/candidate-index/judgment";

function profile(): BrightDataProfile {
  return {
    name: "Ada Example",
    first_name: "Ada",
    last_name: "Example",
    linkedin_id: "ada-example",
    headline: "Machine Learning Engineer",
    about: "Builds production ML systems.",
    city: "Seattle",
    country_code: "us",
    current_company: { name: "Example", company_id: null, title: "ML Engineer", location: "Seattle" },
    experience: [
      { title: "ML Engineer", company: "Example", company_id: null, location: "Seattle", duration: "Jan 2020 - Present", description: "Deployed inference services." },
      { title: "Software Engineer", company: "Earlier", company_id: null, location: null, duration: "Jan 2018 - Dec 2021", description: "Built APIs." },
    ],
    education: [{ title: null, subtitle: "State University", field_of_study: "Computer Science", degree: "Master of Science", start_year: "2016", end_year: "2018" }],
    skills: [], connections: null, followers: null,
    url: "https://linkedin.com/in/ada-example/?trk=test",
    avatar: null, languages: [], certifications: [], recommendations_count: null,
    input: { url: "https://linkedin.com/in/ada-example" },
  };
}

test("profile normalization canonicalizes identity and merges overlapping experience", () => {
  const normalized = normalizeBrightProfile(profile());
  assert.equal(normalized.linkedinUrl, "https://www.linkedin.com/in/ada-example");
  assert.equal(normalized.countryCode, "US");
  assert.equal(normalized.highestDegree, "master");
  assert.ok((normalized.yearsExperience || 0) < 9);
  assert.ok((normalized.yearsExperience || 0) > 7);
  assert.equal(normalized.experiences[0].isCurrent, true);
  assert.match(buildExperienceSearchDocument(normalized.experiences[0]), /Deployed inference services/);
});

test("profile representation rejects evidence that cannot point to a real experience", () => {
  const normalized = normalizeBrightProfile(profile());
  assert.throws(() => validateProfileRepresentation({
    role_families: ["machine_learning"], adjacent_roles: [], seniority: "senior",
    skills: ["Python"], domains: [], capabilities: [], summary: "", experiences: [],
    evidence: [{ claim: "Built ML", experience_ref: "missing", detail: "No source" }],
  }, normalized), /unknown experience/);
});

test("profile representation rejects semantic claims without supporting evidence", () => {
  const normalized = normalizeBrightProfile(profile());
  assert.throws(() => validateProfileRepresentation({
    role_families: ["machine_learning"], adjacent_roles: [], seniority: "senior",
    skills: ["Kubernetes"], domains: [], capabilities: [], summary: "", experiences: [],
    evidence: [{ claim: "Built ML services", experience_ref: "exp-0", detail: "Deployed inference services" }],
  }, normalized), /claim has no evidence: Kubernetes/);
});

test("candidate index LLM calls use strict named JSON schemas", () => {
  for (const schema of [PROFILE_REPRESENTATION_SCHEMA, QUALIFICATION_SCHEMA, COMPARISON_SCHEMA, FINAL_SCHEMA]) {
    assert.equal(schema.strict, true);
    assert.equal(schema.schema.type, "object");
    assert.equal(schema.schema.additionalProperties, false);
    assert.ok(schema.name.length > 0);
  }
});
