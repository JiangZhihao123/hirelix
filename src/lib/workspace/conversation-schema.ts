import { roleInput } from "./types";
import { candidateChangesSchema } from "./candidate-changes";
import { emailPlanSchema } from "./email-contract";
import { clarificationSchema } from "./conversation-questions";
import { reminderActionSchema } from "./reminders";
import { z } from "zod";
import { MAX_CONVERSATION_FILES } from "./attachments";
import { memoryChangeSchema } from "./memories";
import { assistantWorkSchema, quotedAuthorization } from "./assistant-work";
export const planSchema = z.object({
  email: emailPlanSchema,
  conversation_title: z.string().trim().min(1).max(60),
  preview_changes: z.boolean().default(false),
  document_revision_instructions: z.string().trim().min(1).max(6000).nullable(),
  memory_changes: z.array(memoryChangeSchema).max(5),
  role_query: z.string().max(4000).nullable().default(null),
  candidate_query: z.string().max(4000).nullable(),
  candidate_names: z.array(z.string().trim().min(1).max(300)).max(20),
  lookup: z.enum(["exact", "semantic", "none"]),
  role_refs: z.array(z.string()).max(5),
  greeting_or_open_request: z.boolean(),
  greeting_only: z.boolean(),
  reply_language: z.enum(["en", "zh"]),
  follow_up_needed: z.boolean(),
  attachments: z.array(z.object({
    ref: z.string(),
    attachment_kind: z.enum(["candidate_cv", "candidate_list", "job_description", "conversation_note", "other", "unreadable"]),
    prepare_candidate_draft: z.boolean(),
    save_new_candidates: z.boolean(),
    candidate_evidence_quote: z.string().max(500).nullable(),
  })).max(MAX_CONVERSATION_FILES),
  may_propose_role_creation: z.boolean(),
  may_propose_record: z.boolean(),
  sharing_permission_reported: z.boolean(),
});
const roleDraft = z.object({
  title: z.string(),
  client_name: z.string(),
  jd_text: z.string(),
  brief: z.object({
    priorities: z.array(z.string()),
    flexible: z.array(z.string()),
    unknowns: z.array(z.string()),
  }),
});
const contactFields = roleInput.shape.client_contact.unwrap().shape;
export const roleChangesSchema = z.object({
  title: roleInput.shape.title.nullable().default(null),
  client_name: roleInput.shape.client_name.nullable().default(null),
  status: roleInput.shape.status.nullable().default(null),
  client_contact: z.object({
    name: contactFields.name.nullable().default(null),
    email: contactFields.email.nullable().default(null),
    cooperation: contactFields.cooperation.nullable().default(null),
    location: contactFields.location.nullable().default(null),
    compensation: contactFields.compensation.nullable().default(null),
  }).nullable().default(null),
});
export const replySchema = z.object({
  answer: z.string().min(1).max(25000),
  export_formats: z.array(z.enum(["pdf", "docx"])).max(2).default([]),
  clarification: clarificationSchema.nullable().default(null),
  reminders: z.array(reminderActionSchema).max(5).default([]),
  follow_up: z.string().max(500).nullable(),
  work: z.array(assistantWorkSchema).max(5).default([]),
  source_refs: z.array(z.string()).max(30),
  actions: z
    .array(
      z.object({
        kind: z.enum([
          "create_role",
          "create_candidate",
          "update_candidate",
          "update_role_brief",
          "update_role_details",
          "add_record",
          "update_sharing_permission",
          "update_relationship",
          "record_submission",
          "submission",
          "search_update",
        ]),
        title: z.string().max(300),
        direct_save_quote: z.string().max(1000).nullable().default(null),
        role_ref: z.string().nullable(),
        person_ref: z.string().nullable(),
        attachment_ref: z.string().nullable(),
        separate_candidate_quote: z.string().max(1000).nullable().default(null),
        candidate_changes: candidateChangesSchema.nullable().default(null),
        relationship_changes: z.object({interest: z.string().max(5000).nullable(), notes: z.string().max(20000).nullable()}).nullable().default(null),
        submission: z.object({submitted_at: z.iso.datetime({offset: true}), submission_note: z.string().trim().min(1).max(10000)}).nullable().default(null),
        role_changes: roleChangesSchema.nullable().default(null),
        role_draft: roleDraft.nullable(),
        role_records: z.array(z.object({
          attachment_ref: z.string().nullable(),
          kind: z.enum(["note", "call", "email", "feedback"]),
          title: z.string(),
          content: z.string(),
          occurred_at: z.iso.datetime({ offset: true }).nullable(),
        })).max(MAX_CONVERSATION_FILES).default([]),
        record: z
          .object({
            kind: z.enum(["note", "call", "email", "feedback"]),
            title: z.string(),
            content: z.string(),
            occurred_at: z.iso.datetime({ offset: true }).nullable(),
          })
          .nullable(),
        sharing_permission: z.enum(["confirmed", "declined"]).nullable(),
      }).superRefine((action, ctx) => {
        if (action.kind === "update_relationship" || action.kind === "update_sharing_permission") {
          for (const field of ["role_ref", "person_ref"] as const) if (!action[field])
            ctx.addIssue({code: "custom", path: [field], message: "A relationship action requires the exact candidate and role references. Ask a clarification if either is ambiguous."});
          if (action.kind === "update_sharing_permission" && (!action.record || !action.sharing_permission))
            ctx.addIssue({code: "custom", path: ["record"], message: "A permission change requires its reported decision and evidence record."});
        }
      }),
    )
    .max(MAX_CONVERSATION_FILES),
});
export const openRequestReplySchema = replySchema.extend({
  answer: z.string().min(1).max(600),
  follow_up: z.string().max(180).nullable(),
  actions: replySchema.shape.actions.max(1),
});
export const sharingPermissionProposalSchema = z.object({
  actions: z.array(z.object({
    kind: z.literal("update_sharing_permission"),
    title: z.string().max(300),
    direct_save_quote: z.string().max(1000).nullable().default(null),
    role_ref: z.string(),
    person_ref: z.string(),
    attachment_ref: z.null(),
    separate_candidate_quote: z.null().default(null),
    candidate_changes: z.null().default(null),
    relationship_changes: z.null().default(null),
    submission: z.null().default(null),
    role_changes: z.null().default(null),
    role_draft: z.null(),
    role_records: z.array(z.never()).max(0).default([]),
    record: replySchema.shape.actions.element.shape.record.unwrap(),
    sharing_permission: z.enum(["confirmed", "declined"]),
  })).max(5),
  clarification: z.string().max(500).nullable(),
});

// Restrict model-selected IDs to the actual evidence catalog, including empty catalogs.
export function groundedReplySchema(base: typeof replySchema, refs: { roles: string[]; people: string[]; records: string[] }) {
  const reference = (values: string[]) => values.length ? z.enum(values as [string, ...string[]]) : z.never();
  return base.extend({ work: z.array(assistantWorkSchema.extend({
    role_ref: reference(refs.roles),
    person_refs: z.array(reference(refs.people)).max(50),
    record_refs: z.array(reference(refs.records)).max(100),
  })).max(5).default([]) });
}

// Validate evidence before side effects, while structured() can still repair a
// model response. The commit layer independently keeps the same authorization gate.
export function authorizedReplySchema<T extends z.ZodType<z.infer<typeof replySchema>>>(base: T, request: string) {
  return base.superRefine((reply, ctx) => {
    const check = (quote: string | null, path: (string | number)[]) => {
      if (!quotedAuthorization(request, quote)) ctx.addIssue({
        code: "custom", path,
        message: "Copy one exact contiguous authorization span from the current user request, including its original instruction when continuing after clarification. Do not paraphrase or join separate spans.",
      });
    };
    reply.reminders.forEach((item, i) => check(item.authorization_quote, ["reminders", i, "authorization_quote"]));
    reply.work.forEach((item, i) => {
      check(item.authorization_quote, ["work", i, "authorization_quote"]);
      if (item.source_authorization_quote !== null || item.record_refs.length || item.schedule?.include_role_records || item.schedule?.include_candidate_records)
        check(item.source_authorization_quote, ["work", i, "source_authorization_quote"]);
    });
    reply.actions.forEach((item, i) => {
      if (item.direct_save_quote !== null) check(item.direct_save_quote, ["actions", i, "direct_save_quote"]);
      if (item.separate_candidate_quote !== null) check(item.separate_candidate_quote, ["actions", i, "separate_candidate_quote"]);
    });
  });
}
