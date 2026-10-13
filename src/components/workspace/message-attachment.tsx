"use client";
/* eslint-disable @next/next/no-img-element -- Authenticated PDF thumbnails are generated locally as data URLs. */
import {useT} from "@/components/LanguageProvider";
import {useEffect, useState} from "react";
import {FileText, FileSpreadsheet, Presentation, File, Code} from "lucide-react";
import {attachmentPreviewType} from "@/lib/workspace/attachments";
import {AttachmentThumbnail} from "./attachment-thumbnail";

export function MessageAttachment({name, size, file, id, onOpen}: {name: string; size: number; file?: globalThis.File; id?: string; onOpen?: () => void}) {
  const t = useT();
  const extension = name.split(".").pop()?.toLowerCase() || "";
  const image = attachmentPreviewType(name)?.startsWith("image/");
  const pdf = extension === "pdf";
  const [result, setPreview] = useState<{id: string; image: string; pages: number} | null>(null);
  const preview = result?.id === id ? result : null;
  const [failedId, setFailed] = useState<string>();
  const failed = !!id && failedId === id;
  useEffect(() => {
    if (!pdf || !id) return;
    const controller = new AbortController();
    void fetch(`/api/workspace/files/${id}?thumbnail=1`, {signal: controller.signal}).then(async response => {
      if (!response.ok) throw new Error("Preview unavailable");
      const result = await response.json();
      if (!controller.signal.aborted) setPreview({...result, id});
    }).catch(() => { if (!controller.signal.aborted) setFailed(id); });
    return () => controller.abort();
  }, [id, pdf]);
  const Icon = ["xlsx", "xls", "csv", "tsv"].includes(extension) ? FileSpreadsheet : ["pptx", "ppt"].includes(extension) ? Presentation : ["json", "html", "xml"].includes(extension) ? Code : ["pdf", "docx", "doc", "txt", "md"].includes(extension) ? FileText : File;
  const bytes = size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.ceil(size / 1024))} KB`;
  const contents = <>
    {image ? <AttachmentThumbnail name={name} file={file} href={id ? `/api/workspace/files/${id}?preview=1` : undefined} /> : pdf && <div className="ws-file-cover">
      {preview ? <img src={preview.image} alt="" /> : <FileText size={36} aria-hidden="true" />}
    </div>}
    <span className="ws-file-caption"><Icon size={24} className={`ws-file-icon ws-file-icon-${extension}`} aria-hidden="true" /><span><strong>{name}</strong><small>{extension.toUpperCase() || "FILE"} · {bytes}{preview ? ` · ${preview.pages} p.` : ""}{failed ? ` · ${t("Preview unavailable")}` : ""}</small></span></span>
  </>;
  const className = `ws-file-card${pdf ? " ws-file-card-pdf" : ""}${image ? " ws-file-card-image" : ""}`;
  return onOpen ? <button type="button" className={className} title={name} aria-label={name} onClick={onOpen}>{contents}</button> : <div className={className} title={name}>{contents}</div>;
}
