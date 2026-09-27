"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Search, X } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import { date, Dialog, ErrorNotice, useQuery } from "./client";
import type { ConversationSearchResult } from "@/lib/workspace/conversations";
import type { Conversation } from "@/lib/workspace/types";

function Highlight({ text, query }: { text: string; query: string }) {
  const index = query
    ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
    : -1;
  if (index < 0) return text;
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + query.length)}</mark>
      {text.slice(index + query.length)}
    </>
  );
}

export function ConversationSearch({
  recent,
  onClose,
  onSelect,
}: {
  recent: Conversation[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 220);
    return () => window.clearTimeout(timer);
  }, [query]);
  const search = useQuery<{ conversations: ConversationSearchResult[] }>(
    debounced ? `/conversations?q=${encodeURIComponent(debounced)}` : null,
  );
  const searching = Boolean(query.trim());
  const waiting =
    searching &&
    (debounced !== query.trim() || (!search.data && !search.error));
  const results: Array<Conversation | ConversationSearchResult> = searching
    ? waiting
      ? []
      : search.data?.conversations || []
    : recent.slice(0, 7);

  return (
    <Dialog title="Search conversations" onClose={onClose} wide closeOnBackdrop>
      <div className="ws-conversation-search">
        <div className="ws-conversation-search-field">
          <Search size={19} aria-hidden="true" />
          <input
            type="search"
            maxLength={100}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((index) =>
                  Math.max(
                    0,
                    Math.min(
                      results.length - 1,
                      index + (event.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
                );
              } else if (event.key === "Enter" && results[selected]) {
                event.preventDefault();
                onSelect(results[selected].id);
              }
            }}
            placeholder={t("Search titles and messages")}
            aria-label={t("Search titles and messages")}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              className="ws-conversation-search-clear"
              onClick={() => {
                setQuery("");
                setDebounced("");
                setSelected(0);
              }}
              aria-label={t("Clear search")}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="ws-conversation-search-results">
          <div className="ws-conversation-search-caption">
            {t(searching ? "Search results" : "Recent conversations")}
          </div>
          {searching && !waiting && (
            <ErrorNotice error={search.error} retry={search.refresh} />
          )}
          {waiting && (
            <p className="ws-conversation-search-state" role="status">
              {t("Searching conversations…")}
            </p>
          )}
          {!waiting && !search.error && results.length === 0 && (
            <p className="ws-conversation-search-state" role="status">
              {t(
                searching
                  ? "No matching conversations"
                  : "Your saved conversations will appear here.",
              )}
            </p>
          )}
          {!waiting &&
            results.map((conversation, index) => {
              const excerpt =
                "excerpt" in conversation ? conversation.excerpt : null;
              return (
                <Link
                  key={conversation.id}
                  href={`/app?conversation=${conversation.id}`}
                  className="ws-conversation-search-result"
                  data-selected={index === selected}
                  onMouseEnter={() => setSelected(index)}
                  onClick={(event) => {
                    event.preventDefault();
                    onSelect(conversation.id);
                  }}
                >
                  <MessageSquare size={17} aria-hidden="true" />
                  <span className="ws-conversation-search-result-copy">
                    <strong>
                      <Highlight text={conversation.title} query={query.trim()} />
                    </strong>
                    {excerpt && (
                      <small>
                        <Highlight text={excerpt} query={query.trim()} />
                      </small>
                    )}
                    {!searching && (
                      <small className="ws-conversation-search-recent-time">
                        {date(conversation.updated_at, true)}
                      </small>
                    )}
                  </span>
                  <time dateTime={conversation.updated_at}>
                    {date(conversation.updated_at)}
                  </time>
                </Link>
              );
            })}
        </div>
      </div>
    </Dialog>
  );
}
