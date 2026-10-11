import { z } from "zod";
import { roleInput } from "./types";

// API defaults are useful for forms, but unsafe for an agent command: omitted
// fields must not silently erase a reviewed brief. Null means no brief change.
const fields = roleInput.shape.brief.unwrap().shape;
export const agentRoleBrief = z.strictObject({
  priorities: fields.priorities.unwrap(),
  flexible: fields.flexible.unwrap(),
  unknowns: fields.unknowns.unwrap(),
});
