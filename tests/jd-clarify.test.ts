import test from "node:test";
import assert from "node:assert/strict";
import {
  buildParsedRequirementsForLaunch,
} from "../src/lib/jd-parse";

test("buildParsedRequirementsForLaunch preserves preview parse metadata", () => {
  const parsed = buildParsedRequirementsForLaunch(
    {
      title: "Senior Backend Engineer",
      required_skills: ["Node.js", "TypeScript", "PostgreSQL", "AWS"],
      location: "United States",
      experience_years_min: 5,
      recall_spec: {
        countries: ["US"],
        title_variants: ["Backend Engineer"],
        core_skill_terms: ["Node.js", "TypeScript", "PostgreSQL"],
      },
      parse_origin: "clarify_preview",
      user_clarification: "Focus on marketplace or fintech backgrounds.",
    },
    `
Senior Backend Engineer
Location: United States

Node.js, TypeScript, PostgreSQL, AWS.
`,
    {
      candidateCount: 20,
      displayCount: 20,
      highlightCount: 20,
      outreachPoolTarget: 20,
      planCode: "pro",
      executionProfile: "bright_production_full",
    },
  ) as Record<string, unknown>;

  assert.equal(parsed.parse_origin, "clarify_preview");
  assert.equal(
    parsed.user_clarification,
    "Focus on marketplace or fintech backgrounds.",
  );
});
