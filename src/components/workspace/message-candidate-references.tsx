"use client";

import { ArrowUpRight, UserRound } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import type { CandidateReference } from "@/lib/workspace/candidate-references";

export function MessageCandidateReferences({references, onOpen}: {
  references: CandidateReference[];
  onOpen: (source: {title: string; href: string}) => void;
}) {
  const t = useT();
  if (!references.length) return null;
  return <div className="ws-message-references">{references.map(person =>
    <button type="button" key={person.id} onClick={() => onOpen({title: person.name, href: `/app/candidates?person=${person.id}`})}>
      <UserRound size={18} aria-hidden="true" />
      <span><small>{t("Candidate")}</small><strong>{person.name}</strong></span>
      <ArrowUpRight size={13} aria-hidden="true" />
    </button>,
  )}</div>;
}
