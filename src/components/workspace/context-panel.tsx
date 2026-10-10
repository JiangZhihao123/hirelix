"use client";
import { X, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useEffectEvent } from "react";
import { useT } from "@/components/LanguageProvider";
import { AgentText } from "@/components/AgentText";
import { useQuery, ErrorNotice, Loading } from "./client";
import { SourceContent } from "./source-content";
import type { Person, Role, SourceRecord, Deliverable } from "@/lib/workspace/types";

/** A read-only view over the same authorized detail endpoints used by Library. */
export function ContextPanel({ source, onClose }: { source: { title: string; href: string }; onClose: () => void }) {
  const t = useT();
  const close = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const dismiss = useEffectEvent(onClose);
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
  const path = person ? `/people/${person}` : role ? `/roles/${role}` : file ? `/files/${file}/text` : documentId ? `/deliverables/${documentId}` : null;
  const query = useQuery<{ deliverable?: Deliverable; person?: Person; role?: Role; records?: SourceRecord[]; name?: string; content?: string; truncated?: boolean; preview_type?: string | null }>(path);
  const record = query.data?.records?.find(item => item.id === recordId);
  return <aside ref={panel} className="ws-source-panel" aria-label={t("Source details")}>
    <header><strong>{source.title}</strong><button ref={close} className="ws-icon" onClick={onClose} aria-label={t("Close source details")}><X size={18} /></button></header>
    <ErrorNotice error={query.error} retry={query.refresh} />
    {query.loading && !query.data && <Loading />}
    {recordId && query.data && !record && <ErrorNotice error="This source record is no longer available." />}
    {record && <><small>{t("Source record")} · {record.kind}</small><h3>{record.title}</h3><SourceContent content={record.content} />{record.file_id && <a className="ws-button" href={`/api/workspace/files/${record.file_id}`}>{t("Open original file")}<ArrowUpRight size={13} /></a>}</>}
    {!recordId && query.data?.person && <><h3>{query.data.person.name}</h3><p>{query.data.person.headline}</p><p>{query.data.person.location}</p><SourceContent content={JSON.stringify(query.data.person.profile)} />{query.data.records?.map(item => <details key={item.id}><summary>{item.title}</summary><SourceContent content={item.content} /></details>)}</>}
    {!recordId && query.data?.role && <><h3>{query.data.role.title}</h3><p>{query.data.role.client_name}</p><h4>{t("Current requirements")}</h4><div className="ws-role-requirements">{([
      ["priorities", "Confirmed priorities"],
      ["flexible", "Flexible requirements"],
      ["unknowns", "Still to clarify"],
    ] as const).map(([key, label]) => <section key={key}><h5>{t(label)}</h5>{query.data?.role?.brief[key]?.length ? <ul>{query.data.role.brief[key].map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="ws-muted">{t("Not recorded yet.")}</p>}</section>)}</div><h4>{t("Original job description")}</h4><p className="ws-muted text-sm">{t("Reference text. Later clarifications are shown in Current requirements above.")}</p><p className="whitespace-pre-wrap">{query.data.role.jd_text}</p></>}
    {query.data?.deliverable && <><h3>{query.data.deliverable.title}</h3><AgentText content={query.data.deliverable.content} /><small>{t("Saved version")} {query.data.deliverable.version}</small></>}
    {file && query.data && <>
      {query.data.preview_type?.startsWith("image/") ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="ws-source-image" src={`${source.href}?preview=1`} alt={query.data.name || source.title} />
      ) : query.data.preview_type === "application/pdf" ? <iframe className="ws-source-pdf" title={query.data.name || source.title} src={`${source.href}?preview=1`} /> : <SourceContent content={query.data.content || ""} />}
      {query.data.truncated && <p>{t("Preview limited to 100,000 characters. Open the original for the full file.")}</p>}
    </>}
    <a className="ws-link" href={source.href} target="_blank" rel="noreferrer">{t(file ? "Download original file" : "Open full details")} <ArrowUpRight size={13} /></a>
  </aside>;
}
