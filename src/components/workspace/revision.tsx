"use client";

import { useLanguage, useT } from "@/components/LanguageProvider";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  const {locale} = useLanguage();
  const settled = useRef<string | null>(null);
  const requestKey = useRef<{signature:string; key:string} | null>(null);
  const query = useQuery<{ job: Job | null }>(
    jobId ? `/jobs/${jobId}` : `/deliverables/${document.id}/revision`,
  );
  const [review, setReview] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const job = query.data?.job;
  const appliedVersion = job?.result?.applied_version;
  const conversationId = job?.kind === "chat" && typeof job.payload.conversation_id === "string" ? job.payload.conversation_id : null;
  useEffect(() => {
    if (disabled || job?.kind !== "chat" || !["done", "error", "cancelled"].includes(job.status)) return;
    const key = `${job.id}:${job.status}`;
    if (settled.current === key) return;
    settled.current = key;
    api<{deliverable:Deliverable}>(`/deliverables/${document.id}`).then(result => onApplied(result.deliverable)).catch(cause => setError(cause instanceof Error ? cause.message : "Could not load updated document"));
  }, [job?.id, job?.kind, job?.status, document.id, disabled, onApplied]);
  useEffect(() => {
    if (appliedVersion && Number(appliedVersion) > document.version) {
      api<{ deliverable: Deliverable }>(`/deliverables/${document.id}`).then(result => onApplied(result.deliverable)).catch(cause => setError(cause instanceof Error ? cause.message : "Could not load updated document"));
    }
  }, [appliedVersion, document.id, document.version, onApplied]);
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
      const payload = {
        message: instructions,
        document_id: document.id,
        document_version: document.version,
        role_id: document.role_id,
        locale,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      const signature = JSON.stringify(payload);
      if (requestKey.current?.signature !== signature) requestKey.current = {signature, key:crypto.randomUUID()};
      await api("/conversations", {
        method: "POST",
        body: JSON.stringify({...payload, request_key:requestKey.current.key}),
      });
      requestKey.current = null;
      setInstructions("");
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
    <section className={embedded ? "ws-revision-receipt" : "ws-panel mt-6"}>
      {!embedded && <><h2>{t("Revise with your AI assistant")}</h2>
      <p className="ws-muted">
        {t("Your assistant can use saved notes and feedback to revise this document. Previous versions are kept.")}
      </p></>}
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
        {running ? t("Working on your request…") : t("Ask your assistant")}
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
      {running && <button className="ws-button" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { await api(`/jobs/${job.id}`, { method: "DELETE" }); query.refresh(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Could not stop revision"); }
        finally { setBusy(false); }
      }}>{t("Stop")}</button>}
      {conversationId && <p><Link className="ws-link" href={`/app?conversation=${conversationId}`}>{t("Continue in conversation")} ↗</Link></p>}
      {job?.kind === "chat" && job.status === "done" && <p role="status">{t("Your assistant has replied. Open the conversation for the result or any questions.")}</p>}
      {job?.status === "cancelled" && <p role="status">{t(job.kind === "chat" ? "Stopped. Completed changes are kept; continue in the conversation." : "Stopped. Your saved document is unchanged.")}</p>}
      {job?.status === "error" && (
        <>
          <ErrorNotice
            error={job.error || (job.kind === "chat" ? "Assistant request failed. Completed changes are kept." : "Revision failed. Your draft is unchanged.")}
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
            {t(job.kind === "chat" ? "Retry" : "Retry revision")}
          </button>
        </>
      )}
      {job?.kind === "revision" && job.status === "done" && !job.result?.applied_version && (
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
          {t(embedded ? "Updated · Previous version kept" : "Revision applied. The earlier text is available in version history.")}
        </p>
      )}
    </section>
  );
}
