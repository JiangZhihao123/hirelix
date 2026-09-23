import type { ReactNode } from "react";

function InlineText({ value }: { value: string }) {
  const pattern =
    /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s]+)/g;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(value.slice(cursor, index));
    const token = match[0];
    if (token.startsWith("**"))
      parts.push(
        <strong key={index} className="font-semibold text-slate-950">
          {token.slice(2, -2)}
        </strong>,
      );
    else if (token.startsWith("*"))
      parts.push(<em key={index}>{token.slice(1, -1)}</em>);
    else if (token.startsWith("`"))
      parts.push(
        <code key={index} className="rounded bg-slate-200/70 px-1 text-xs">
          {token.slice(1, -1)}
        </code>,
      );
    else if (token.startsWith("[")) {
      const separator = token.indexOf("](");
      parts.push(
        <a
          key={index}
          href={token.slice(separator + 2, -1)}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-blue-700 underline"
        >
          {token.slice(1, separator)}
        </a>,
      );
    } else
      parts.push(
        <a
          key={index}
          href={token}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-blue-700 underline"
        >
          {token}
        </a>,
      );
    cursor = index + token.length;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return <>{parts}</>;
}

export function AgentText({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={`space-y-2 text-sm leading-7 ${className}`}>
      {content
        .split("\n")
        .filter((line) => line.trim())
        .map((line, index) => {
          const trimmed = line.trim();
          if (/^-{3,}$/.test(trimmed))
            return <hr key={index} className="border-slate-200" />;
          if (trimmed.startsWith("### "))
            return (
              <h4
                key={index}
                className="pt-2 text-sm font-semibold text-slate-950"
              >
                <InlineText value={trimmed.slice(4)} />
              </h4>
            );
          if (trimmed.startsWith("## "))
            return (
              <h3
                key={index}
                className="pt-2 text-base font-semibold text-slate-950"
              >
                <InlineText value={trimmed.slice(3)} />
              </h3>
            );
          if (trimmed.startsWith("# "))
            return (
              <h2
                key={index}
                className="pt-2 text-lg font-semibold text-slate-950"
              >
                <InlineText value={trimmed.slice(2)} />
              </h2>
            );
          if (trimmed.startsWith("- ") || trimmed.startsWith("* "))
            return (
              <p key={index} className="pl-4 before:mr-2 before:content-['•']">
                <InlineText value={trimmed.slice(2)} />
              </p>
            );
          if (/^\d+\.\s/.test(trimmed))
            return (
              <p key={index} className="pl-3">
                <InlineText value={trimmed} />
              </p>
            );
          return (
            <p key={index} className="whitespace-pre-wrap">
              <InlineText value={trimmed} />
            </p>
          );
        })}
    </div>
  );
}
