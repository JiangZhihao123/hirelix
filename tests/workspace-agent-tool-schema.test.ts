import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { createAgentTools, AGENT_TOOL_AUTHORIZATION_RULES } from "../src/lib/workspace/agent-tools";
import { compactAgentToolSchema } from "../src/lib/workspace/agent-tool-schema";

test("all 43 tools retain their runtime schemas and every nonredundant model constraint", () => {
  const tools = createAgentTools({job:{user_id:"qa"},question:{content:""},conversation:{id:"qa"},sources:new Map()} as never);
  assert.equal(Object.keys(tools).length,43);
  const uuidPattern = z.toJSONSchema(z.uuid()).pattern;
  function expected(value: unknown): unknown {
    if(Array.isArray(value))return value.map(expected);
    if(!value||typeof value!=="object")return value;
    const object=value as Record<string,unknown>;
    return Object.fromEntries(Object.entries(object).flatMap(([key,item]) => key==="$schema" || (key==="pattern" && object.format==="uuid" && item===uuidPattern) ? [] : [[key,expected(item)]]));
  }
  for(const [name,tool] of Object.entries(tools)) {
    const schema=tool.inputSchema as z.ZodType, original=z.toJSONSchema(schema);
    const compact=compactAgentToolSchema(original);
    assert.deepEqual(compact,expected(original),name);
    assert.equal(schema.safeParse(undefined).success,false,name);
  }
  for(const term of ["current", "prior user instruction", "superseded", "External actions", "Never quote files"])
    assert.ok(AGENT_TOOL_AUTHORIZATION_RULES.includes(term));
  const custom = {type:"string",format:"uuid",pattern:"^custom$"};
  assert.deepEqual(compactAgentToolSchema(custom),custom,"Non-Zod patterns are retained");
});
