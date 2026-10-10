"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@/components/workspace/client";
import { useSearchParams } from "next/navigation";
import { assistantDraftKey, nextConversationView, type ConversationView } from "@/components/workspace/conversation-draft";
import { AssistantWorkspace } from "@/components/workspace/assistant-workspace";
export default function AssistantHome() {
  const params = useSearchParams();
  const conversationId = params.get("conversation");
  const recent = useQuery<{conversations: {id:string}[]}>(params.size === 0 ? "/conversations" : null);
  const resumed = useRef(false);
  useEffect(() => {
    if (params.size || resumed.current || !recent.data) return;
    resumed.current = true;
    if (!localStorage.getItem("hirelix:assistant:draft:new") && recent.data.conversations[0]) {
      window.history.replaceState(null,"",`/app?conversation=${recent.data.conversations[0].id}`);
    }
  }, [params, recent.data]);
  const roleId = params.get("role"),
    personId = params.get("person");
  const documentId = params.get("document");
  const initialPrompt = params.get("prompt")?.slice(0, 500) || "";
  const route = assistantDraftKey(conversationId, roleId, personId, initialPrompt, documentId)
    + (!conversationId && params.has("new") ? ":new" : "");
  const [view, setView] = useState<ConversationView>({route, generation: 0, promotion: null});
  if (view.route !== route) setView(nextConversationView(view, route, conversationId));
  const [handoff, setHandoff] = useState<{
    conversationId: string;
    text: string | null;
  } | null>(null);
  return (
    <AssistantWorkspace
      key={view.generation}
      conversationId={conversationId}
      documentId={documentId}
      initialRoleId={roleId}
      personId={personId}
      initialPrompt={initialPrompt}
      handoffText={
        handoff?.conversationId === conversationId ? handoff.text : null
      }
      onHandoffSettled={() => setHandoff(previous => previous ? {...previous, text: null} : null)}
      onOpen={(id, text) => {
        setView(previous => ({...previous, promotion: id}));
        setHandoff({ conversationId: id, text: text || null });
        // This page loads conversation data on the client. Keep this query-only
        // change in the current route; Next synchronizes useSearchParams here.
        window.history.pushState(null, "", `/app?conversation=${id}`);
      }}
    />
  );
}
