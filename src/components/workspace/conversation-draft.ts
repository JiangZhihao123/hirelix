export type ConversationView = {route: string; generation: number; promotion: string | null};

export function nextConversationView(view: ConversationView, route: string, conversationId: string | null): ConversationView {
  if (route === view.route) return view;
  return {route, generation: conversationId && view.promotion === conversationId ? view.generation : view.generation + 1, promotion: null};
}

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
