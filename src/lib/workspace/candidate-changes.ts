import { z } from "zod";
import { personInput, type PersonInput } from "./types";

// Null means unchanged; empty strings/arrays explicitly clear a field. Never use
// profile defaults to interpret a partial update, which would erase other facts.
const shape = personInput.shape;
const profile = shape.profile.unwrap().shape;
export const candidateChangesSchema = z.object({
  name: shape.name.nullable().default(null),
  headline: shape.headline.nullable().default(null),
  location: shape.location.nullable().default(null),
  email: shape.email.nullable().default(null),
  phone: shape.phone.nullable().default(null),
  skills: shape.skills.nullable().default(null),
  profile_url: shape.profile_url.nullable().default(null),
  note: shape.note.nullable().default(null),
  summary: profile.summary.nullable().default(null),
  experience: profile.experience.nullable().default(null),
  education: profile.education.nullable().default(null),
  languages: profile.languages.nullable().default(null),
  work_preferences: profile.work_preferences.nullable().default(null),
});
export function applyCandidateChanges(prior: PersonInput | null, value: unknown): PersonInput {
  const changes = candidateChangesSchema.parse(value);
  const current = prior || personInput.parse({name: changes.name});
  const next = {...current, profile: {...current.profile}};
  for (const key of ["name", "headline", "location", "email", "phone", "skills", "profile_url", "note"] as const) {
    if (changes[key] !== null) Object.assign(next, {[key]: changes[key]});
  }
  for (const key of ["summary", "experience", "education", "languages", "work_preferences"] as const) {
    if (changes[key] !== null) Object.assign(next.profile, {[key]: changes[key]});
  }
  return personInput.parse(next);
}
