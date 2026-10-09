"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Brain, Search, Trash2 } from "lucide-react";
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
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<PersonalMemory | "all" | null>(null);
  const [notice, setNotice] = useState("");
  const active = query.data?.memories || [];
  const archived = query.data?.archived || [];
  const visible = (tab === "active" ? active : archived).filter(memory =>
    `${memory.title} ${memory.content}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/memories", { method: "DELETE", body: JSON.stringify(deleting === "all"
        ? { all: true, confirm: "delete" }
        : { id: deleting.id, expected_version: deleting.version, confirm: "delete" }) });
      setDeleting(null); setEditing(null); query.refresh();
      setNotice("Memory deleted. Original conversations are unchanged.");
      window.dispatchEvent(new Event("hirelix:memories-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete memory"); }
    finally { setBusy(false); }
  }
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
  return <Dialog title="What I remember" onClose={() => { if (!busy) onClose(); }} wide>
    <div className="ws-memory-list">
      <div className="ws-memory-intro"><Brain size={23} /><div><h3>{t("Your personal preferences")}</h3><p>{t("Only preferences you ask me to remember. Your CVs, JDs and reminders are managed separately.")}</p></div></div>
      <div className="ws-memory-toolbar">
        <div className="ws-memory-tabs" role="group" aria-label={t("Memory status")}>
          <button aria-pressed={tab === "active"} onClick={() => { setTab("active"); setEditing(null); }}>{t("In use")} <span>{active.length}</span></button>
          <button aria-pressed={tab === "archived"} onClick={() => { setTab("archived"); setEditing(null); }}>{t("Forgotten")} <span>{archived.length}</span></button>
        </div>
        <button className="ws-button ws-memory-delete" disabled={busy || query.loading || !query.data || !(active.length + archived.length)} onClick={() => { setDeleting("all"); setError(""); }}><Trash2 size={14}/>{t("Clear all memories")}</button>
      </div>
      <label className="ws-memory-search"><Search size={16}/><input type="search" aria-label={t("Search memories")} placeholder={t("Search memories")} value={search} onChange={event => setSearch(event.target.value)} /></label>
      {deleting && <section className="ws-memory-confirm" role="alertdialog" aria-label={t("Delete memory permanently?")}>
        <h3>{t(deleting === "all" ? "Clear all memories?" : "Delete memory permanently?")}</h3>
        {deleting !== "all" && <p>{deleting.title}</p>}
        <p>{t("This permanently deletes the selected saved memories and their version history, including forgotten memories when clearing all. It cannot be undone. Original chats, CVs, JDs and scheduled reminders stay unchanged; past chats may still mention these preferences.")}</p>
        <div className="ws-actions"><button className="ws-button" disabled={busy} onClick={() => setDeleting(null)}>{t("Cancel")}</button><button className="ws-button ws-memory-delete" disabled={busy} onClick={() => void remove()}>{t(busy ? "Deleting…" : "Delete permanently")}</button></div>
      </section>}
      {notice && <p role="status" className="ws-memory-notice">{t(notice)}</p>}
      <ErrorNotice error={error || query.error} retry={query.error ? query.refresh : undefined} />
      {query.loading ? <Loading /> : <>
        {!visible.length && <div className="ws-memory-empty"><Brain size={28}/><h3>{t(search ? "No matching memories" : tab === "active" ? "No saved preferences yet" : "No forgotten memories")}</h3><p>{t(search ? "Try another search." : tab === "active" ? "Tell me in conversation: Remember that I prefer concise client updates." : "Preferences you forget appear here. You can restore or permanently delete them.")}</p></div>}
        {tab === "archived" && visible.length > 0 && <p className="ws-muted">{t("Forgotten preferences are not used in future replies.")}</p>}
        {visible.map(memory => <section className="ws-memory-card" key={memory.id}>
          {editing?.id === memory.id ? <form className="ws-form" onSubmit={event => change(memory, "edit", event)}>
            <Field label="Agreement name"><input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></Field>
            <Field label="What to remember"><textarea required rows={4} maxLength={2000} value={content} onChange={event => setContent(event.target.value)} /></Field>
            <div className="ws-actions"><button className="ws-button ws-button-primary" disabled={busy}>{t("Save")}</button><button type="button" className="ws-button" onClick={() => setEditing(null)} disabled={busy}>{t("Cancel")}</button></div>
          </form> : <>
            <h3>{memory.title}</h3>
            <AgentText content={memory.content} />
            <div className="ws-memory-actions">
              {typeof memory.details.source_conversation_id === "string" && <Link href={`/app?conversation=${memory.details.source_conversation_id}`} onClick={onClose}>{t("Original conversation")}</Link>}
              <small>{t("Updated")} {date(memory.updated_at)}</small>
              <button type="button" className="ws-text-button" disabled={busy} onClick={() => { setEditing(memory); setTitle(memory.title); setContent(memory.content); }}>{t("Edit")}</button>
              <button type="button" className="ws-text-button" disabled={busy} onClick={() => change(memory, tab === "active" ? "forget" : "restore")}>{t(tab === "active" ? "Forget this" : "Restore")}</button>
              <button type="button" className="ws-text-button ws-memory-delete" disabled={busy} onClick={() => { setDeleting(memory); setError(""); }}>{t("Delete permanently")}</button>
            </div>
          </>}
        </section>)}

      </>}
    </div>
  </Dialog>;
}
