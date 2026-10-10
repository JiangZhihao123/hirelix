import { markSubmitted } from "./deliverables";
import { roleChangesSchema } from "./conversation-schema";
import { quotedAuthorization } from "./assistant-work";
import { applyCandidateChanges } from "./candidate-changes";
import { createPerson, updatePerson } from "./people";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { owned, rows, json, WorkspaceError, type Runner } from "./database";
import { createRole, updateRole, updateRelationship, linkPerson } from "./roles";
import { addRecord } from "./records";
import { recordInput, roleInput, type Message, type Role, type RoleCandidate, type Person } from "./types";
import type { AssistantAction, AssistantMeta } from "./conversations";

export async function acceptAction(
  userId: string,
  conversationId: string,
  messageId: string,
  actionId: string,
  value: unknown,
) {
  return db.transaction(async (tx) => {
    await owned(userId, "conversation", conversationId, tx);
    const [message] = await rows<Message>(
      sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${userId}::uuid AND conversation_id=${conversationId}::uuid AND id=${messageId}::uuid AND role='assistant' FOR UPDATE`,
      tx,
    );
    if (!message) throw new WorkspaceError("This reply was not found", 404);
    const metadata = message.metadata as AssistantMeta,
      action = metadata.actions?.find((a) => a.id === actionId);
    if (!action)
      throw new WorkspaceError("This proposed action was not found", 404);
    if (action.status === "saved") return { href: action.href };
    await applyAssistantAction(userId, conversationId, action, value, tx);
    await tx.execute(
      sql`UPDATE hirelix_agent_messages SET metadata=${json(metadata)} WHERE user_id=${userId}::uuid AND id=${message.id}::uuid`,
    );
    return { href: action.href };
  });
}

export async function applyAssistantAction(userId: string, conversationId: string, action: AssistantAction, value: unknown, tx: Runner) {
  if (action.kind === "create_candidate" || action.kind === "update_candidate") {
    // Source and patch were prepared together. An acceptance request cannot
    // replace the reviewed patch or rebind its source to another candidate.
    const prior = action.kind === "update_candidate"
      ? await owned<Person>(userId, "person", z.uuid().parse(action.person_id), tx, true) : null;
    const input = applyCandidateChanges(prior, action.fields.changes);
    if (!prior) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`candidate-create:${userId}`},0))`);
      const matches = await rows(sql`SELECT id FROM hirelix_agent_people WHERE user_id=${userId}::uuid AND (lower(trim(name))=lower(trim(${input.name})) OR (${!!input.email} AND lower(email)=lower(${input.email})) OR (${!!input.profile_url} AND profile_url=${input.profile_url})) LIMIT 1`, tx);
      if (matches.length && !quotedAuthorization(String(action.fields.authorization_request || ""), typeof action.fields.separate_candidate_quote === "string" ? action.fields.separate_candidate_quote : null)) throw new WorkspaceError("A candidate with this name or contact already exists. Clarify whether to update that profile or save a different person.", 409);
    }
    const person = prior
      ? await updatePerson(userId, prior.id, input, z.number().int().positive().parse(action.fields.expected_version), tx)
      : await createPerson(userId, input, tx);
    await addRecord(userId, {
      person_id: person.id, kind: "profile", title: prior ? "Candidate profile update" : "Candidate profile source",
      content: z.string().parse(action.fields.source_content), file_id: action.fields.source_file_id || null,
      details: {source_message_id: action.fields.source_message_id, person_version: person.version},
    }, tx);
    action.person_id = person.id;
    action.href = `/app/candidates?person=${person.id}`;
    await tx.execute(sql`UPDATE hirelix_private_conversations SET person_id=coalesce(person_id,${person.id}::uuid) WHERE user_id=${userId}::uuid AND id=${conversationId}::uuid`);
  } else if (action.kind === "create_role") {
    const source = action.fields.source_file_id ? {
      file_id: z.uuid().parse(action.fields.source_file_id),
      title: String(action.fields.source_file_name || "Original job description"),
    } : undefined;
    const role = await createRole(userId, roleInput.parse(value), tx, source);
    // Keep the reviewed notes and their source associations in the same
    // transaction as the new role. Browser-supplied fields cannot rebind them.
    const records = z.array(recordInput).parse(action.fields.role_records ?? []);
    for (const record of records) {
      await addRecord(userId, { ...record, role_id: role.id, person_id: null }, tx);
    }
    action.href = `/app/roles/${role.id}`;
    action.role_id = role.id;
    await tx.execute(
      sql`UPDATE hirelix_private_conversations SET role_id=coalesce(role_id,${role.id}::uuid),updated_at=now() WHERE user_id=${userId}::uuid AND id=${conversationId}::uuid`,
    );
  } else if (action.kind === "record_submission") {
    const document = await markSubmitted(userId, z.uuid().parse(action.fields.document_id), action.fields, tx);
    action.href = document.kind === "submission" ? `/app/submissions/${document.id}` : `/app/roles/${document.role_id}/updates/${document.id}`;
  } else if (action.kind === "update_role_details") {
    const prior = await owned<Role>(userId, "role", z.uuid().parse(action.role_id), tx, true);
    const changes = roleChangesSchema.parse(action.fields.changes);
    const role = await updateRole(userId, prior.id, {
      ...prior, title: changes.title ?? prior.title,
      client_name: changes.client_name ?? prior.client_name, status: changes.status ?? prior.status,
      client_contact: {...prior.client_contact, ...Object.fromEntries(Object.entries(changes.client_contact ?? {}).filter(([, value]) => value !== null))},
    }, z.number().int().positive().parse(action.fields.expected_version), tx);
    await addRecord(userId, {role_id: role.id, kind: "note", title: "Role details update",
      content: z.string().parse(action.fields.source_content), details: {source_message_id: action.fields.source_message_id, role_version: role.version}}, tx);
    action.href = `/app/roles/${role.id}`;
  } else if (action.kind === "update_role_brief") {
    if (!action.role_id)
      throw new WorkspaceError("This role is unavailable", 404);
    const input = z.object({
      brief: roleInput.shape.brief,
      occurred_at: z.iso.datetime({ offset: true }).nullable().default(null),
    }).parse(value);
    const prior = await owned<Role>(userId, "role", action.role_id, tx, true);
    const changes = roleChangesSchema.parse(action.fields.changes ?? {});
    const role = await updateRole(
      userId,
      prior.id,
      { ...prior, brief: input.brief, title: changes.title ?? prior.title,
        client_name: changes.client_name ?? prior.client_name, status: changes.status ?? prior.status,
        client_contact: {...prior.client_contact, ...Object.fromEntries(Object.entries(changes.client_contact ?? {}).filter(([, value]) => value !== null))} },
      z.number().int().positive().parse(action.fields.expected_version),
      tx,
    );
    await addRecord(
      userId,
      {
        role_id: role.id,
        file_id: action.fields.source_file_id || null,
        kind: "feedback",
        title: "Client requirements feedback",
        content: z.string().parse(action.fields.feedback),
        occurred_at: input.occurred_at,
        details: {
          source_message_id: action.fields.source_message_id,
          role_version: role.version,
        },
      },
      tx,
    );
    action.href = `/app/roles/${role.id}`;
  } else if (action.kind === "add_record") {
    const input = recordInput.parse(value);
    if (
      input.person_id !== action.person_id ||
      input.role_id !== action.role_id ||
      input.file_id !== (action.fields.file_id || null)
    )
      throw new WorkspaceError(
        "The record association changed. Start a new record from the correct profile.",
      );
    const record = await addRecord(userId, input, tx);
    action.href = record.person_id
      ? `/app/candidates?person=${record.person_id}&record=${record.id}`
      : `/app/roles/${record.role_id}?tab=activity&record=${record.id}`;
  } else if (action.kind === "update_sharing_permission" || action.kind === "update_relationship") {
    const input = recordInput.parse(action.fields);
    if (
      !action.role_id || !action.person_id ||
      input.role_id !== action.role_id ||
      input.person_id !== action.person_id ||
      input.file_id !== (action.fields.file_id || null)
    )
      throw new WorkspaceError("The candidate and role association changed.");
    // Serialize missing-link creation as well as updates. A preview of an absent
    // association must not overwrite one created while the user was reviewing.
    await owned(userId, "role", action.role_id, tx, true);
    await owned(userId, "person", action.person_id, tx);
    const [current] = await rows<RoleCandidate>(sql`SELECT * FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND role_id=${action.role_id}::uuid AND person_id=${action.person_id}::uuid FOR UPDATE`, tx);
    if (action.fields.relationship_id ? current?.id !== action.fields.relationship_id || current.version !== action.fields.expected_version : !!current)
      throw new WorkspaceError("This candidate relationship changed. Ask your assistant to use the latest information.", 409);
    const relationship = current ?? await linkPerson(userId, action.role_id, action.person_id, tx);
    const permission = action.kind === "update_sharing_permission"
      ? z.enum(["confirmed", "declined"]).parse(action.fields.permission) : relationship.permission;
    const changes = z.object({interest: z.string().max(5000).nullable().optional(), notes: z.string().max(20000).nullable().optional()}).parse(action.fields.changes ?? {});
    const record = await addRecord(userId, {
      ...input,
      details: { ...input.details, source_message_id: action.fields.source_message_id },
    }, tx);
    await updateRelationship(userId, action.role_id, action.person_id, {
      permission,
      permission_record_id: action.kind === "update_sharing_permission" ? record.id : relationship.permission_record_id,
      interest: changes.interest ?? relationship.interest,
      notes: changes.notes ?? relationship.notes,
      expected_version: relationship.version,
    }, tx);
    action.href = `/app/roles/${action.role_id}`;
  } else
    throw new WorkspaceError(
      "Open the document preparation page to continue",
    );
  action.status = "saved";

}
