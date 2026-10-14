"use client";

import { BriefcaseBusiness, UserRound, X } from "lucide-react";
import { useT } from "@/components/LanguageProvider";

export function ComposerReference({kind, name, removeLabel, onRemove}: {
  kind: "candidate" | "role";
  name: string;
  removeLabel: string;
  onRemove?: () => void;
}) {
  const t = useT();
  return <span className={`ws-composer-reference ws-composer-reference-${kind}`}>
    <span className="ws-composer-reference-icon" aria-hidden="true">
      {kind === "candidate" ? <UserRound size={17} /> : <BriefcaseBusiness size={17} />}
    </span>
    <span className="ws-composer-reference-text">
      <small>{kind === "candidate" ? t("Candidate") : `${t("Role")} / JD`}</small>
      <strong title={name}>{name}</strong>
    </span>
    {onRemove && <button type="button" aria-label={removeLabel} onClick={onRemove}><X size={14} aria-hidden="true" /></button>}
  </span>;
}
