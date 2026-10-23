import type { Message } from "./types";

// These fields only reconstruct the UI or diagnose execution. Business receipts,
// source provenance and user selections remain intact, including unknown fields.
const presentationFields = new Set(["parts", "agent", "activity", "reply_request_key"]);

export function modelConversationMessage(message: Message) {
  return {
    id: message.id,
    role: message.role,
    created_at: message.created_at,
    content: message.content,
    metadata: Object.fromEntries(Object.entries(message.metadata).filter(([key]) => !presentationFields.has(key))),
  };
}

export function modelConversationMessages(messages: Message[], options: { through?: string; before?: string; limit?: number } = {}) {
  const eligible = messages.filter(message =>
    !["queued", "removed"].includes(String(message.metadata.delivery)) &&
    (!options.through || new Date(message.created_at) <= new Date(options.through)) &&
    // Interrupted prose is useful context but turn_status marks it unfinished.
    (message.metadata.turn_status !== "cancelled" || !!message.content.trim() ||
      message.metadata.committed_tools || message.metadata.actions || message.metadata.work || message.metadata.import_job_ids),
  );
  const before = options.before ? eligible.findIndex(message => message.id === options.before) : eligible.length;
  if (before < 0) throw new Error("Conversation page boundary is unavailable");
  const page = eligible.slice(0, before).slice(-(options.limit ?? 30));
  return {
    messages: page.map(modelConversationMessage),
    has_more: before > page.length,
    // Copy this ID to read the preceding page without clipping any message.
    before_message_id: before > page.length ? page[0]?.id : null,
  };
}
