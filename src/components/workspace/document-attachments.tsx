"use client";

import { ArrowUpRight, Download, Paperclip } from "lucide-react";
import { useT } from "@/components/LanguageProvider";
import type { Deliverable } from "@/lib/workspace/types";
import type { SubmissionCv } from "@/lib/workspace/deliverables";

/** Show the selected original files alongside the written document on every surface. */
export function DocumentAttachments({ document, showEmpty = false }: { document: Deliverable; showEmpty?: boolean }) {
  const t = useT();
  const source = document.source_snapshot as {
    files?: SubmissionCv[];
    people?: Array<{ id: string; name: string }>;
  };
  const files = document.file_ids.map(id => ({
    id,
    file: source.files?.find(file => file.id === id),
  }));
  if (!files.length && !showEmpty) return null;
  if (document.kind !== "submission") return null;

  return <section className="ws-document-attachments" aria-label={t("CV attachments")}>
    <h3>{t("CV attachments")}{files.length > 0 && <span> · {files.length}</span>}</h3>
    <p className="ws-muted">{t("PDF and DOCX exports contain the recommendation only. Download CV attachments separately.")}</p>
    {files.map(({ id, file }) => {
      const name = file?.name || t("Original attachment");
      const person = source.people?.find(person => person.id === file?.person_id);
      const href = `/api/workspace/files/${id}`;
      return <div className="ws-document-attachment" key={id}>
        <div><Paperclip size={15} /><span><strong>{name}</strong>{person && <small>{person.name}</small>}</span></div>
        <div className="ws-actions">
          <a className="ws-link" href={`${href}?preview=1`} target="_blank" rel="noreferrer" aria-label={`${t("Open original file")}: ${name}`}>{t("Open original file")}<ArrowUpRight size={13} /></a>
          <a className="ws-link" href={href} download={name} aria-label={`${t("Download original file")}: ${name}`}>{t("Download original file")}<Download size={13} /></a>
        </div>
      </div>;
    })}
    {showEmpty && source.people?.filter(person => !files.some(({ file }) => file?.person_id === person.id)).map(person => <p className="ws-muted" key={person.id}>{person.name} · {t("No CV selected for this person.")}</p>)}
  </section>;
}
