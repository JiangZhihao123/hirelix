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
      "Read/import CVs and JDs, match candidates, prepare calls/interviews, review work priorities, and save or correct communications and role-specific permissions.",
  },
  {
    name: "client-delivery",
    description:
      "Prepare, revise or export recommendation materials and period-specific client reports; preview and confirm email delivery.",
  },
  {
    name: "follow-ups",
    description:
      "Save or change explicit personal preferences, one-time reminders and recurring client reports.",
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
