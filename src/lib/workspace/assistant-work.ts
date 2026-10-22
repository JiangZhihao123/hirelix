export type AssistantWorkReceipt = { job_id: string; title: string; kind: "submission" | "search_update" };
export type AssistantScheduleReceipt = { id: string; role_id: string; title: string };

export function quotedAuthorization(message: string, quote: string | null | undefined) {
  const normalize = (text: string) => text.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  return !!quote && normalize(quote).length >= 2 && normalize(message).includes(normalize(quote));
}

// This verifies the source of a quote, not its meaning. The agent must still
// respect later corrections/withdrawal and the scope of the original request.
export function priorInternalAuthorization(tool: string, quote: string, messages: Array<{role: string; content: string; metadata: Record<string, unknown> }>) {
  const internal = ["save_candidate", "register_candidate_cv", "save_role", "update_role", "link_candidates", "save_assessments", "save_record", "update_record", "import_candidates", "edit_document", "revise_document"];
  return internal.includes(tool) && messages.some(message => message.role === "user" && message.metadata.delivery !== "queued" && quotedAuthorization(message.content, quote));
}
