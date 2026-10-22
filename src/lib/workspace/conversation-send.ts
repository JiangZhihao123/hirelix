import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { enqueue, expectVersion, json, owned, rows, WorkspaceError } from "./database";
import { conversationInput } from "./conversations";
import { saveFile, type PrivateFile } from "./files";
import { MAX_CONVERSATION_FILES, type ConversationAttachment } from "./attachments";
import type { Job, Conversation, Deliverable, Message, Person, Role } from "./types";
import { interruptConversation, nextConversationPriority } from "./conversation-control";
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
    const document = input.document_id ? await owned<Deliverable>(userId, "deliverable", input.document_id, tx, input.document_version !== undefined) : null;
    if (input.document_version !== undefined) {
      if (!document) throw new WorkspaceError("Choose the saved document for this request", 400);
      expectVersion(document.version, input.document_version);
    }
    if (input.question_message_id && !input.conversation_id) throw new WorkspaceError("Choose the original conversation", 409);
    if (document && input.conversation_id) throw new WorkspaceError("Start a document conversation from the saved draft");
    if (document && input.role_id && document.role_id !== input.role_id) throw new WorkspaceError("This document belongs to another role", 409);
    const resolvedRoleId = document?.role_id || input.role_id;
    if (input.role_id) await owned(userId, "role", input.role_id, tx);
    const candidateReferences = [];
    for (const candidateId of new Set([...input.candidate_ids, ...(input.person_id ? [input.person_id] : [])])) {
      const person = await owned<Person>(userId, "person", candidateId, tx);
      candidateReferences.push({ id: person.id, name: person.name });
    }
    let conversation: Conversation;
    if (input.conversation_id) {
      conversation = await owned<Conversation>(
        userId,
        "conversation",
        input.conversation_id,
        tx,
        true,
      );

    } else {
      [conversation] = await rows<Conversation>(
        sql`INSERT INTO hirelix_private_conversations(user_id,title,role_id,person_id) VALUES(${userId}::uuid,${(input.message || attachments.map((item) => item.name).join(", ") || "New conversation").slice(0, 100)},NULL,NULL) RETURNING *`,
        tx,
      );
    }
    if (input.resume_after_mailbox_message_id) {
      const [latest] = await rows<Message>(sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${userId}::uuid AND conversation_id=${conversation.id}::uuid ORDER BY created_at DESC,id DESC LIMIT 1`,tx);
      if (!latest || latest.id !== input.resume_after_mailbox_message_id || latest.role !== "assistant" || !latest.metadata.gmail || input.email_confirmation_message_id)
        throw new WorkspaceError("The conversation has moved on. Continue with your latest request instead.",409);
    }
    const previous = input.delivery === "immediate"
      ? await interruptConversation(userId, conversation.id, tx, false) : undefined;
    // The selected document can be retrieved from another conversation. The
    // account ownership boundary applies; its creation conversation does not.
    const viewed = input.viewed_source ? await owned<{title?:string;name?:string;version?:number}>(userId, input.viewed_source.kind, input.viewed_source.id, tx) : null;
    const viewedSource = viewed && input.viewed_source ? {...input.viewed_source,title:viewed.title || viewed.name,version:viewed.version} : null;
    const messageRoleId = viewedSource?.kind === "role" ? viewedSource.id : resolvedRoleId;
    const selectedRole = messageRoleId ? await owned<Role>(userId, "role", messageRoleId, tx) : null;
    const roleReference = selectedRole ? { id: selectedRole.id, title: selectedRole.title, client_name: selectedRole.client_name } : null;
    const roleReferences = [];
    for (const roleId of new Set([...(messageRoleId ? [messageRoleId] : []), ...input.role_ids])) {
      const role = await owned<Role>(userId, "role", roleId, tx);
      roleReferences.push({id: role.id, title: role.title, client_name: role.client_name});
    }
    const workDocumentId = input.work_document_id || (viewedSource?.kind === "deliverable" ? viewedSource.id : null);
    const workDocument = workDocumentId ? await owned<Deliverable>(userId, "deliverable", workDocumentId, tx) : null;
    const selectedDocument = workDocument || document;
    const documentReference = selectedDocument ? {id:selectedDocument.id, title:selectedDocument.title, version:selectedDocument.version, href:selectedDocument.kind === "search_update" ? `/app/roles/${selectedDocument.role_id}/updates/${selectedDocument.id}` : `/app/submissions/${selectedDocument.id}`} : null;
    if (input.email_confirmation_message_id) {
      const [preview] = await rows<Message>(sql`SELECT * FROM hirelix_agent_messages WHERE user_id=${userId}::uuid AND conversation_id=${conversation.id}::uuid AND id=${input.email_confirmation_message_id}::uuid AND role='assistant' AND metadata ? 'email'`, tx);
      if (!preview || !["review","sending","sent","unknown"].includes((preview.metadata.email as {status:string}).status)) throw new WorkspaceError("This email preview is no longer available",409);
    }
    const [message] = await rows<Message>(
      sql`INSERT INTO hirelix_agent_messages(user_id,role,content,conversation_id,metadata) VALUES(${userId}::uuid,'user',${input.message},${conversation.id}::uuid,${json({ delivery: "queued", ...(roleReference ? { role_id: roleReference.id, role_reference: roleReference } : {}), ...(roleReferences.length ? {role_references: roleReferences} : {}), ...(candidateReferences.length ? { candidate_references: candidateReferences } : {}), ...(viewedSource ? {viewed_source:viewedSource} : {}), ...(workDocument ? { work_document_id: workDocument.id, work_document_title: workDocument.title } : {}), ...(document ? { document_id: document.id } : {}), ...(documentReference ? {document_reference:documentReference} : {}), ...(attachments.length ? { attachments } : {}) })}) RETURNING *`,
      tx,
    );
    // Queueing must not answer a question yet: its message can still be edited or removed.
    const [pendingQuestion] = await rows<{id:string}>(sql`SELECT id FROM hirelix_agent_messages WHERE user_id=${userId}::uuid AND conversation_id=${conversation.id}::uuid AND role='assistant' AND metadata->'question'->>'status'='waiting' ORDER BY created_at DESC LIMIT 1`,tx);
    if(input.question_message_id && pendingQuestion?.id !== input.question_message_id) throw new WorkspaceError("This question has already been answered or cancelled. Reload the conversation.",409);
    if(pendingQuestion) {
      const reserved = await rows(sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='chat' AND payload->>'pending_question_id'=${pendingQuestion.id} AND status IN ('queued','running')`,tx);
      if(reserved.length) throw new WorkspaceError("This question has already been answered by a pending message. Edit that queued message instead.",409);
    }
    await tx.execute(
      sql`UPDATE hirelix_private_conversations SET updated_at=now() WHERE id=${conversation.id}::uuid AND user_id=${userId}::uuid`,
    );
    const job = await enqueue(
      userId,
      "chat",
      input.request_key,
      {
        conversation_id: conversation.id,
        pending_question_id: pendingQuestion?.id ?? null,
        message_id: message.id,
        request: input,
        attachment_sha256: attachmentHash,
        priority: input.delivery === "immediate" ? await nextConversationPriority(userId,conversation.id,tx) : 0,
        continuation_job_id: previous?.id ?? null,
      },
      tx,
    );
    await tx.execute(sql`UPDATE hirelix_private_jobs SET created_at=clock_timestamp() WHERE id=${job.id}::uuid`);
    if (previous?.result?.tool_receipts) {
      await tx.execute(sql`UPDATE hirelix_private_jobs SET result=${json({tool_receipts:previous.result.tool_receipts})} WHERE id=${job.id}::uuid`);
    }
    return { conversation_id: conversation.id, job };
  });
}
