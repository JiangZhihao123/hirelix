import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The catalog is instructions, not executable workflow routing. The model
// chooses when to read a method; only these repository-owned files are exposed.
export const agentSkillNames = [
  "recruiting-records",
  "public-sourcing",
  "candidate-import",
  "client-delivery",
  "follow-ups",
] as const;
export const agentSkills = [
  {
    name: "recruiting-records",
    description:
      "Professional methods for candidate intake from profile links and supplied material, recruiting evidence, role-specific candidate comparison, decision briefings, retained assessments and dated communications.",
  },
  {
    name: "public-sourcing",
    description:
      "Methods for finding potential candidates in publicly available sources, relating observed evidence to a role, and reporting source coverage and uncertainty.",
  },
  {
    name: "candidate-import",
    description:
      "Methods and verified export references for bringing historical candidates from LinkedIn Recruiter, Loxo, Recruit CRM, Recruiterflow and other recruiting systems; coverage, original sources and migration limits.",
  },
  {
    name: "client-delivery",
    description:
      "Methods for multi-candidate recommendations, client reports, private versus shared evidence, delivery versions and individual client feedback.",
  },
  {
    name: "follow-ups",
    description:
      "Methods for delegated reminders, recurring reports and explicit durable preferences, including timing and scope.",
  },
];
export async function readAgentSkill(name: (typeof agentSkillNames)[number]) {
  return {
    name,
    instructions: await readFile(
      join(process.cwd(), "src/lib/workspace/skills", `${name}.md`),
      "utf8",
    ),
  };
}
