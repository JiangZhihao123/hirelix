"use client";

import { Check, Loader2, Minus, AlertCircle } from "lucide-react";
import { AgentText } from "@/components/AgentText";
import { useT } from "@/components/LanguageProvider";
import type { TurnPart } from "@/lib/workspace/turn-progress";

export function TurnParts({ parts, running = false, onOpenLink }: {
  parts: TurnPart[];
  running?: boolean;
  onOpenLink?: (href: string, label: string) => boolean;
}) {
  const t = useT();
  return <div className="ws-turn-parts">
    {parts.map((part, index) => part.type === "text"
      ? <div className="ws-message-prose" key={index}><AgentText content={part.text} onOpenLink={onOpenLink} /></div>
      : <div className="ws-turn-tool" key={part.id}>
          {part.status === "done" ? <Check size={13} /> : part.status === "error" ? <AlertCircle size={13} /> : running ? <Loader2 size={13} className="animate-spin" /> : <Minus size={13} />}
          <span>{t(part.label)}</span>
          <small>{t(part.status === "done" ? "Completed" : part.status === "error" ? "Failed" : running ? "In progress" : "Interrupted")}</small>
        </div>)}
  </div>;
}
