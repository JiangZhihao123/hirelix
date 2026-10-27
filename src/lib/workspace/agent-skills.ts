import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { WorkspaceError } from "./database";
import { recordBatchRow } from "./record-batches";
import { recordWriteSchemas } from "./record-writes";

// The catalog describes methods, never dispatches business workflows.
export const agentSkillNames = [
  "recruiting-records", "candidate-assessment", "candidate-import",
  "public-sourcing", "client-delivery", "email-correspondence", "follow-ups",
] as const;
export type AgentSkillName = (typeof agentSkillNames)[number];
const descriptions: Record<AgentSkillName, string> = {
  "recruiting-records": "Understand and maintain recruiting facts from JDs, resumes, notes and feedback.",
  "candidate-assessment": "Evaluate and compare candidates against current role evidence; prepare focused recruiting conversations.",
  "candidate-import": "Bring historical candidates and related records from supplied files and exported recruiting data.",
  "public-sourcing": "Find and research potential candidates from public professional evidence.",
  "client-delivery": "Write, revise and deliver recruiter briefs, candidate recommendations and client progress reports.",
  "email-correspondence": "Understand mailbox evidence and prepare accurate correspondence for the requested audience.",
  "follow-ups": "Manage explicit reminders, recurring role reports and durable working preferences.",
};
const resources: Partial<Record<AgentSkillName, string[]>> = {
  "candidate-import": ["references/platform-exports.md", "references/batch-format.json"],
  "public-sourcing": ["references/source-access.md"],
  "client-delivery": ["references/formats.md"],
};
export const agentSkills = agentSkillNames.map(name => ({name, description: descriptions[name]}));

export async function readAgentSkill(name: AgentSkillName, resource?: string) {
  if (!agentSkillNames.includes(name)) throw new WorkspaceError("This Skill is unavailable.", 404);
  if (resource && !(resources[name] || []).includes(resource))
    throw new WorkspaceError("Choose a resource listed by this Skill.", 404);
  const instructions = resource === "references/batch-format.json"
    ? JSON.stringify({
        format: "UTF-8 JSONL, one object per line, one write_operation per batch. No authorization fields in source rows.",
        row: z.toJSONSchema(recordBatchRow),
        operations: Object.fromEntries(Object.entries(recordWriteSchemas).map(([key, schema]) => [key, z.toJSONSchema(schema)])),
      })
    : await readFile(join(process.cwd(), "src/lib/workspace/skills", name, resource || "SKILL.md"), "utf8");
  return {
    name, resource: resource ?? "SKILL.md", instructions,
    version: createHash("sha256").update(instructions).digest("hex"),
    resources: resources[name] || [],
  };
}
