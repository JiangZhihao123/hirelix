import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { agentRoleBrief } from "../src/lib/workspace/agent-contracts";
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
    assert(skill.instructions.startsWith("# "));
    assert(skill.instructions.length > 300);
  }
});
