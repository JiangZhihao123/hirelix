import { createCanvas } from "@napi-rs/canvas";
import { pdfOptions } from "./pdf-options";
import { WorkspaceError } from "./database";

/** Render only the first page, with a bounded canvas; never run OCR or an LLM. */
export async function pdfThumbnail(bytes: Uint8Array) {
  return renderPdfPage(bytes, 1, 440, 560);
}

/** Render the selected original page for browsers that cannot embed a PDF viewer. */
export async function pdfPagePreview(bytes: Uint8Array, pageNumber: number) {
  if (!Number.isSafeInteger(pageNumber) || pageNumber < 1) throw new WorkspaceError("Choose a valid PDF page.");
  return renderPdfPage(bytes, pageNumber, 1200, 1800);
}

async function renderPdfPage(bytes: Uint8Array, pageNumber: number, width: number, height: number) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({...pdfOptions, data: new Uint8Array(bytes)});
  try {
    const pdf = await task.promise;
    if (pageNumber > pdf.numPages) throw new WorkspaceError("This PDF page does not exist.");
    const page = await pdf.getPage(pageNumber);
    const original = page.getViewport({scale: 1});
    const viewport = page.getViewport({scale: Math.min(width / original.width, height / original.height)});
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D, viewport}).promise;
    return {pages: pdf.numPages, image: `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`};
  } finally { await task.destroy(); }
}
