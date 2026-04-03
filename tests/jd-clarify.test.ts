import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFallbackJobClarification,
  buildHeuristicJobDescriptionDraft,
  buildParsedRequirementsForLaunch,
} from "../src/lib/jd-parse.ts";

test("buildFallbackJobClarification is ready when summary is complete", () => {
  const clarification = buildFallbackJobClarification({
    title: "Senior Backend Engineer",
    requiredSkills: ["TypeScript", "PostgreSQL", "Kafka"],
    niceToHaveSkills: ["AWS"],
    experienceYearsMin: 5,
    workModel: "remote",
    locationScope: "Asia Pacific or Europe",
    locationFlexibility: "moderate",
    relocationAllowed: "unknown",
    mustHaveConstraints: [],
    softConstraints: [],
    constraintReasoning: null,
  });

  assert.equal(clarification.ready_to_launch, true);
  assert.match(clarification.message, /ready to launch/i);
});

test("buildFallbackJobClarification asks for the most important missing details", () => {
  const clarification = buildFallbackJobClarification({
    title: "Untitled Role",
    requiredSkills: [],
    niceToHaveSkills: [],
    experienceYearsMin: null,
    workModel: "unknown",
    locationScope: null,
    locationFlexibility: "moderate",
    relocationAllowed: "unknown",
    mustHaveConstraints: [],
    softConstraints: [],
    constraintReasoning: null,
  });

  assert.equal(clarification.ready_to_launch, false);
  assert.match(clarification.message, /exact title/i);
  assert.match(clarification.message, /must-have skills/i);
});

test("buildHeuristicJobDescriptionDraft extracts a usable draft without LLM", () => {
  const draft = buildHeuristicJobDescriptionDraft(`
Senior Backend Engineer
Location: United States

We are hiring a backend engineer to build distributed systems with Node.js, TypeScript, PostgreSQL, and AWS.
Candidates should have 5+ years of experience and be comfortable with Kafka and APIs.
`);

  assert.equal(draft.title, "Senior Backend Engineer");
  assert.equal(draft.experience_years_min, 5);
  assert.equal(draft.location, "United States");
  assert.match(JSON.stringify(draft.required_skills), /TypeScript/);
  assert.match(JSON.stringify(draft.recall_spec), /US/);
});

test("buildParsedRequirementsForLaunch preserves preview parse metadata", () => {
  const parsed = buildParsedRequirementsForLaunch(
    {
      ...buildHeuristicJobDescriptionDraft(`
Senior Backend Engineer
Location: United States

Node.js, TypeScript, PostgreSQL, AWS.
`),
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
      executionProfile: "bright_full_pro",
    },
  ) as Record<string, unknown>;

  assert.equal(parsed.parse_origin, "clarify_preview");
  assert.equal(
    parsed.user_clarification,
    "Focus on marketplace or fintech backgrounds.",
  );
});
