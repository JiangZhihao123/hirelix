"use client";
import { useEffect, useRef } from "react";
import { attachmentPreviewType } from "@/lib/workspace/attachments";

export function AttachmentThumbnail({name, file, href}: {name: string; file?: File; href?: string}) {
  const element = useRef<HTMLImageElement>(null);
  const image = attachmentPreviewType(name)?.startsWith("image/");
  useEffect(() => {
    if (!image || !file) return;
    const url = URL.createObjectURL(file);
    if (element.current) element.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, image]);
  if (!image || (!file && !href)) return null;
  // Private files and temporary browser blobs are served by their existing owner.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={element} className="ws-attachment-thumbnail" src={file ? undefined : href} alt="" onError={event => { event.currentTarget.hidden = true; }} />;
}
