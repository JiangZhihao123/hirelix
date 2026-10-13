"use client";

import { Children, Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useT } from "@/components/LanguageProvider";
import { viewedSourceFromHref } from "@/lib/workspace/source-context";
import { assistantSegments } from "@/lib/workspace/assistant-suggestions";

export function AgentText({
  content,
  className = "",
  onOpenLink,
  onSuggestionReply,
}: {
  content: string;
  onSuggestionReply?: (reply: string) => void;
  className?: string;
  onOpenLink?: (href: string, label: string) => boolean;
}) {
  const t = useT();
  const linkLabel = (href: string, children: React.ReactNode) => {
    const label = Children.toArray(children).filter(child => typeof child === "string").join("").trim();
    const source = viewedSourceFromHref(href);
    return source && (label === href || label.startsWith("/app/") || label.startsWith("/api/workspace/"))
      ? t(({person: "View candidate profile", role: "View role", file: "Open original file", record: "View record", deliverable: "Saved document"})[source.kind]) : children;
  };
  const renderMarkdown = (text: string, suggestion = false) => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => suggestion || href === "#assistant-reply" ? (
            <button type="button" className="ws-suggestion-reply" title={t("Choose a reply to edit and send, or write your own below.")} disabled={!onSuggestionReply} onClick={event => onSuggestionReply?.(event.currentTarget.textContent || "")}>
              {children}
            </button>
          ) : !href || !/^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href) ? <span>{children}</span> : (
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={event => { if (href && onOpenLink?.(href, event.currentTarget.textContent || "")) event.preventDefault(); }}>
              {linkLabel(href, children)}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
  );
  return <div className={`ws-agent-text ${className}`}>
    {assistantSegments(content).map((segment, index) => segment.kind === "suggestion"
      ? <aside className="ws-assistant-suggestion" key={index} aria-label={t("Assistant suggestion")}><div className="ws-assistant-suggestion-label">{t("Assistant suggestion")}</div>{renderMarkdown(segment.text, true)}<small className="ws-suggestion-hint">{t("Choose a reply to edit and send, or write your own below.")}</small></aside>
      : <Fragment key={index}>{renderMarkdown(segment.text)}</Fragment>)}
  </div>;
}
