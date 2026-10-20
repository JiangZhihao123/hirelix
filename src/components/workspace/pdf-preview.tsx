"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { ErrorNotice, Loading, useQuery } from "./client";

export function PdfPreview({id, title}: {id: string; title: string}) {
  const {locale} = useLanguage();
  const zh = locale === "zh";
  const [page, setPage] = useState(1), [zoom, setZoom] = useState(1);
  const preview = useQuery<{pages: number; image: string}>(`/files/${id}?page=${page}`);
  return <div className="ws-pdf-preview" aria-label={`${title} ${zh ? "预览" : "preview"}`}>
    <div className="ws-pdf-toolbar">
      <button className="ws-icon" aria-label={zh ? "上一页" : "Previous PDF page"} disabled={page <= 1 || preview.loading} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /></button>
      <span role="status">{zh ? `第 ${page} 页` : `Page ${page}`}{preview.data ? ` / ${preview.data.pages}` : ""}</span>
      <button className="ws-icon" aria-label={zh ? "下一页" : "Next PDF page"} disabled={!preview.data || page >= preview.data.pages || preview.loading} onClick={() => setPage(page + 1)}><ChevronRight size={16} /></button>
      <button className="ws-icon" aria-label={zh ? "缩小" : "Zoom out PDF"} disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - 0.5))}><ZoomOut size={16} /></button>
      <button className="ws-icon" aria-label={zh ? "放大" : "Zoom in PDF"} disabled={zoom >= 2.5} onClick={() => setZoom(Math.min(2.5, zoom + 0.5))}><ZoomIn size={16} /></button>
    </div>
    <ErrorNotice error={preview.error} retry={preview.refresh} />
    {preview.loading && <Loading>{zh ? "正在打开 PDF…" : "Opening PDF…"}</Loading>}
    {preview.data && !preview.loading && <div className="ws-pdf-viewport" key={page}>
      {/* The image is an authorized rendering of the original PDF page. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img style={{width:`${zoom * 100}%`}} src={preview.data.image} alt={`${title} — ${zh ? "第" : "page"} ${page}${zh ? " 页" : ""}`} />
    </div>}
  </div>;
}
