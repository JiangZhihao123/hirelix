"use client";

import { useT } from "@/components/LanguageProvider";
import { useEffect, useState } from "react";
import { api, useQuery, ErrorNotice, Field, Dialog } from "./client";
import { AgentText } from "@/components/AgentText";
import type { Deliverable, Job } from "@/lib/workspace/types";

export function RevisionPanel({
  document,
  disabled,
  onApplied,
  jobId,
  embedded = false,
}: {
  document: Deliverable;
  jobId?: string;
  embedded?: boolean;
  disabled: boolean;
  onApplied: (value: Deliverable) => void;
}) {
  const t = useT();
  const query = useQuery<{ job: Job | null }>(
    jobId ? `/jobs/${jobId}` : `/deliverables/${document.id}/revision`,
  );
  const [review, setReview] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const job = query.data?.job;
  const running = job?.status === "queued" || job?.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(query.refresh, 2000);
    return () => clearInterval(timer);
  }, [running, query.refresh]);
  async function request() {
    setBusy(true);
    setError("");
    try {
      await api(`/deliverables/${document.id}/revision`, {
        method: "POST",
        body: JSON.stringify({
          instructions,
          expected_version: document.version,
          request_key: crypto.randomUUID(),
        }),
      });
      query.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not prepare the revision",
      );
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ deliverable: Deliverable }>(
        `/deliverables/${document.id}/revision`,
        {
          method: "PATCH",
          body: JSON.stringify({
            job_id: job?.id,
            expected_version: document.version,
          }),
        },
      );
      onApplied(result.deliverable);
      setReview(false);
      query.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not apply the revision",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ws-panel mt-6">
      <h2>{t("Revise with your assistant")}</h2>
      <p className="ws-muted">
        {t("Review a proposed revision before replacing your draft. Your previous version is kept.")}
      </p>
      <ErrorNotice error={error || query.error} />
      {!embedded && <><Field label={t("What would you like to change?")}>
        <textarea
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={t("Make it shorter and lead with the team-building experience.")}
        />
      </Field>
      <button
        className="ws-button"
        disabled={disabled || busy || running || !instructions.trim()}
        onClick={() => void request()}
      >
        {" "}
        {running ? t("Preparing revision…") : t("Prepare revision")}
      </button>
      </>}
      {disabled && (
        <p className="ws-muted">{t("Save your current edits before revising.")}</p>
      )}
      {running && (
        <p role="status" className="ws-muted">
          {t(job.progress || "Preparing your revision")}{t(". You can return to this draft later.")}
        </p>
      )}
      {job?.status === "error" && (
        <>
          <ErrorNotice
            error={job.error || "Revision failed. Your draft is unchanged."}
          />
          <button
            className="ws-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/jobs/${job.id}`, {
                  method: "POST",
                  body: JSON.stringify({ action: "retry" }),
                });
                query.refresh();
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : "Retry failed",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("Retry revision")}
          </button>
        </>
      )}
      {job?.status === "done" && !job.result?.applied_version && (
        <div className="mt-4">
          <button className="ws-button" onClick={() => setReview(true)}>
            {t("Review proposed revision")}
          </button>
          {review && (
            <Dialog
              title={t("Review proposed revision")}
              wide
              onClose={() => {
                if (!busy) setReview(false);
              }}
            >
              <div className="ws-form">
                <ErrorNotice error={error} />
                <p className="ws-muted">{String(job.result?.changes || "")}</p>
                <h3>{String(job.result?.title || "")}</h3>
                <AgentText content={String(job.result?.content || "")} />
                {job.payload.expected_version !== document.version && (
                  <p role="alert">
                    {t("This draft changed after the revision started. Prepare a new revision using the current text; this suggestion has been kept.")}
                  </p>
                )}
                <button
                  className="ws-button ws-button-primary mt-4"
                  disabled={
                    disabled ||
                    busy ||
                    job.payload.expected_version !== document.version
                  }
                  onClick={() => void apply()}
                >
                  {t("Apply revision")}
                </button>
              </div>
            </Dialog>
          )}
        </div>
      )}
      {!!job?.result?.applied_version && (
        <p className="ws-muted">
          {t("Revision applied. The earlier text is available in version history.")}
        </p>
      )}
    </section>
  );
}
