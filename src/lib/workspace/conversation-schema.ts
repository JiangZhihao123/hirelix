import { clarificationSchema } from "./conversation-questions";
import { reminderActionSchema } from "./reminders";
import { z } from "zod";
import { MAX_CONVERSATION_FILES } from "./attachments";
import { memoryChangeSchema } from "./memories";
import { assistantWorkSchema } from "./assistant-work";
export const planSchema = z.object({
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
export const replySchema = z.object({
  answer: z.string().min(1).max(25000),
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
          "update_role_brief",
          "add_record",
          "update_sharing_permission",
          "submission",
          "search_update",
        ]),
        title: z.string().max(300),
        direct_save_quote: z.string().max(1000).nullable().default(null),
        role_ref: z.string().nullable(),
        person_ref: z.string().nullable(),
        attachment_ref: z.string().nullable(),
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
