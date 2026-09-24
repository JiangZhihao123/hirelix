import { z } from "zod";

export const idSchema = z.uuid();
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).default("");
export const webUrl = z.union([
  z.literal(""),
  z
    .url()
    .refine(
      (url) => ["https:", "http:"].includes(new URL(url).protocol),
      "Use an HTTP or HTTPS URL",
    ),
]);
export const personInput = z.object({
  name: text(200).min(1),
  headline: optionalText(500),
  location: optionalText(250),
  email: z.union([z.literal(""), z.email()]).default(""),
  phone: optionalText(100),
  skills: z.array(text(100)).max(100).default([]),
  profile_url: webUrl.default(""),
  note: z.string().max(100000).default(""),
  profile: z
    .object({
      summary: optionalText(10000),
      experience: z
        .array(
          z.object({
            company: text(300),
            title: text(300),
            dates: optionalText(100),
            description: optionalText(10000),
          }),
        )
        .max(100)
        .default([]),
      education: z.array(text(2000)).max(100).default([]),
      languages: z.array(text(100)).max(50).default([]),
      work_preferences: optionalText(3000),
    })
    .default({
      summary: "",
      experience: [],
      education: [],
      languages: [],
      work_preferences: "",
    }),
});
export const roleInput = z.object({
  title: text(300).min(1),
  client_name: text(300).min(1),
  jd_text: z.string().min(1).max(100000),
  brief: z
    .object({
      priorities: z.array(text(2000)).max(30).default([]),
      flexible: z.array(text(2000)).max(30).default([]),
      unknowns: z.array(text(2000)).max(30).default([]),
    })
    .default({ priorities: [], flexible: [], unknowns: [] }),
  client_contact: z
    .object({
      name: optionalText(200),
      email: z.union([z.literal(""), z.email()]).default(""),
      cooperation: optionalText(200),
      location: optionalText(200),
      compensation: optionalText(1000),
    })
    .default({
      name: "",
      email: "",
      cooperation: "",
      location: "",
      compensation: "",
    }),
  status: z.enum(["active", "paused", "closed"]).default("active"),
});
export const recordInput = z.object({
  person_id: idSchema.nullable().default(null),
  role_id: idSchema.nullable().default(null),
  file_id: idSchema.nullable().default(null),
  kind: z.enum([
    "note",
    "call",
    "email",
    "feedback",
    "cv",
    "profile",
    "jd",
    "event",
  ]),
  title: text(500).min(1),
  content: z.string().max(500000),
  source_url: webUrl.default(""),
  occurred_at: z.iso.datetime({ offset: true }).nullable().default(null),
  details: z.record(z.string(), z.unknown()).default({}),
});
export type PersonInput = z.infer<typeof personInput>;
export type RoleInput = z.infer<typeof roleInput>;
export type RecordInput = z.infer<typeof recordInput>;
export type Stamp = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  version: number;
};
export type Person = PersonInput &
  Stamp & {
    source_candidate_id?: string | null;
    source_search_id?: string | null;
    source_evidence?: unknown;
  };
export type Role = RoleInput & Stamp & { source_search_id: string | null };
export type SourceRecord = RecordInput & Stamp;
export type RoleCandidate = Stamp & {
  role_id: string;
  person_id: string;
  assessment: Record<string, unknown>;
  assessed_role_version: number | null;
  permission: "unknown" | "confirmed" | "declined";
  permission_record_id: string | null;
  interest: string;
  notes: string;
  person?: Person;
};
export type Deliverable = Stamp & {
  role_id: string;
  kind: "submission" | "search_update" | "legacy";
  title: string;
  content: string;
  person_ids: string[];
  record_ids: string[];
  file_ids: string[];
  source_snapshot: Record<string, unknown>;
  period_start: string | null;
  period_end: string | null;
  status: "draft" | "submitted";
  submitted_at: string | null;
  submission_note: string;
};
export type JobKind =
  | "chat"
  | "import"
  | "index"
  | "assessment"
  | "deliverable"
  | "revision"
  | "brief_proposal";
export type Job = {
  id: string;
  user_id: string;
  kind: JobKind;
  request_key: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  progress: string;
  attempts: number;
  lease_token: string | null;
  lease_until: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};
export type Conversation = {
  id: string;
  user_id: string;
  title: string;
  role_id: string | null;
  person_id: string | null;
  created_at: string;
  updated_at: string;
};
export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  conversation_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
};
export type Schedule = {
  id: string;
  user_id: string;
  role_id: string;
  enabled: boolean;
  timezone: string;
  weekday: number;
  local_time: string;
  interval_weeks: 1 | 2;
  next_run_at: string;
  last_period_end: string | null;
  only_when_changed: boolean;
  last_record_digest: string | null;
};
export type ImportRow = {
  id: string;
  user_id: string;
  job_id: string;
  row_number: number;
  file_id: string | null;
  raw_text: string;
  extracted: Partial<PersonInput>;
  matches: Array<{ id: string; name: string; reason: string }>;
  action: "review" | "add" | "merge" | "skip";
  target_person_id: string | null;
  result_person_id: string | null;
  status: "review" | "saved" | "skipped" | "error";
  error: string | null;
};
