import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { enqueue, json, owned, rows, WorkspaceError } from "./database";
import { conversationInput } from "./conversations";
import { saveFile, type PrivateFile } from "./files";
import { MAX_CONVERSATION_FILES, type ConversationAttachment } from "./attachments";
import type { Job, Conversation, Deliverable, Message } from "./types";
import { consumeQuestion } from "./conversation-questions";
export async function sendMessage(
  userId: string,
  value: unknown,
  file?: { name: string; type: string; bytes: Uint8Array },
) {
  const input = conversationInput.parse(value);
  if (!input.message && !file && !input.file_ids.length)
    throw new WorkspaceError("Write a message or attach a file");
  const attachmentHash = file
    ? createHash("sha256").update(file.bytes).digest("hex")
    : null;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${userId + input.request_key},0))`,
    );
    const [existing] = await rows<Job>(
      sql`SELECT * FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND request_key=${input.request_key}`,
      tx,
    );
    if (existing) {
      const [same] = await rows<{ same: boolean }>(
        sql`SELECT payload->'request'=${json(input)} AND payload->>'attachment_sha256' IS NOT DISTINCT FROM ${attachmentHash} AS same FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND id=${existing.id}::uuid`,
        tx,
      );
      if (existing.kind !== "chat" || !same.same)
        throw new WorkspaceError(
          "This request key was already used for another message",
          409,
        );
      return {
        conversation_id: z.uuid().parse(existing.payload.conversation_id),
        job: existing,
      };
    }
    const attachments: ConversationAttachment[] = [];
    for (const fileId of new Set(input.file_ids)) {
      const [saved] = await rows<PrivateFile>(sql`SELECT id,name,byte_size FROM hirelix_private_files WHERE user_id=${userId}::uuid AND id=${fileId}::uuid`, tx);
      if (!saved) throw new WorkspaceError("This file was not found", 404);
      attachments.push({ file_id: saved.id, name: saved.name, size: saved.byte_size });
    }
    if (file) {
      const saved = await saveFile(userId, file, tx);
      attachments.push({ file_id: saved.id, name: saved.name, size: saved.byte_size });
    }
    if (attachments.length > MAX_CONVERSATION_FILES) throw new WorkspaceError("Attach up to 20 files per message");
    const document = input.document_id ? await owned<Deliverable>(userId, "deliverable", input.document_id, tx) : null;
    if (input.question_message_id && !input.conversation_id) throw new WorkspaceError("Choose the original conversation", 409);
    if (document && input.conversation_id) throw new WorkspaceError("Start a document conversation from the saved draft");
    if (document && input.role_id && document.role_id !== input.role_id) throw new WorkspaceError("This document belongs to another role", 409);
    const resolvedRoleId = document?.role_id || input.role_id;
    if (input.role_id) await owned(userId, "role", input.role_id, tx);
    if (input.person_id) await owned(userId, "person", input.person_id, tx);
    let conversation: Conversation;
    if (input.conversation_id) {
      conversation = await owned<Conversation>(
        userId,
        "conversation",
        input.conversation_id,
        tx,
        true,
      );
      const [pending] = await rows(
        sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='chat' AND payload->>'conversation_id'=${conversation.id} AND status IN ('queued','running') LIMIT 1`,
        tx,
      );
      if (pending)
        throw new WorkspaceError(
          "Finish or retry the previous reply before sending another message",
          409,
        );
    } else {
      [conversation] = await rows<Conversation>(
        sql`INSERT INTO hirelix_private_conversations(user_id,title,role_id,person_id) VALUES(${userId}::uuid,${(input.message || attachments.map((item) => item.name).join(", ") || "New conversation").slice(0, 100)},${resolvedRoleId}::uuid,${input.person_id}::uuid) RETURNING *`,
        tx,
      );
    }
    if (input.work_document_id) {
      await owned(userId, "deliverable", input.work_document_id, tx);
      const linked = await rows(sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='deliverable' AND payload->>'conversation_id'=${conversation.id} AND result->>'deliverable_id'=${input.work_document_id}`, tx);
      const original = await rows(sql`SELECT id FROM hirelix_agent_messages WHERE user_id=${userId}::uuid AND conversation_id=${conversation.id}::uuid AND metadata->>'document_id'=${input.work_document_id}`, tx);
      if (!linked.length && !original.length) throw new WorkspaceError("Choose a document from this conversation", 409);
    }
    if (input.email_confirmation_message_id) {
      const [preview] = await rows<Message>(sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${userId}::uuid AND conversation_id=${conversation.id}::uuid AND id=${input.email_confirmation_message_id}::uuid AND role='assistant' AND metadata ? 'email'`, tx);
      if (!preview || !["review","sending","sent","unknown"].includes((preview.metadata.email as {status:string}).status)) throw new WorkspaceError("This email preview is no longer available",409);
    }
    const [message] = await rows<Message>(
      sql`INSERT INTO hirelix_agent_messages(user_id,role,content,conversation_id,metadata) VALUES(${userId}::uuid,'user',${input.message},${conversation.id}::uuid,${json({ role_id: conversation.role_id, person_id: conversation.person_id, ...(input.work_document_id ? { work_document_id: input.work_document_id } : {}), ...(document ? { document_id: document.id } : {}), ...(attachments.length ? { attachments } : {}) })}) RETURNING *`,
      tx,
    );
    const continuation = await consumeQuestion(userId, conversation.id, input.question_message_id, input.message, message.id, tx);
    if (continuation) await tx.execute(sql`UPDATE hirelix_agent_messages SET metadata=metadata || ${json({continuation})} WHERE id=${message.id}::uuid AND user_id=${userId}::uuid`);
    await tx.execute(
      sql`UPDATE hirelix_private_conversations SET updated_at=now() WHERE id=${conversation.id}::uuid AND user_id=${userId}::uuid`,
    );
    const job = await enqueue(
      userId,
      "chat",
      input.request_key,
      {
        conversation_id: conversation.id,
        message_id: message.id,
        request: input,
        attachment_sha256: attachmentHash,
      },
      tx,
    );
    return { conversation_id: conversation.id, job };
  });
}
