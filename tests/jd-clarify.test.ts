import test from "node:test";
import assert from "node:assert/strict";
import { buildFallbackJobClarification } from "../src/lib/jd-parse.ts";

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
