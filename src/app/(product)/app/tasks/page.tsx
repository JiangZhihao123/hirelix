"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, RotateCcw, ArrowUpRight } from "lucide-react";
import {
  api,
  date,
  ErrorNotice,
  Loading,
  useQuery,
} from "@/components/workspace/client";
import type { Job } from "@/lib/workspace/types";
const names: Record<Job["kind"], string> = {
  chat: "Assistant conversation",
  import: "Candidate import",
  index: "Candidate indexing",
  retrieval: "Find candidates",
  assessment: "Role assessment",
  deliverable: "Prepare client material",
  revision: "Revise a draft",
  brief_proposal: "Review role requirements",
};
export default function Tasks() {
  const query = useQuery<{ jobs: Job[] }>("/jobs");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState<string | null>(null);
  const running = query.data?.jobs.some((job) =>
    ["queued", "running"].includes(job.status),
  );
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(query.refresh, 2000);
    return () => clearInterval(timer);
  }, [running, query.refresh]);
  async function retry(id: string) {
    setBusy(id);
    try {
      await api(`/jobs/${id}`, { method: "POST" });
      query.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not retry task");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="ws-page">
      <header className="ws-page-header">
        <div>
          <h1>Tasks</h1>
          <p>
            Your work continues here, including tasks started in the assistant.
          </p>
        </div>
        <button className="ws-button" onClick={query.refresh}>
          <RotateCcw size={14} />
          Refresh
        </button>
      </header>
      <ErrorNotice error={error || query.error} retry={query.refresh} />
      {query.loading && !query.data ? (
        <Loading />
      ) : (
        <div className="px-8 pb-8">
          {query.data?.jobs.length ? (
            query.data.jobs.map((job) => {
              const result = job.result || {},
                href =
                  job.kind === "retrieval"
                    ? `/app/candidates?task=${job.id}`
                    : job.kind === "import"
                      ? typeof job.payload.conversation_id === "string"
                        ? `/app?conversation=${job.payload.conversation_id}`
                        : `/app/candidates/import?task=${job.id}`
                      : typeof result.deliverable_id === "string"
                        ? `/app/submissions/${result.deliverable_id}`
                        : typeof job.payload.role_id === "string"
                          ? `/app/roles/${job.payload.role_id}`
                          : typeof job.payload.person_id === "string"
                            ? `/app/candidates?person=${job.payload.person_id}`
                            : typeof job.payload.conversation_id === "string"
                              ? `/app?conversation=${job.payload.conversation_id}`
                              : null;
              return (
                <article className="ws-record" key={job.id}>
                  <div className="ws-inspector-heading">
                    <div>
                      <h4>{names[job.kind]}</h4>
                      <small>{date(job.created_at, true)}</small>
                    </div>
                    <span className="ws-tag">{job.status}</span>
                  </div>
                  <p className="ws-inline-meta">
                    {["queued", "running"].includes(job.status) && (
                      <Loader2 size={14} className="animate-spin" />
                    )}
                    {job.error || job.progress}
                  </p>
                  {result.superseded === true && (
                    <p className="ws-warning">
                      The source changed while this task was running. Review the
                      latest information and prepare it again.
                    </p>
                  )}
                  <div className="ws-actions mt-3">
                    {job.status === "error" && (
                      <button
                        className="ws-button"
                        disabled={busy === job.id}
                        onClick={() => retry(job.id)}
                      >
                        <RotateCcw size={13} />
                        Retry task
                      </button>
                    )}
                    {href && (
                      <Link className="ws-link" href={href}>
                        Open work <ArrowUpRight size={13} />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="ws-empty">
              <h2>No tasks yet.</h2>
              <p>
                Imports, candidate searches and drafts will appear here. You can
                leave a page and return to its result later.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
