import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDeterministicWeakEvidenceOutreachDraft,
  buildFallbackOutreachDraft,
  buildRecruiterOutreachEvidence,
  buildRecruiterOutreachPrompt,
} from "../src/lib/recruiter-outreach";

test("buildRecruiterOutreachEvidence prefers concrete linkedin facts over boilerplate reasons", () => {
  const evidence = buildRecruiterOutreachEvidence({
    name: "Shaun Rew",
    headline: "Senior Software Engineer",
    location: "Haddington, Scotland, United Kingdom, GB",
    skills: ["Java", "PCI-DSS"],
    matchReasons: [
      "Shaun Rew still looks worth reviewing from LinkedIn as a Senior Software Engineer at Mastercard, but no public GitHub evidence was verified.",
      "4+ years payment systems at Mastercard.",
      "Profile suggests deep payments and risk expertise.",
    ],
  });

  assert.equal(evidence.evidenceSource, "linkedin");
  assert.equal(evidence.proofToReference, "4+ years payment systems at Mastercard.");
  assert.equal(evidence.proofConfidence, "supported");
  assert.ok(evidence.approvedFacts.includes("4+ years payment systems at Mastercard."));
});

test("buildRecruiterOutreachEvidence marks sparse linkedin evidence as weak", () => {
  const evidence = buildRecruiterOutreachEvidence({
    name: "Evan Andrews",
    headline: "at Stripe",
    location: "Ithaca, New York, United States, US",
    skills: ["Payments", "Go"],
    matchReasons: [
      "Evan Andrews still looks worth reviewing from LinkedIn as a at Stripe at Stripe, but no public GitHub evidence was verified.",
      "Current Stripe employee, top payments domain.",
      "Profile suggests deep payments and risk expertise.",
    ],
  });

  assert.equal(evidence.proofConfidence, "weak");
  assert.equal(evidence.proofToReference, "Profile skills include Payments and Go.");
  assert.ok(!evidence.approvedFacts.includes("Profile suggests deep payments and risk expertise."));
  assert.ok(evidence.cautions.some((item) => item.includes("Use cautious language")));
});

test("buildRecruiterOutreachPrompt includes anti-overclaim guardrails", () => {
  const prompt = buildRecruiterOutreachPrompt({
    roleTitle: "Staff Software Engineer - Payments Infrastructure",
    jdText: "Build payment rails with Go or Java, event-driven architecture, and PCI-DSS requirements.",
    candidate: {
      name: "Evan Andrews",
      headline: "at Stripe",
      location: "Ithaca, New York, United States, US",
      skills: ["Payments", "Go"],
      matchReasons: [
        "Evan Andrews still looks worth reviewing from LinkedIn as a at Stripe at Stripe, but no public GitHub evidence was verified.",
        "Profile suggests deep payments and risk expertise.",
      ],
    },
  });

  assert.match(prompt, /Mention only facts that are explicitly supported/);
  assert.match(prompt, /Never turn inferred fit, likely experience, or role requirements into confirmed candidate facts/);
  assert.match(prompt, /Do not use company affiliation, domain association, or role title alone to claim the candidate built or led a specific system/);
  assert.match(prompt, /If evidence confidence is "weak", use cautious language/);
  assert.match(prompt, /Avoid phrases like "perfect match", "aligns perfectly", or "extensive experience"/);
  assert.doesNotMatch(prompt, /Match reasons:/);
});

test("buildRecruiterOutreachPrompt keeps github evidence scoped to engineering credibility", () => {
  const prompt = buildRecruiterOutreachPrompt({
    roleTitle: "Staff Software Engineer - Payments Infrastructure",
    jdText: "Build payment rails with Go or Java, event-driven architecture, and PCI-DSS requirements.",
    candidate: {
      name: "Simon Radford",
      headline: "Staff Software Engineer at Twitter",
      location: "San Francisco, California, United States",
      skills: ["Distributed Systems", "Go"],
      matchReasons: [
        "Simon Radford looks worth contacting because GitHub supports the LinkedIn story and 2 merged external PRs.",
      ],
      githubSignals: {
        status: "verified",
        highlight:
          "simonrad has a merged PR in sublimehq/package_control_channel titled \"Allow installing SelectionTools package on ST3.\", which is a concrete open-source collaboration signal.",
        recruiter_summary:
          "Simon Radford looks worth contacting because GitHub supports the LinkedIn story and 2 merged external PRs.",
        outreach_angle:
          "Open with this proof point: simonrad has a merged PR in sublimehq/package_control_channel titled \"Allow installing SelectionTools package on ST3.\"",
        evidence_strength: "medium",
      },
    },
  });

  assert.match(prompt, /use it as an engineering credibility signal only/i);
  assert.match(prompt, /Do not infer payments or domain expertise unless the proof itself shows it/i);
});

test("buildFallbackOutreachDraft softens language when evidence is weak", () => {
  const draft = buildFallbackOutreachDraft({
    firstName: "Evan",
    roleTitle: "Staff Software Engineer",
    hasEmail: true,
    evidence: buildRecruiterOutreachEvidence({
      name: "Evan Andrews",
      headline: "at Stripe",
      skills: ["Payments", "Go"],
      matchReasons: ["Profile suggests deep payments and risk expertise."],
    }),
  });

  assert.match(draft.linkedin, /may be overlap/);
  assert.match(draft.linkedin, /^Hi Evan,/);
  assert.equal(draft.subject, "Staff Software Engineer opportunity");
});

test("buildDeterministicWeakEvidenceOutreachDraft stays grounded in safe profile facts", () => {
  const draft = buildDeterministicWeakEvidenceOutreachDraft({
    firstName: "Evan",
    roleTitle: "Staff Software Engineer",
    hasEmail: true,
    evidence: buildRecruiterOutreachEvidence({
      name: "Evan Andrews",
      headline: "at Stripe",
      skills: ["Payments", "Go"],
      matchReasons: ["Current Stripe employee, top payments domain."],
    }),
  });

  assert.match(draft.linkedin, /I noticed your profile mentions Payments and Go/);
  assert.doesNotMatch(draft.linkedin, /worked on payments infrastructure/i);
  assert.match(draft.email || "", /there may be overlap/);
});
