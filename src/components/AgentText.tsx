"use client";

import { Children, Fragment, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp } from "lucide-react";
import { suggestionLayout, assistantReplies } from "@/lib/workspace/suggestion-layout";
import { useT } from "@/components/LanguageProvider";
import { viewedSourceFromHref } from "@/lib/workspace/source-context";
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
  const linkLabel = (href: string, children: React.ReactNode) => {
    const label = Children.toArray(children).filter(child => typeof child === "string").join("").trim();
    const source = viewedSourceFromHref(href);
    return source && (label === href || label.startsWith("/app/") || label.startsWith("/api/workspace/"))
      ? t(({person: "View candidate profile", role: "View role", file: "Open original file", record: "View record", deliverable: "Saved document"})[source.kind]) : children;
  };
  const renderMarkdown = (text: string, suggestion = false) => (
      <ReactMarkdown
        remarkPlugins={suggestion ? [remarkGfm, suggestionLayout] : [remarkGfm]}
        components={{
          a: ({ href, children }) => suggestion || href === "#assistant-reply" ? null : !href || !/^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href) ? <span>{children}</span> : (
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
    {assistantSegments(content).map((segment, index) => <Fragment key={index}>{renderMarkdown(segment.text, segment.kind === "suggestion")}</Fragment>)}
  </div>;
}

export function AssistantReplies({content, onReply}: {content: string; onReply: (reply: string) => void}) {
  const t = useT();
  const replies = useMemo(() => assistantReplies(content), [content]);
  if (!replies.length) return null;
  return <div className="ws-message-replies">
    {replies.map(reply => <button key={reply} type="button" className="ws-suggestion-reply" title={t("Send reply")} onClick={() => onReply(reply)}>
      <span>{reply}</span><ArrowUp size={15} aria-hidden="true" />
    </button>)}
  </div>;
}
