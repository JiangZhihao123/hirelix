import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The catalog is instructions, not executable workflow routing. The model
// chooses when to read a method; only these repository-owned files are exposed.
export const agentSkillNames = [
  "recruiting-records",
  "client-delivery",
  "follow-ups",
] as const;
export const agentSkills = [
  {
    name: "recruiting-records",
    description:
      "Professional methods for recruiting evidence: identity reconciliation, JD-specific assessment, dated communications, interview preparation and prioritization.",
  },
  {
    name: "client-delivery",
    description:
      "Methods for client-facing recommendations and reports: source selection, reporting periods, revision quality and confidential delivery.",
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
