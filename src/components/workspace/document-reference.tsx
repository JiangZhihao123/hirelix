"use client";

import { ArrowUpRight, FileText } from "lucide-react";
import { useT } from "@/components/LanguageProvider";

export function DocumentReference({reference, atSend = false, onOpen}: {
  reference: unknown;
  atSend?: boolean;
  onOpen: (source: {title: string; href: string}) => void;
}) {
  const t = useT();
  if (!reference || typeof reference !== "object") return null;
  const item = reference as {title?: unknown; version?: unknown; href?: unknown};
  if (typeof item.title !== "string" || typeof item.version !== "number" || !Number.isInteger(item.version) || item.version < 1 || typeof item.href !== "string" || !/^\/app\/(?:submissions|roles\/[a-f0-9-]{36}\/updates)\/[a-f0-9-]{36}$/.test(item.href)) return null;
  const {title, version, href} = item as {title: string; version: number; href: string};
  return <div className="ws-message-references ws-document-reference">
    <button type="button" onClick={() => onOpen({title, href})}>
      <FileText size={18} aria-hidden="true" />
      <span><small>{t(atSend ? "Document at send" : "Saved document")} · v{version}</small><strong title={title}>{title}</strong></span>
      <ArrowUpRight size={13} aria-hidden="true" />
    </button>
  </div>;
}
