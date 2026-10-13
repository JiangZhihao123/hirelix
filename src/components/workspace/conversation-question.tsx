"use client";
import { useRef, useState } from "react";
import { useT } from "@/components/LanguageProvider";
import { api, ErrorNotice } from "./client";
import type { ConversationQuestion as Question } from "@/lib/workspace/conversation-questions";

export function ConversationQuestion({question, conversationId, messageId, onChanged, onReply}: {question: Question; conversationId:string; messageId:string; onChanged:()=>void; onReply?: (answer: string)=>void}) {
  const t = useT();
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  const inFlight = useRef(false);
  async function cancel() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      await api(`/conversations/${conversationId}/questions/${messageId}`,{method:"DELETE"});
      onChanged(); window.dispatchEvent(new Event("hirelix:conversations-changed"));
    } catch(cause) {setError(cause instanceof Error ? cause.message : "Could not cancel the request."); onChanged();}
    finally {inFlight.current=false;setBusy(false);}
  }
  const recommendation = question.recommendation;
  return <section className="ws-decision" aria-label={question.question}>
    <p className="ws-decision-question">{question.question}</p>
    {question.options.length > 0 && <div className="ws-decision-options">{question.options.map((option,index)=>
      <button type="button" key={index} className="ws-decision-option" data-recommended={recommendation?.option===index} disabled={busy || !onReply || question.status !== "waiting"} onClick={()=>onReply?.(option)}>
        <span className="ws-decision-letter">{String.fromCharCode(65+index)}</span>
        <span className="ws-decision-content"><span>{option}{recommendation?.option===index && <small className="ws-decision-badge">{t("Recommended")}</small>}</span>
          {recommendation?.option===index && <span className="ws-decision-reason">{recommendation.reason}</span>}
        </span>
      </button>
    )}</div>}
    <ErrorNotice error={error} />
    {question.status === "waiting" ? <button type="button" className="ws-link ws-decision-cancel" disabled={busy || !onReply} onClick={()=>void cancel()}>{t("Cancel request")}</button> : <small>{t(question.status === "answered" ? "Answered" : "Request cancelled")}</small>}
  </section>;
}
