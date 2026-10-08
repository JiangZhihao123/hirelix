"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AgentText({
  content,
  className = "",
  onOpenLink,
}: {
  content: string;
  className?: string;
  onOpenLink?: (href: string) => boolean;
}) {
  return (
    <div className={`ws-agent-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" onClick={event => { if (href && onOpenLink?.(href)) event.preventDefault(); }}>
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
