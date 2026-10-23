import { z } from "zod";

const uuidPattern = z.toJSONSchema(z.uuid()).pattern;

// Preserve the tool contract and runtime Zod validation. format=uuid already
// describes UUID syntax to the model; repeating Zod's long pattern adds no
// instruction. $schema is a document annotation, not a tool argument constraint.
export function compactAgentToolSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactAgentToolSchema);
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(Object.entries(object)
    .filter(([key, item]) => key !== "$schema" && !(key === "pattern" && object.format === "uuid" && item === uuidPattern))
    .map(([key, item]) => [key, compactAgentToolSchema(item)]));
}
