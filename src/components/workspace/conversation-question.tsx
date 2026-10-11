"use client";
import { useEffect, useRef, useState } from "react";
import { useLanguage, useT } from "@/components/LanguageProvider";
import { api, ErrorNotice } from "./client";
import type { ConversationQuestion as Question } from "@/lib/workspace/conversation-questions";

export function ConversationQuestion({question, conversationId, messageId, onChanged}: {question: Question; conversationId:string; messageId:string; onChanged:()=>void}) {
  const t = useT();
  const {locale} = useLanguage();
  const [answer,setAnswer] = useState("");
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  const storageKey = `hirelix:question:${messageId}`;
  useEffect(() => {
    if (question.status === "waiting") setAnswer(localStorage.getItem(storageKey) || "");
    else localStorage.removeItem(storageKey);
  }, [storageKey, question.status]);
  function edit(value: string) { setAnswer(value); localStorage.setItem(storageKey, value); }
  const attempt = useRef<{answer:string;key:string} | null>(null);
  async function respond(cancel = false) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      if (cancel) await api(`/conversations/${conversationId}/questions/${messageId}`,{method:"DELETE"});
      else {
        if (!attempt.current || attempt.current.answer !== answer) attempt.current = {answer,key:crypto.randomUUID()};
        await api("/conversations",{method:"POST",body:JSON.stringify({conversation_id:conversationId,question_message_id:messageId,message:answer,request_key:attempt.current.key,locale,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})});
      }
      localStorage.removeItem(storageKey);
      onChanged(); window.dispatchEvent(new Event("hirelix:conversations-changed"));
    } catch(cause) {setError(cause instanceof Error ? cause.message : "Could not continue. Your answer is kept."); onChanged();}
    finally {setBusy(false);}
  }
  if(question.status !== "waiting") return <div className="ws-question-resolved"><p>{question.question}</p><small>{t(question.status === "answered" ? "Answered" : "Request cancelled")}</small></div>;
  return <section className="ws-question-card" role="region" aria-label={t("Your answer is needed")}>
    <strong>{t("Your answer is needed")}</strong><p>{question.question}</p>
    <div className="ws-question-options" role="radiogroup" aria-label={question.question}>{question.options.map((option,index)=><label key={index} className="ws-button" data-selected={answer===option}><input type="radio" name={`answer-${messageId}`} checked={answer===option} disabled={busy} onChange={()=>edit(option)} />{option}</label>)}</div>
    <form onSubmit={event=>{event.preventDefault();void respond();}}>
      <label>{t("Your answer")}<textarea value={answer} onChange={event=>edit(event.target.value)} maxLength={50000} rows={2} disabled={busy} placeholder={t("Choose an option or write your own answer…")} /></label>
      <ErrorNotice error={error} />
      <footer><button type="submit" className="ws-button ws-button-primary" disabled={busy || !answer.trim()}>{t(busy ? "Continuing…" : "Continue")}</button><button type="button" className="ws-button" disabled={busy} onClick={()=>void respond(true)}>{t("Cancel request")}</button></footer>
    </form><small>{t("Waiting for your answer. You can also reply in the conversation.")}</small>
  </section>;
}
