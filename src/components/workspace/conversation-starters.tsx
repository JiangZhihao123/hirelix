"use client";

import { ArrowUpRight } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { firstAssignmentPrompt } from "@/lib/landing-content";

export function ConversationStarters({returning, candidate = false, role = false, onChoose}: {returning: boolean; candidate?: boolean; role?: boolean; onChoose: (prompt: string) => void}) {
  const t = useT();
  const examples = candidate ? [
    {label:"Find roles for this candidate", prompt:"Use this candidate's latest saved resume and notes to review my existing roles. Explain which opportunities are worth discussing, the trade-offs and what still needs confirming. Keep this as analysis; do not change records or contact anyone."},
    {label:"Prepare for a candidate call", prompt:"Use this candidate's saved resume, communication history and relevant role context to prepare a focused call brief. Highlight what has changed and the few questions worth confirming. Do not contact anyone or book a meeting."},
    {label:"Review this candidate's history", prompt:"Review this candidate's saved sources, communication records and role-specific feedback. Summarize the current facts, open questions and recorded commitments, keeping dates and sources clear. Do not change records or contact anyone."},
  ] : role ? [
    {label:"Find candidates for this role", prompt:"Review candidates in my private library against this role's current requirements. Explain whom I should speak with first, the trade-offs and what still needs confirming. Keep this as analysis; do not save assessments, change records or contact anyone."},
    {label:"Prepare a client update", prompt:"Draft a concise client update using this role's saved requirements, candidates and client feedback. Distinguish completed work from planned next steps and state what needs clarification. Keep the draft in this conversation; do not change business records, share or send it."},
    {label:"Review this role's feedback", prompt:"Review this role's saved client feedback, candidate conversations and recorded commitments. Summarize what has changed, what is still open and what is worth moving forward next, keeping dates and sources clear. Do not change records or contact anyone."},
  ] : [
    returning
      ? {label:"Pick up my searches", prompt:"Review my active roles, recent client feedback and recorded commitments. What are the few most useful things for me to move forward today? Use saved evidence and explain what is still unknown."}
      : {label:"Compare candidates for a role", prompt:firstAssignmentPrompt},
    {label:"Prepare for a candidate call", prompt:"Prepare a focused candidate call brief from the resume, role and notes I share. Prioritize the few questions that could change whether this person is worth putting forward."},
    returning
      ? {label:"Work with client feedback", prompt:"Record the client feedback I share against the relevant role and candidates, then help me decide what to move forward next. Keep the work internal."}
      : {label:"Save my screening notes", prompt:"Save the screening notes I share against the relevant candidates and role. Preserve what was said, distinguish confirmed facts from open questions, and tell me what matters for the next conversation."},
  ];
  return <div className="ws-conversation-starters" aria-label={t("Ways to start working")}>
    <p>{t(candidate ? "Start with this candidate's saved context." : role ? "Start with this role's saved context." : returning ? "Continue from your saved work, or start something new." : "Start with a real role, a resume or a few notes.")}</p>
    <div>{examples.map(example => <button key={example.label} type="button" onClick={() => onChoose(t(example.prompt))}>{t(example.label)}<ArrowUpRight size={13} aria-hidden="true" /></button>)}</div>
  </div>;
}
