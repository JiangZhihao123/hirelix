"use client";
import { useState, useEffect, useRef } from "react";
import { useQuery } from "@/components/workspace/client";
import { useSearchParams } from "next/navigation";
import { assistantDraftKey, canResumeRecentConversation, nextConversationView, type ConversationView } from "@/components/workspace/conversation-draft";
import { AssistantWorkspace } from "@/components/workspace/assistant-workspace";
import { readAttachmentDraft } from "@/components/workspace/attachment-draft";
import { useAuth } from "@/components/AuthProvider";
export default function AssistantHome() {
  const params = useSearchParams();
  const {user} = useAuth();
  const entryQuery = params.toString();
  const resumeRecent = canResumeRecentConversation(new URLSearchParams(entryQuery));
  const conversationId = params.get("conversation");
  const recent = useQuery<{conversations: {id:string}[]}>(resumeRecent ? "/conversations" : null);
  const resumed = useRef(false);
  useEffect(() => {
    if (!resumeRecent || resumed.current || !recent.data || !user?.id) return;
    const draftKey = assistantDraftKey(null,null,null);
    const hasDraft = () => {
      try {
        const references = JSON.parse(localStorage.getItem(`${draftKey}:references`) || "[]");
        return !!localStorage.getItem(draftKey) || !!localStorage.getItem(`${draftKey}:role`) || !Array.isArray(references) || references.length > 0;
      } catch { return true; }
    };
    if (hasDraft() || !recent.data.conversations[0]) { resumed.current = true; return; }
    let active = true;
    void readAttachmentDraft(`${user.id}:${draftKey}`).then(files => {
      if (!active || resumed.current) return;
      resumed.current = true;
      if (files.length || hasDraft() || new URLSearchParams(window.location.search).toString() !== entryQuery) return;
      const next = new URLSearchParams(entryQuery);
      next.set("conversation", recent.data!.conversations[0].id);
      window.history.replaceState(null,"",`/app?${next.toString()}`);
    }).catch(() => { /* Keep the composer when its attachment draft cannot be checked. */ });
    return () => { active = false; };
  }, [resumeRecent, recent.data, user?.id, entryQuery]);
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
