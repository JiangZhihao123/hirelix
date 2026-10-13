"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/components/LanguageProvider";
import { ErrorNotice, useQuery } from "./client";
import { DocumentAttachments } from "./document-attachments";
import type { Deliverable } from "@/lib/workspace/types";

export async function downloadDocument(document: Pick<Deliverable, "id" | "version" | "title">, format: "pdf" | "docx") {
  const response = await fetch(`/api/workspace/deliverables/${document.id}/export?format=${format}&version=${document.version}`);
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error || "Could not export this document");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `${document.title}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function DocumentDownloads({ document, onRefresh, formats = ["pdf", "docx"] }: { document: Deliverable; onRefresh: () => void; formats?: Array<"pdf" | "docx"> }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState("");
  async function download(format: "pdf" | "docx") {
    setBusy(format); setError("");
    try { await downloadDocument(document, format); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not export this document"); }
    finally { setBusy(null); }
  }
  return <div><div className="ws-actions">{formats.map(format => <button type="button" className="ws-button" key={format} disabled={!!busy} onClick={() => void download(format)}>{t(busy === format ? "Preparing…" : "Export")} {format.toUpperCase()}</button>)}</div><ErrorNotice error={error} retry={() => { setError(""); onRefresh(); }} /></div>;
}

export function ConversationExports({ documentId, formats }: { documentId: string; formats: Array<"pdf" | "docx"> }) {
  const t = useT();
  const query = useQuery<{deliverable: Deliverable}>(`/deliverables/${documentId}`);
  const refresh = query.refresh;
  useEffect(() => {
    window.addEventListener("hirelix:work-changed",refresh);
    window.addEventListener("hirelix:document-changed",refresh);
    return () => { window.removeEventListener("hirelix:work-changed",refresh); window.removeEventListener("hirelix:document-changed",refresh); };
  },[refresh]);
  return <section className="ws-assistant-delivery ws-conversation-exports"><ErrorNotice error={query.error} retry={query.refresh} />{query.data && <><strong>{query.data.deliverable.title}</strong><p>{t("Saved version")} {query.data.deliverable.version}</p><Link className="ws-link" href={query.data.deliverable.kind === "search_update" ? `/app/roles/${query.data.deliverable.role_id}/updates/${documentId}` : `/app/submissions/${documentId}`}>{t("Open document")} ↗</Link><DocumentDownloads document={query.data.deliverable} formats={formats} onRefresh={query.refresh} /><DocumentAttachments document={query.data.deliverable} /></>}</section>;
}
