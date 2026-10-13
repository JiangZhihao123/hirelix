"use client";
import { useT } from "@/components/LanguageProvider";
import type { ConversationQuestion as Question } from "@/lib/workspace/conversation-questions";

export function ConversationQuestion({question, onReply}: {question: Question; onReply?: (answer: string)=>void}) {
  const t = useT();
  const recommendation = question.recommendation;
  return <section className="ws-decision" aria-label={question.question}>
    <p className="ws-decision-question">{question.question}</p>
    {question.options.length > 0 && <div className="ws-decision-options">{question.options.map((option,index)=>
      <button type="button" key={index} className="ws-decision-option" data-recommended={recommendation?.option===index} disabled={!onReply || question.status !== "waiting"} onClick={()=>onReply?.(option)}>
        <span className="ws-decision-letter">{String.fromCharCode(65+index)}</span>
        <span className="ws-decision-content"><span>{option}{recommendation?.option===index && <small className="ws-decision-badge">{t("Recommended")}</small>}</span>
        </span>
      </button>
    )}</div>}
    {question.status !== "waiting" && <small>{t(question.status === "answered" ? "Answered" : "Request cancelled")}</small>}
  </section>;
}
