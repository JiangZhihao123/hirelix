"use client";
import Link from "next/link";
import { BriefcaseBusiness, BookUser, Send, Mail } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { viewedSourceFromHref } from "@/lib/workspace/source-context";
import type { AssistantMeta } from "@/lib/workspace/conversations";
import type { TurnPart } from "@/lib/workspace/turn-progress";
import type { Message, Person, Role } from "@/lib/workspace/types";

type Reference = { title: string; href: string };
export function ConversationContext({ role, person, messages, liveParts = [], onSource }: {
  role?: Role; person?: Person; liveParts?: TurnPart[]; messages: Message[]; onSource: (source: Reference) => void;
}) {
  const t = useT();
  const references = new Map<string, Reference>();
  if (role) references.set(`role:${role.id}`, { title: `${role.client_name} · ${role.title}`, href: `/app/roles/${role.id}` });
  if (person) references.set(`person:${person.id}`, { title: person.name, href: `/app/candidates?person=${person.id}` });
  // Only references actually returned in this conversation; a document is not its focus.
  for (const message of messages) for (const source of (message.metadata as AssistantMeta).sources || []) {
    const ref = viewedSourceFromHref(source.href);
    if (ref?.kind === "person" || ref?.kind === "role") references.set(`${ref.kind}:${ref.id}`, source);
  }
  for (const part of liveParts) {
    if (part.type !== "tool" || part.status !== "done" || !part.href || !part.target) continue;
    const ref = viewedSourceFromHref(part.href);
    if ((ref?.kind === "person" || ref?.kind === "role") && !references.has(`${ref.kind}:${ref.id}`)) references.set(`${ref.kind}:${ref.id}`, { title: part.target, href: part.href });
  }
  const roleKeys = [...references.keys()].filter(key => key.startsWith("role:"));
  const recommendationRole = role?.id || (roleKeys.length === 1 ? roleKeys[0].slice(5) : null);
  if (!references.size) return null;
  return <nav className="ws-conversation-context" aria-label={t("Related to this conversation")}>
    <span>{t("Related to this conversation")}</span>
    <div>{[...references].map(([key, source]) => <button key={key} type="button" title={source.title} onClick={() => onSource(source)}>
      {key.startsWith("role:") ? <BriefcaseBusiness size={14} /> : <BookUser size={14} />}<span>{source.title}</span>
    </button>)}{recommendationRole && <Link href={`/app/submissions?role=${recommendationRole}`}><Send size={14} />{t("Recommendations")}</Link>}{recommendationRole && <Link href={`/app/mail?role=${recommendationRole}`}><Mail size={14} />{t("Email activity")}</Link>}</div>
  </nav>;
}
