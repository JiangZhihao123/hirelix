"use client";

import { useLanguage, useT } from "@/components/LanguageProvider";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, useQuery, ErrorNotice, Field } from "./client";
import type { Deliverable, Job } from "@/lib/workspace/types";

export function RevisionPanel({ document, disabled, onApplied }: {
  document: Deliverable;
  disabled: boolean;
  onApplied: (value: Deliverable) => void;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestedJob, setRequestedJob] = useState<string | null>(null);
  const requestKey = useRef<{ signature: string; key: string } | null>(null);
  const settled = useRef<string | null>(null);
  const query = useQuery<{ job: Job | null }>(requestedJob ? `/jobs/${requestedJob}` : `/deliverables/${document.id}/revision`);
  const job = query.data?.job;
  const running = job?.status === "queued" || job?.status === "running";
  const conversationId = job?.kind === "chat" && typeof job.payload.conversation_id === "string" ? job.payload.conversation_id : null;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(query.refresh, 2000);
    return () => clearInterval(timer);
  }, [running, query.refresh]);
  useEffect(() => {
    if (job?.kind !== "chat" || !["done", "error", "cancelled"].includes(job.status)) return;
    const key = `${job.id}:${job.status}`;
    if (settled.current === key) return;
    settled.current = key;
    api<{ deliverable: Deliverable }>(`/deliverables/${document.id}`)
      .then(result => onApplied(result.deliverable))
      .catch(cause => setError(cause instanceof Error ? cause.message : "Could not load updated document"));
  }, [job?.id, job?.kind, job?.status, document.id, onApplied]);
  async function request() {
    setBusy(true);
    setError("");
    try {
      const payload = { message: instructions, document_id: document.id, document_version: document.version,
        role_id: document.role_id, locale, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
      const signature = JSON.stringify(payload);
      if (requestKey.current?.signature !== signature) requestKey.current = { signature, key: crypto.randomUUID() };
      const result = await api<{job: Job}>("/conversations", { method: "POST", body: JSON.stringify({...payload, request_key: requestKey.current.key}) });
      setRequestedJob(result.job.id);
      requestKey.current = null;
      setInstructions("");
      query.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the revision");
    } finally { setBusy(false); }
  }
  return <section className="ws-panel mt-6">
    <h2>{t("Revise with your AI assistant")}</h2>
    <p className="ws-muted">{t("Your assistant can use saved notes and feedback to revise this document. Previous versions are kept.")}</p>
    <ErrorNotice error={error || query.error || job?.error || ""} retry={query.error ? query.refresh : undefined} />
    <Field label={t("What would you like to change?")}>
      <textarea rows={3} value={instructions} onChange={event => setInstructions(event.target.value)} disabled={disabled || busy || running}
        placeholder={t("Make it shorter and lead with the team-building experience.")} />
    </Field>
    <button className="ws-button" disabled={disabled || busy || running || !instructions.trim()} onClick={() => void request()}>
      {t(busy || running ? "Working…" : "Ask your assistant")}
    </button>
    {running && <p className="ws-muted" role="status">{t(job.progress)}</p>}
    {conversationId && <p><Link className="ws-link" href={`/app?conversation=${conversationId}`}>{locale === "zh" ? "在对话中查看进度和结果" : "View progress and results in the conversation"}</Link></p>}
  </section>;
}
