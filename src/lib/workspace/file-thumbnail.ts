import { createCanvas } from "@napi-rs/canvas";
import { pdfOptions } from "./pdf-options";

/** Render only the first page, with a bounded canvas; never run OCR or an LLM. */
export async function pdfThumbnail(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({...pdfOptions, data: new Uint8Array(bytes)});
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const original = page.getViewport({scale: 1});
    const viewport = page.getViewport({scale: Math.min(1, 440 / original.width, 560 / original.height)});
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D, viewport}).promise;
    return {pages: pdf.numPages, image: `data:image/png;base64,${canvas.toBuffer("image/png").toString("base64")}`};
  } finally { await task.destroy(); }
}
