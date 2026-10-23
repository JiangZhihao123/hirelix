"use client";

import { Check, Loader2, Minus, AlertCircle, ChevronRight, ArrowUpRight } from "lucide-react";
import { AgentText } from "@/components/AgentText";
import { useT, useLanguage } from "@/components/LanguageProvider";
import { visibleTurnParts, type TurnPart } from "@/lib/workspace/turn-progress";
import { MailboxResults } from "./mailbox-results";

type ToolPart = Extract<TurnPart, {type: "tool"}>;

const isMailbox = (part: ToolPart) => ["search_mail", "read_mail", "read_mail_thread"].includes(part.tool || "");
const canGroup = (part: ToolPart) => !!(isMailbox(part) || part.query || part.tool?.startsWith("read_") || part.tool?.startsWith("find_"));

// Only adjacent calls of the same kind are grouped; prose always ends a group.
function groupParts(parts: TurnPart[]) {
  const groups: Array<Extract<TurnPart, {type: "text"}> | {type: "tools"; items: ToolPart[]}> = [];
  for (const part of visibleTurnParts(parts)) {
    const last = groups.at(-1);
    if (part.type === "text") groups.push(part);
    else if (canGroup(part) && last?.type === "tools" && ((isMailbox(last.items[0]) && isMailbox(part)) || (last.items[0].tool || last.items[0].label) === (part.tool || part.label))) last.items.push(part);
    else groups.push({type: "tools", items: [part]});
  }
  return groups;
}

export function TurnParts({ parts, running = false, onOpenLink, sourceLinks = [], detailed = false }: {
  parts: TurnPart[];
  running?: boolean;
  onOpenLink?: (href: string, label: string) => boolean;
  sourceLinks?: readonly string[];
  detailed?: boolean;
}) {
  const t = useT(), {locale} = useLanguage();
  const visible = visibleTurnParts(parts);
  const lastTool = visible.findLastIndex(part => part.type === "tool");
  const hasFinalReply = !running && lastTool >= 0 && visible.slice(lastTool + 1).some(part => part.type === "text" && part.text.trim());
  // Keep the answer and actionable/error evidence in front. Completed calls
  // and their earlier progress narration remain inspectable together.
  const history = detailed || running ? [] : visible.filter((part, index) => part.type === "text"
    ? hasFinalReply && index < lastTool
    : part.status === "done" && !isMailbox(part) && !part.warning && !part.sources?.length);
  const primary = visible.filter(part => !history.includes(part));
  const inventoryText = (part: ToolPart) => Object.entries(part.inventory || {}).map(([key, count]) => `${t(({roles: "Roles", candidates: "Candidates", preferences: "Preferences", reminders: "Reminders"} as Record<string, string>)[key])} ${count}`).join(" · ");
  const statusText = (part: ToolPart) => t(part.status === "done" ? "Completed" : part.status === "error" ? "Failed" : running && part.status === "running" ? "In progress" : "Interrupted");
  const statusIcon = (part: ToolPart) => part.status === "done" ? <Check size={13} /> : part.status === "error" ? <AlertCircle size={13} /> : running && part.status === "running" ? <Loader2 size={13} className="animate-spin" /> : <Minus size={13} />;
  return <div className="ws-turn-parts">
    {groupParts(primary).map((group, index) => {
      if (group.type === "text") return <div className="ws-message-prose" key={`text-${index}`}><AgentText content={group.text} onOpenLink={onOpenLink} sourceLinks={[...sourceLinks, ...parts.flatMap(part => part.type === "tool" && part.href ? [part.href] : [])]} /></div>;
      const first = group.items[0];
      if (isMailbox(first)) {
        const latest=group.items.at(-1)!;
        return <div key={first.id}>
          {group.items.length>1 && <details className="ws-tool-disclosure"><summary>{locale === "zh" ? "此前邮件检索与读取" : "Earlier email searches and reads"} · {group.items.length-1}</summary>{group.items.slice(0,-1).map(part=><MailboxResults key={part.id} part={part} running={running} />)}</details>}
          <MailboxResults part={latest} running={running} />
        </div>;
      }
      const active = group.items.find(part => part.status === "running");
      const failed = group.items.filter(part => part.status === "error");
      const status = active || failed[0] || first;
      const sources = [...new Map(group.items.flatMap(part => part.sources || []).map(source => [source.href, source])).values()];
      const counted = canGroup(first);
      const expandable = counted || group.items.length > 1 || group.items.some(part => part.href || part.list || part.sources?.length || part.status === "error");
      // Older receipts did not retain list entries; don't present their raw
      // returned/total counter as though it were an inspectable result.
      const target = first.query || (first.tool?.startsWith("list_") && !first.list ? undefined : first.target);
      return <div className="ws-tool-block" key={first.id}><details className="ws-tool-disclosure">
        <summary className={`ws-tool-heading${expandable ? "" : " ws-tool-heading-static"}`} onClick={event => { if (!expandable) event.preventDefault(); }} tabIndex={expandable ? 0 : -1}>
          <span className={`ws-tool-status${failed.length ? " has-error" : ""}`} title={statusText(status)} aria-label={statusText(status)}>{statusIcon(status)}</span>
          <span className="ws-tool-heading-label">{t(first.tool === "workspace" ? (first.inventory ? "Returned overview" : first.label === "Reading the requested overview" ? first.label : "Checking roles, candidates and work agreements") : first.label)}{counted ? <span className="ws-tool-count"> × {group.items.length}</span> : target && <span className="ws-tool-inline-target"> · {target}</span>}</span>
          {!counted && group.items.length === 1 && first.list && <span className="ws-tool-inline-target">· {first.list.returned} {t("items returned")}</span>}
          {first.inventory && <span className="ws-tool-inline-target">· {inventoryText(first)}</span>}
          {(failed.length > 0 || (!running && active)) && <span className="ws-tool-status">{statusText(status)}</span>}
          {expandable && <ChevronRight size={14} className="ws-tool-chevron" />}
        </summary>
        <div className="ws-tool-details">
          {group.items.map(part => <div className="ws-tool-call" key={part.id}>
            {counted && <div className="ws-tool-call-line">
              <span>{part.query || part.target || t(part.label)}</span>
              <span className={`ws-tool-status${part.status === "error" ? " has-error" : ""}`}>{statusIcon(part)}{statusText(part)}</span>
            </div>}
            {part.href && <a className="ws-tool-object" href={part.href} onClick={event => { if (onOpenLink?.(part.href!, part.target || t(part.label))) event.preventDefault(); }}>{part.target || t("View result")}<ArrowUpRight size={12} /></a>}
            {part.list && <div className="ws-tool-results">
              {part.list.total !== undefined && part.list.total !== part.list.returned && <p className="ws-message-status">{t("Total items")} · {part.list.total}</p>}
              {part.list.items.length ? <ul>{part.list.items.map((item, index) => <li key={`${item.href || item.title}:${index}`}>
                {item.href ? <a href={item.href} onClick={event => { if (onOpenLink?.(item.href!, item.title)) event.preventDefault(); }}><span>{item.title}</span><ArrowUpRight size={12} /></a> : <span>{item.title}</span>}
                {item.detail && <small>{item.detail}</small>}
              </li>)}</ul> : <p>{t("No items returned")}</p>}
              {part.list.has_more && <p className="ws-message-status">{t("More items are available on the next page.")}</p>}
            </div>}
            {part.status === "error" && <p className="ws-tool-error">{t("This action failed. Later attempts are shown separately.")}</p>}
            {!!part.sources?.length && <ul className="ws-tool-source-list">{part.sources.map(source => <li key={source.href}><a href={source.href} target="_blank" rel="noopener noreferrer"><span>{source.title}</span><small>{new URL(source.href).hostname}</small></a></li>)}</ul>}
          </div>)}
        </div>
        </details>

        {group.items.some(part => part.warning) && <p className="ws-tool-partial">{t("Some searches failed; available results are shown.")}</p>}
        {!!sources.length && <div className="ws-tool-source-preview">{sources.slice(0, 3).map(source => <a key={source.href} href={source.href} target="_blank" rel="noopener noreferrer" title={source.title}>{new URL(source.href).hostname}</a>)}<span>{t("Search results")} · {sources.length}</span></div>}
      </div>;
    })}
    {!!history.length && <details className="ws-turn-history">
      <summary>{t("Work details")} <span>· {history.filter(part => part.type === "tool").length}</span></summary>
      <TurnParts parts={history} running={running} onOpenLink={onOpenLink} sourceLinks={sourceLinks} detailed />
    </details>}
  </div>;
}
