import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { agentRoleBrief, agentRoleChanges, decodeToolInput, preservesToolInputFacts } from "../src/lib/workspace/agent-contracts";
import {
  agentSkillNames,
  readAgentSkill,
} from "../src/lib/workspace/agent-skills";

test("agent brief cannot silently default missing or unknown fields to empty requirements", () => {
  assert.equal(agentRoleBrief.nullable().safeParse(undefined).success, false);
  assert.equal(agentRoleBrief.safeParse({}).success, false);
  assert.equal(
    agentRoleBrief.safeParse({ requirements: ["Keep the office requirement"] })
      .success,
    false,
  );
  assert.equal(agentRoleBrief.nullable().parse(null), null);
  const brief = {
    priorities: ["Keep all current requirements"],
    flexible: [],
    unknowns: ["Start date"],
  };
  assert.deepEqual(agentRoleBrief.parse(brief), brief);
  assert.deepEqual(z.toJSONSchema(agentRoleBrief).required, [
    "priorities",
    "flexible",
    "unknowns",
  ]);
});
test("runtime Skill catalog resolves to real working instructions", async () => {
  for (const name of agentSkillNames) {
    const skill = await readAgentSkill(name);
    assert.equal(skill.name, name);
    assert(skill.instructions.startsWith("---\n"));
    assert.match(skill.version, /^[0-9a-f]{64}$/);
    assert(skill.instructions.length > 300);
  }
});

test("a brief-only agent update can leave details unchanged without inventing a patch", () => {
  assert.equal(agentRoleChanges.parse(null), null);
  assert.equal(agentRoleChanges.parse(undefined), null);
  assert.deepEqual(agentRoleChanges.parse({ title: "Customer Operations Lead" }), {
    title: "Customer Operations Lead", client_name: null, status: null, client_contact: null,
  });
  assert.equal(agentRoleBrief.safeParse({}).success, false, "the complete current brief is still required");
});

test("tool parameter repair preserves facts, references and authorization", () => {
  const original = { role_id: "observed-role", authorization_quote: "Update the budget", budget: 170000, gaps: null };
  assert.equal(preservesToolInputFacts(JSON.stringify(original), { ...original, gaps: [] }), true);
  assert.deepEqual(decodeToolInput(JSON.stringify(JSON.stringify(original))), original);
  assert.equal(preservesToolInputFacts(JSON.stringify(JSON.stringify(original)), { ...original, gaps: [] }), true);
  assert.equal(preservesToolInputFacts(JSON.stringify(original), { ...original, budget: 180000 }), false);
  assert.equal(preservesToolInputFacts(JSON.stringify(original), { ...original, feedback: "Invented client feedback" }), false);
  assert.equal(preservesToolInputFacts(JSON.stringify(original), { ...original, role_id: "different-role" }), false);
  assert.equal(preservesToolInputFacts(JSON.stringify(original), { ...original, authorization_quote: "Save and send" }), false);
  assert.equal(preservesToolInputFacts('{"source":"observed", "budget":170000', { source: "observed", budget: 170000 }), true);
  assert.equal(preservesToolInputFacts('{"source":"observed", "budget":170000', { source: "fabricated", budget: 170000 }), false);
});
