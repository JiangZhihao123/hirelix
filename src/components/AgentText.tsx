"use client";

import { Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useT } from "@/components/LanguageProvider";
import { assistantSegments } from "@/lib/workspace/assistant-suggestions";

export function AgentText({
  content,
  className = "",
  onOpenLink,
}: {
  content: string;
  className?: string;
  onOpenLink?: (href: string, label: string) => boolean;
}) {
  const t = useT();
  const renderMarkdown = (text: string) => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => !href || !/^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href) ? <span>{children}</span> : (
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={event => { if (href && onOpenLink?.(href, event.currentTarget.textContent || "")) event.preventDefault(); }}>
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
  );
  return <div className={`ws-agent-text ${className}`}>
    {assistantSegments(content).map((segment, index) => segment.kind === "suggestion"
      ? <aside className="ws-assistant-suggestion" key={index} aria-label={t("Assistant suggestion")}><div className="ws-assistant-suggestion-label">{t("Assistant suggestion")}</div>{renderMarkdown(segment.text)}</aside>
      : <Fragment key={index}>{renderMarkdown(segment.text)}</Fragment>)}
  </div>;
}
