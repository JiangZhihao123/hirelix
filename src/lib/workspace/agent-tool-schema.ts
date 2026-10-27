import { z } from "zod";
import { jsonSchema, type JSONSchema7 } from "ai";

const uuidPattern = z.toJSONSchema(z.uuid()).pattern;

// Keep Zod's input semantics (including strict objects) instead of the SDK's
// post-processing that closes every object inside an intersection separately.
export function agentToolSchema<S extends z.ZodType>(schema: S) {
  return Object.assign(jsonSchema<z.infer<S>>(
    () => z.toJSONSchema(schema, {io: "input", target: "draft-7"}) as JSONSchema7,
    { validate: async (value) => {
      const parsed = await schema.safeParseAsync(value);
      return parsed.success ? {success: true, value: parsed.data} : {success: false, error: parsed.error};
    } },
  ), {safeParse: (value: unknown) => schema.safeParse(value)});
}

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

function requiresObject(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const schema = value as Record<string, unknown>;
  if (schema.type === "object") return true;
  if (Array.isArray(schema.allOf) && schema.allOf.some(requiresObject)) return true;
  for (const key of ["anyOf", "oneOf"]) {
    const branches = schema[key];
    if (Array.isArray(branches) && branches.length > 0 && branches.every(requiresObject)) return true;
  }
  return false;
}

// DeepSeek rejects function parameters with an implicit root object type (as
// produced by Zod intersections/discriminated unions). Make only that already
// implied constraint explicit; retain all branch validation and runtime Zod.
export function agentToolInputSchema(value: unknown): Record<string, unknown> {
  if (!requiresObject(value)) throw new Error("Agent tool parameters must describe an object");
  return { ...compactAgentToolSchema(value) as Record<string, unknown>, type: "object" };
}
