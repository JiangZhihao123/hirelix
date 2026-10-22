"use client";

import { ArrowUpRight } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { firstAssignmentPrompt } from "@/lib/landing-content";

export function ConversationStarters({returning, onChoose}: {returning: boolean; onChoose: (prompt: string) => void}) {
  const t = useT();
  const examples = [
    returning
      ? {label:"Pick up my searches", prompt:"Review my active roles, recent client feedback and recorded commitments. What are the few most useful things for me to move forward today? Use saved evidence and explain what is still unknown."}
      : {label:"Compare candidates for a role", prompt:firstAssignmentPrompt},
    {label:"Prepare for a candidate call", prompt:"Prepare a focused candidate call brief from the resume, role and notes I share. Prioritize the few questions that could change whether this person is worth putting forward."},
    returning
      ? {label:"Work with client feedback", prompt:"Record the client feedback I share against the relevant role and candidates, then help me decide what to move forward next. Keep the work internal."}
      : {label:"Save my screening notes", prompt:"Save the screening notes I share against the relevant candidates and role. Preserve what was said, distinguish confirmed facts from open questions, and tell me what matters for the next conversation."},
  ];
  return <div className="ws-conversation-starters" aria-label={t("Ways to start working")}>
    <p>{t(returning ? "Continue from your saved work, or start something new." : "Start with a real role, a resume or a few notes.")}</p>
    <div>{examples.map(example => <button key={example.label} type="button" onClick={() => onChoose(t(example.prompt))}>{t(example.label)}<ArrowUpRight size={13} aria-hidden="true" /></button>)}</div>
  </div>;
}
