"use client";

import { Check, Loader2, Minus, AlertCircle, Search, FileText, Pencil, Mail, Wrench, ChevronRight, ArrowUpRight } from "lucide-react";
import { AgentText } from "@/components/AgentText";
import { useT } from "@/components/LanguageProvider";
import type { TurnPart } from "@/lib/workspace/turn-progress";

type ToolPart = Extract<TurnPart, {type: "tool"}>;

// Only adjacent calls of the same kind are grouped; prose always ends a group.
function groupParts(parts: TurnPart[]) {
  const groups: Array<Extract<TurnPart, {type: "text"}> | {type: "tools"; items: ToolPart[]}> = [];
  for (const part of parts) {
    const last = groups.at(-1);
    if (part.type === "text") groups.push(part);
    else if ((part.query || part.tool?.startsWith("read_") || part.tool?.startsWith("find_")) && last?.type === "tools" && (last.items[0].tool || last.items[0].label) === (part.tool || part.label)) last.items.push(part);
    else groups.push({type: "tools", items: [part]});
  }
  return groups;
}

function toolIcon(part: ToolPart) {
  if (part.query || part.tool?.startsWith("find_") || part.tool === "web_search") return Search;
  if (part.tool?.startsWith("read_")) return FileText;
  if (part.tool === "email" || part.tool === "record_delivery") return Mail;
  if (part.tool && ["save_", "update_", "edit_", "revise_", "prepare_"].some(prefix => part.tool!.startsWith(prefix))) return Pencil;
  return Wrench;
}

export function TurnParts({ parts, running = false, onOpenLink }: {
  parts: TurnPart[];
  running?: boolean;
  onOpenLink?: (href: string, label: string) => boolean;
}) {
  const t = useT();
  const statusText = (part: ToolPart) => t(part.status === "done" ? "Completed" : part.status === "error" ? "Failed" : running ? "In progress" : "Interrupted");
  const statusIcon = (part: ToolPart) => part.status === "done" ? <Check size={13} /> : part.status === "error" ? <AlertCircle size={13} /> : running ? <Loader2 size={13} className="animate-spin" /> : <Minus size={13} />;
  return <div className="ws-turn-parts">
    {groupParts(parts).map((group, index) => {
      if (group.type === "text") return <div className="ws-message-prose" key={`text-${index}`}><AgentText content={group.text} onOpenLink={onOpenLink} /></div>;
      const first = group.items[0], Icon = toolIcon(first);
      const active = group.items.find(part => part.status === "running");
      const failed = group.items.filter(part => part.status === "error");
      const status = active || failed[0] || first;
      const sources = [...new Map(group.items.flatMap(part => part.sources || []).map(source => [source.href, source])).values()];
      return <div className="ws-tool-block" key={first.id}><details className="ws-tool-disclosure">
        <summary className="ws-tool-heading">
          <Icon size={15} />
          <span className="ws-tool-heading-label">{t(first.label)}{group.items.length > 1 && <span className="ws-tool-count"> × {group.items.length}</span>}</span>
          <span className={`ws-tool-status${failed.length ? " has-error" : ""}`}>
            {statusIcon(status)}{failed.length && !active && group.items.length > 1 ? `${t("Failed")} · ${failed.length}` : statusText(status)}
          </span>
          <ChevronRight size={14} className="ws-tool-chevron" />
        </summary>
        <div className="ws-tool-details">
          {group.items.map(part => <div className="ws-tool-call" key={part.id}>
            <div className="ws-tool-call-line">
              <span>{part.query || part.target || t(part.label)}</span>
              <span className={`ws-tool-status${part.status === "error" ? " has-error" : ""}`}>{statusIcon(part)}{statusText(part)}</span>
            </div>
            {part.href && <a className="ws-tool-object" href={part.href} onClick={event => { if (onOpenLink?.(part.href!, part.target || t(part.label))) event.preventDefault(); }}>{part.target || t("View result")}<ArrowUpRight size={12} /></a>}
            {part.status === "error" && <p className="ws-tool-error">{t("This action failed. Later attempts are shown separately.")}</p>}
            {!!part.sources?.length && <ul className="ws-tool-source-list">{part.sources.map(source => <li key={source.href}><a href={source.href} target="_blank" rel="noopener noreferrer"><span>{source.title}</span><small>{new URL(source.href).hostname}</small></a></li>)}</ul>}
          </div>)}
        </div>
        </details>
        {group.items.length === 1 && (first.query || first.target) && <div className="ws-tool-context">{first.query || first.target}</div>}
        {group.items.some(part => part.warning) && <p className="ws-tool-partial">{t("Some searches failed; available results are shown.")}</p>}
        {!!sources.length && <div className="ws-tool-source-preview">{sources.slice(0, 3).map(source => <a key={source.href} href={source.href} target="_blank" rel="noopener noreferrer" title={source.title}>{new URL(source.href).hostname}</a>)}<span>{t("Search results")} · {sources.length}</span></div>}
      </div>;
    })}
  </div>;
}
