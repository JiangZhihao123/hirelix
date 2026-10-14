"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { BriefcaseBusiness, BookUser, Send, Mail, ChevronDown } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { viewedSourceFromHref } from "@/lib/workspace/source-context";
import type { AssistantMeta } from "@/lib/workspace/conversations";
import type { TurnPart } from "@/lib/workspace/turn-progress";
import type { Message, Role } from "@/lib/workspace/types";

type Reference = { title: string; href: string };
export function ConversationContext({ role, messages, liveParts = [], onSource }: {
  role?: Role; liveParts?: TurnPart[]; messages: Message[]; onSource: (source: Reference) => void;
}) {
  const t = useT();
  const disclosure = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (disclosure.current && !disclosure.current.contains(event.target as Node)) disclosure.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const references = new Map<string, Reference>();
  if (role) references.set(`role:${role.id}`, { title: `${role.client_name} · ${role.title}`, href: `/app/roles/${role.id}` });
  // Only references actually returned in this conversation; a document is not its focus.
  for (const message of messages) for (const source of (message.metadata as AssistantMeta).sources || []) {
    const ref = viewedSourceFromHref(source.href);
    if (ref?.kind === "role") references.set(`${ref.kind}:${ref.id}`, source);
  }
  for (const part of liveParts) {
    if (part.type !== "tool" || part.status !== "done" || !part.href || !part.target) continue;
    const ref = viewedSourceFromHref(part.href);
    if ((ref?.kind === "role") && !references.has(`${ref.kind}:${ref.id}`)) references.set(`${ref.kind}:${ref.id}`, { title: part.target, href: part.href });
  }
  const roleKeys = [...references.keys()].filter(key => key.startsWith("role:"));
  const recommendationRole = role?.id || (roleKeys.length === 1 ? roleKeys[0].slice(5) : null);
  if (!references.size) return null;
  const entries = [...references];
  const primaryKey = role ? `role:${role.id}` : roleKeys.length === 1 ? roleKeys[0] : null;
  const primary = primaryKey ? references.get(primaryKey) : null;
  const related = entries.filter(([key]) => key !== primaryKey);
  const open = (source: Reference) => {
    if (disclosure.current) disclosure.current.open = false;
    onSource(source);
  };
  return <nav className="ws-conversation-context" aria-label={t("Related to this conversation")}>
    {primary && <button className="ws-context-focus" type="button" title={primary.title} onClick={() => open(primary)}>
      {primaryKey?.startsWith("role:") ? <BriefcaseBusiness size={14} /> : <BookUser size={14} />}<span>{primary.title}</span>
    </button>}
    {(!!related.length || recommendationRole) && <details ref={disclosure} className="ws-context-disclosure" onKeyDown={event => {
      if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
    }}>
      <summary>{t("Related material")}<ChevronDown size={13} /></summary>
      <div className="ws-context-menu">
        {related.map(([key, source]) => <button key={key} type="button" onClick={() => open(source)}>
          {key.startsWith("role:") ? <BriefcaseBusiness size={14} /> : <BookUser size={14} />}<span>{source.title}</span>
        </button>)}
        {recommendationRole && <div className="ws-context-links">
          <Link href={`/app/submissions?role=${recommendationRole}`}><Send size={14} />{t("Recommendations")}</Link>
          <Link href={`/app/mail?role=${recommendationRole}`}><Mail size={14} />{t("Email activity")}</Link>
        </div>}
      </div>
    </details>}
  </nav>;
}
