import { z } from "zod";
import { roleInput } from "./types";

// API defaults are useful for forms, but unsafe for an agent command: omitted
// fields must not silently erase a reviewed brief. Null means no brief change.
const fields = roleInput.shape.brief.unwrap().shape;
export const agentRoleBrief = z.strictObject({
  priorities: fields.priorities.unwrap().describe("Requirements explicitly supplied by the client or recruiter. Preserve their scope; do not add conventional duties or inferred must-haves."),
  flexible: fields.flexible.unwrap().describe("Only requirements explicitly stated to be negotiable or optional. Use [] when none are supplied. Unspecified or not excluded does not mean flexible."),
  unknowns: fields.unknowns.unwrap().describe("Material unanswered questions, clearly distinct from confirmed requirements or agreed exceptions."),
});
