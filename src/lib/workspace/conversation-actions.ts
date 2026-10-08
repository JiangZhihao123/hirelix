import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { owned, rows, json, WorkspaceError, type Runner } from "./database";
import { createRole, updateRole, updateRelationship } from "./roles";
import { addRecord } from "./records";
import { recordInput, roleInput, type Message, type Role, type RoleCandidate } from "./types";
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
  if (action.kind === "create_role") {
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
  } else if (action.kind === "update_role_brief") {
    if (!action.role_id)
      throw new WorkspaceError("This role is unavailable", 404);
    const input = z.object({
      brief: roleInput.shape.brief,
      occurred_at: z.iso.datetime({ offset: true }).nullable().default(null),
    }).parse(value);
    const prior = await owned<Role>(userId, "role", action.role_id, tx, true);
    const role = await updateRole(
      userId,
      prior.id,
      { ...prior, brief: input.brief },
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
  } else if (action.kind === "update_sharing_permission") {
    const input = recordInput.parse(value);
    if (
      !action.role_id || !action.person_id ||
      input.role_id !== action.role_id ||
      input.person_id !== action.person_id ||
      input.file_id !== (action.fields.file_id || null)
    )
      throw new WorkspaceError("The candidate and role association changed.");
    const permission = z.enum(["confirmed", "declined"]).parse(action.fields.permission);
    const relationship = await owned<RoleCandidate>(
      userId,
      "role_candidate",
      z.uuid().parse(action.fields.relationship_id),
      tx,
      true,
    );
    if (relationship.role_id !== action.role_id || relationship.person_id !== action.person_id)
      throw new WorkspaceError("This candidate is no longer linked to the selected role.", 409);
    const record = await addRecord(userId, {
      ...input,
      details: { ...input.details, source_message_id: action.fields.source_message_id },
    }, tx);
    await updateRelationship(userId, action.role_id, action.person_id, {
      permission,
      permission_record_id: record.id,
      interest: relationship.interest,
      notes: relationship.notes,
      expected_version: z.number().int().positive().parse(action.fields.expected_version),
    }, tx);
    action.href = `/app/roles/${action.role_id}`;
  } else
    throw new WorkspaceError(
      "Open the document preparation page to continue",
    );
  action.status = "saved";

}
