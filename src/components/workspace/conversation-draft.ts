export function assistantDraftKey(
  conversationId: string | null,
  roleId: string | null,
  personId: string | null,
  initialPrompt = "",
  documentId: string | null = null,
) {
  if (conversationId) return `hirelix:assistant:draft:${conversationId}`;
  if (!roleId && !personId && !initialPrompt && !documentId)
    return "hirelix:assistant:draft:new";
  return `hirelix:assistant:draft:new:${roleId || "-"}:${personId || "-"}:${documentId || "-"}${initialPrompt ? `:prompt:${encodeURIComponent(initialPrompt)}` : ""}`;
}
