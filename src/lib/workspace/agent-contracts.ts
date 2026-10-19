import { z } from "zod";
import { roleInput } from "./types";
import { roleChangesSchema } from "./conversation-schema";

// API defaults are useful for forms, but unsafe for an agent command: omitted
// fields must not silently erase a reviewed brief. Null means no brief change.
const fields = roleInput.shape.brief.unwrap().shape;
export const agentRoleBrief = z.strictObject({
  priorities: fields.priorities.unwrap().describe("Requirements explicitly supplied by the client or recruiter. Preserve their scope; do not add conventional duties or inferred must-haves."),
  flexible: fields.flexible.unwrap().describe("Only requirements explicitly stated to be negotiable or optional. Use [] when none are supplied. Unspecified or not excluded does not mean flexible."),
  unknowns: fields.unknowns.unwrap().describe("Material unanswered questions, clearly distinct from confirmed requirements or agreed exceptions."),
});

// A brief-only revision has no contact/title/status patch. Accept that absence
// without making the agent fabricate an empty details update.
export const agentRoleChanges = roleChangesSchema.nullable().default(null).describe(
  "Optional title, client contact or status changes. Null or omitted means preserve all current details. Use an object only for fields the user actually changed.",
);

// Structural repair must not rewrite or add factual scalar values. Empty
// containers may replace null; malformed JSON may only change punctuation.
export function decodeToolInput(text: string): unknown {
  let value: unknown = JSON.parse(text);
  // Some providers double-encode an otherwise valid tool object. Removing the
  // JSON string envelope changes representation, never its fields or values.
  for (let depth = 0; depth < 2 && typeof value === "string"; depth++) value = JSON.parse(value);
  return value;
}

export function preservesToolInputFacts(original: string, repaired: unknown) {
  const scalars = (value: unknown, path: Array<string | number> = []): Array<[string, unknown]> => {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value.flatMap((item, index) => scalars(item, [...path, index]));
    if (typeof value === "object") return Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, item]) => scalars(item, [...path, key]));
    return [[JSON.stringify(path), value]];
  };
  try {
    return JSON.stringify(scalars(decodeToolInput(original))) === JSON.stringify(scalars(repaired));
  } catch {
    // Compare JSON literals, including keys, in order. This permits a missing
    // comma/bracket repair but cannot introduce or substitute source text.
    const tokens = (text: string) => (text.match(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g) || []).map(token => JSON.parse(token));
    try { return JSON.stringify(tokens(original)) === JSON.stringify(tokens(JSON.stringify(repaired))); }
    catch { return false; }
  }
}
