"use client";
import { X, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useEffectEvent, useState } from "react";
import { useT } from "@/components/LanguageProvider";
import { AgentText } from "@/components/AgentText";
import { useQuery, ErrorNotice, Loading } from "./client";
import { DocumentDownloads } from "./document-download";
import { DocumentAttachments } from "./document-attachments";
import { SourceContent } from "./source-content";
import type { Person, Role, SourceRecord, Deliverable } from "@/lib/workspace/types";

function OriginalFile({ id, title }: { id: string; title: string }) {
  const t = useT();
  const href = `/api/workspace/files/${id}`;
  const query = useQuery<{ name: string; content: string; truncated: boolean; preview_type: string | null }>(`/files/${id}/text`);
  return <>
    <ErrorNotice error={query.error} retry={query.refresh} />
    {query.loading && !query.data && <Loading />}
    {query.data && <>
      {query.data.preview_type?.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="ws-source-image" src={`${href}?preview=1`} alt={query.data.name || title} />
      ) : query.data.preview_type === "application/pdf" ? <iframe className="ws-source-pdf" title={query.data.name || title} src={`${href}?preview=1`} /> : <SourceContent content={query.data.content || ""} />}
      {query.data.truncated && <p>{t("Preview limited to 100,000 characters. Open the original for the full file.")}</p>}
    </>}
    <div className="ws-actions">
      <a className="ws-link" href={`${href}?preview=1`} target="_blank" rel="noreferrer">{t("Open original file")} <ArrowUpRight size={13} /></a>
      <a className="ws-link" href={href}>{t("Download original file")}</a>
    </div>
  </>;
}

/** A read-only view over the same authorized detail endpoints used by Library. */
export function ContextPanel({ source, onClose }: { source: { title: string; href: string }; onClose: () => void }) {
  const t = useT();
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const dismiss = useEffectEvent(onClose);
  const [width, setWidth] = useState<number>();
  const resize = (next: number) => {
    const available = panel.current?.parentElement?.clientWidth || window.innerWidth;
    setWidth(Math.max(300, Math.min(next, Math.max(300, available - 360))));
  };
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    if (panel.current) panel.current.scrollTop = 0;
    close.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); prior?.focus(); };
  }, [source.href]);
  const url = new URL(source.href, "https://hirelix.online");
  const person = url.searchParams.get("person");
  const role = url.pathname.match(/^\/app\/roles\/([a-f0-9-]+)$/)?.[1];
  const file = url.pathname.match(/^\/api\/workspace\/files\/([a-f0-9-]+)$/)?.[1];
  const documentId = url.pathname.match(/^\/app\/(?:submissions|roles\/[a-f0-9-]+\/updates)\/([a-f0-9-]+)$/)?.[1];
  const recordId = url.searchParams.get("record");
  const path = person ? `/people/${person}` : role ? `/roles/${role}` : documentId ? `/deliverables/${documentId}` : null;
  const query = useQuery<{ deliverable?: Deliverable; person?: Person; role?: Role; records?: SourceRecord[]; name?: string; content?: string; truncated?: boolean; preview_type?: string | null }>(path);
  const refresh = query.refresh;
  useEffect(() => {
    window.addEventListener("hirelix:work-changed", refresh);
    window.addEventListener("hirelix:document-changed", refresh);
    return () => {
      window.removeEventListener("hirelix:work-changed", refresh);
      window.removeEventListener("hirelix:document-changed", refresh);
    };
  }, [refresh]);
  const record = query.data?.records?.find(item => item.id === recordId);
  return <><div className="ws-source-resizer" role="separator" aria-label={t("Resize details panel")} aria-orientation="vertical" aria-valuemin={300} aria-valuemax={Math.max(300, (panel.current?.parentElement?.clientWidth || 1200) - 360)} aria-valuenow={width || 360} tabIndex={0}
    onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }}
    onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) resize((panel.current?.getBoundingClientRect().right || 0) - event.clientX); }}
    onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}
    onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); resize((panel.current?.clientWidth || 360) + (event.key === "ArrowLeft" ? 32 : -32)); } }}
  /><aside ref={panel} style={width ? { flexBasis: width } : undefined} className={`ws-source-panel ${documentId ? "ws-source-panel-document" : ""}`} aria-label={t("Source details")}>
    <header><strong>{t(recordId ? "Source record" : documentId ? "Saved document" : person ? "Candidate" : role ? "Role" : file ? "Original file" : "Source details")}</strong><button ref={close} className="ws-icon" onClick={onClose} aria-label={t("Close source details")}><X size={18} /></button></header>
    <ErrorNotice error={query.error} retry={query.refresh} />
    {query.loading && !query.data && <Loading />}
    {recordId && query.data && !record && <ErrorNotice error="This source record is no longer available." />}
    {record && <><small>{t("Source record")}</small><h3>{record.title}</h3>{record.file_id ? <OriginalFile key={record.file_id} id={record.file_id} title={record.title} /> : <SourceContent content={record.content} />}</>}
    {!recordId && query.data?.person && <><h3>{query.data.person.name}</h3><p>{query.data.person.headline}</p><p>{query.data.person.location}</p><SourceContent content={JSON.stringify(query.data.person.profile)} />{query.data.records?.map(item => <details key={item.id}><summary>{item.title}</summary><SourceContent content={item.content} /></details>)}</>}
    {!recordId && query.data?.role && <><h3>{query.data.role.title}</h3><p>{query.data.role.client_name}</p><h4>{t("Current requirements")}</h4><div className="ws-role-requirements">{([
      ["priorities", "Confirmed priorities"],
      ["flexible", "Flexible requirements"],
      ["unknowns", "Still to clarify"],
    ] as const).map(([key, label]) => <section key={key}><h5>{t(label)}</h5>{query.data?.role?.brief[key]?.length ? <ul>{query.data.role.brief[key].map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="ws-muted">{t("Not recorded yet.")}</p>}</section>)}</div><h4>{t("Original job description")}</h4><p className="ws-muted text-sm">{t("Reference text. Later clarifications are shown in Current requirements above.")}</p><p className="whitespace-pre-wrap">{query.data.role.jd_text}</p></>}
    {query.data?.deliverable && <><h3>{query.data.deliverable.title}</h3><AgentText content={query.data.deliverable.content} /><small>{t("Saved version")} {query.data.deliverable.version}</small><DocumentDownloads document={query.data.deliverable} onRefresh={query.refresh} /></>}
    {query.data?.deliverable && <DocumentAttachments document={query.data.deliverable} />}
    {file && <OriginalFile key={file} id={file} title={source.title} />}
    {!file && <a className="ws-link" href={source.href} target="_blank" rel="noreferrer">{t("Open full details")} <ArrowUpRight size={13} /></a>}
  </aside></>;
}
