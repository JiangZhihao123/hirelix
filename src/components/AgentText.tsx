import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AgentText({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={`ws-agent-text ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
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
