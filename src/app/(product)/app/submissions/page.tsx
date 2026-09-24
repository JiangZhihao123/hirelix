"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import {
  useQuery,
  ErrorNotice,
  Loading,
  date,
} from "@/components/workspace/client";
import type { Deliverable } from "@/lib/workspace/types";
export default function Submissions() {
  const query = useQuery<{
    deliverables: Array<
      Deliverable & { role_title: string; client_name: string }
    >;
  }>("/deliverables");
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState("");
  const items =
    query.data?.deliverables.filter(
      (d) =>
        (filter === "all" || d.status === filter) &&
        `${d.title} ${d.role_title} ${d.client_name}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ) || [];
  return (
    <div className="ws-page">
      <header className="ws-page-header">
        <div>
          <h1>Candidate submissions</h1>
          <p>
            Prepare candidate submissions and keep a record of what you share.
          </p>
        </div>
        <Link
          className="ws-button ws-button-primary"
          href="/app/submissions/new"
        >
          <Plus size={14} />
          Prepare submission
        </Link>
      </header>
      <div className="ws-toolbar">
        <input
          className="ws-search"
          aria-label="Find a submission"
          placeholder="Search by candidate, client or role"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="ws-actions">
          {[
            ["all", "All"],
            ["draft", "Drafts"],
            ["submitted", "Submitted"],
          ].map(([key, label]) => (
            <button
              key={key}
              className="ws-button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <ErrorNotice error={query.error} retry={query.refresh} />
      {query.loading && !query.data ? (
        <Loading />
      ) : items.length ? (
        <div className="ws-role-grid">
          {items.map((d) => (
            <Link
              key={d.id}
              className="ws-role-row"
              href={`/app/submissions/${d.id}`}
            >
              <div>
                <h2>{d.title}</h2>
                <p>
                  {d.client_name} · {d.role_title}
                </p>
              </div>
              <span className="ws-status">
                {d.status === "draft" ? "Draft" : "Submitted"}
              </span>
              <span className="ws-role-count text-xs ws-muted">
                {d.person_ids.length} candidates
              </span>
              <span className="ws-role-count text-xs ws-muted">
                {date(d.submitted_at || d.updated_at)}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="ws-empty">
          <h2>
            {search || filter !== "all"
              ? "No submissions match this view."
              : "A clear introduction for every candidate."}
          </h2>
          <p>
            Choose a client role and one or more candidates. Prepare a draft
            from the information you decide to share, then review and edit it
            before sending it yourself.
          </p>
          <div className="ws-actions">
            <Link className="ws-button" href="/app/submissions/new">
              Prepare candidate submission
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
