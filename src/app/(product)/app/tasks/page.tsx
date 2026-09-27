"use client";

import { useT } from "@/components/LanguageProvider";
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
  const t = useT();
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
  const jobs = query.data?.jobs || [];
  const attention = jobs.filter((job) =>
    ["queued", "running", "error"].includes(job.status),
  );
  const history = jobs.filter(
    (job) =>
      job.kind !== "chat" &&
      !["queued", "running", "error"].includes(job.status),
  );
  function jobCard(job: Job) {
    const result = job.result || {};
    const href =
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
            <h4>{t(names[job.kind])}</h4>
            <small>{date(job.created_at, true)}</small>
          </div>
          <span className="ws-tag">{t(job.status)}</span>
        </div>
        {(job.error || (job.progress && job.progress !== "Complete")) && (
          <p className="ws-inline-meta">
            {["queued", "running"].includes(job.status) && (
              <Loader2 size={14} className="animate-spin" />
            )}
            {t(job.error || job.progress)}
          </p>
        )}
        {result.superseded === true && (
          <p className="ws-warning">
            {t("The source changed while this task was running. Review the latest information and prepare it again.")}
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
              {t("Retry task")}
            </button>
          )}
          {href && (
            <Link className="ws-link" href={href}>
              {t("Open work")} <ArrowUpRight size={13} />
            </Link>
          )}
        </div>
      </article>
    );
  }
  return (
    <div className="ws-page">
      <header className="ws-page-header">
        <div>
          <h1>{t("Tasks")}</h1>
          <p>
            {t("Your work continues here, including tasks started in the assistant.")}
          </p>
        </div>
        <button className="ws-button" onClick={query.refresh}>
          <RotateCcw size={14} />
          {t("Refresh")}
        </button>
      </header>
      <ErrorNotice error={error || query.error} retry={query.refresh} />
      {query.loading && !query.data ? (
        <Loading />
      ) : (
        <div className="px-8 pb-8">
          {attention.length || history.length ? (
            <>
              {attention.length ? (
                attention.map(jobCard)
              ) : (
                <p className="ws-task-calm">{t("Nothing needs attention right now.")}</p>
              )}
              {history.length > 0 && (
                <section className="ws-task-history">
                  <h2>{t("Recent activity")}</h2>
                  {history.slice(0, 5).map(jobCard)}
                  {history.length > 5 && (
                    <details>
                      <summary>{t("Earlier work")} ({history.length - 5})</summary>
                      {history.slice(5).map(jobCard)}
                    </details>
                  )}
                </section>
              )}
            </>
          ) : (
            <div className="ws-empty">
              <h2>{t("No tasks yet.")}</h2>
              <p>
                {t("Imports, candidate searches and drafts will appear here. You can leave a page and return to its result later.")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
