"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useT } from "@/components/LanguageProvider";
import { AgentText } from "@/components/AgentText";
import type { PersonalMemory } from "@/lib/workspace/memories";
import { api, date, Dialog, ErrorNotice, Field, Loading, useQuery } from "./client";

export function PersonalMemories({ onClose }: { onClose: () => void }) {
  const t = useT();
  const query = useQuery<{ memories: PersonalMemory[]; archived: PersonalMemory[] }>("/memories");
  const [editing, setEditing] = useState<PersonalMemory | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function change(memory: PersonalMemory, operation: "edit" | "forget" | "restore", event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/memories/${memory.id}`, {
        method: "PATCH",
        body: JSON.stringify({ operation, expected_version: memory.version, ...(operation === "edit" ? { title, content } : {}) }),
      });
      setEditing(null);
      query.refresh();
      window.dispatchEvent(new Event("hirelix:memories-changed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this agreement");
    } finally { setBusy(false); }
  }
  return <Dialog title="What I remember" onClose={onClose} wide>
    <div className="ws-memory-list">
      <p className="ws-muted">{t("Your working preferences and agreements, with their sources. Tell me in conversation when something changes.")}</p>
      <ErrorNotice error={error || query.error} retry={query.error ? query.refresh : undefined} />
      {query.loading ? <Loading /> : <>
        {!query.data?.memories.length && <p>{t("No personal agreements saved yet. Tell me a habit or preference you want me to remember.")}</p>}
        {query.data?.memories.map(memory => <section className="ws-section" key={memory.id}>
          {editing?.id === memory.id ? <form className="ws-form" onSubmit={event => change(memory, "edit", event)}>
            <Field label="Agreement name"><input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></Field>
            <Field label="What to remember"><textarea required rows={4} maxLength={2000} value={content} onChange={event => setContent(event.target.value)} /></Field>
            <div className="ws-actions"><button className="ws-button ws-button-primary" disabled={busy}>{t("Save")}</button><button type="button" className="ws-button" onClick={() => setEditing(null)} disabled={busy}>{t("Cancel")}</button></div>
          </form> : <>
            <h3>{memory.title}</h3>
            <AgentText content={memory.content} />
            <div className="ws-memory-actions">
              {typeof memory.details.source_conversation_id === "string" && <Link href={`/app?conversation=${memory.details.source_conversation_id}`} onClick={onClose}>{t("Original conversation")}</Link>}
              <small>{date(memory.updated_at)}</small>
              <button type="button" className="ws-text-button" disabled={busy} onClick={() => { setEditing(memory); setTitle(memory.title); setContent(memory.content); }}>{t("Edit")}</button>
              <button type="button" className="ws-text-button" disabled={busy} onClick={() => change(memory, "forget")}>{t("Forget this")}</button>
            </div>
          </>}
        </section>)}
        {!!query.data?.archived.length && <details>
          <summary>{t("Forgotten agreements")}</summary>
          <p className="ws-muted">{t("These stay out of future replies. You can restore them; original conversations and version history are kept.")}</p>
          {query.data.archived.map(memory => <div className="ws-memory-actions" key={memory.id}><span>{memory.title}</span><button className="ws-text-button" disabled={busy} onClick={() => change(memory, "restore")}>{t("Restore")}</button></div>)}
        </details>}
      </>}
    </div>
  </Dialog>;
}
