import mammoth from "mammoth";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { unzipSync } from "fflate";
import { load } from "cheerio";
import { createCanvas } from "@napi-rs/canvas";
import { WorkspaceError } from "./database";
import { MAX_SOURCE_IMAGES, transcribeImages, type SourceImage } from "./vision";

export type ReadDocument = { text: string; images: SourceImage[] };
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
export function boundedArchive(bytes: Uint8Array) {
  let expanded = 0;
  unzipSync(bytes, {filter(entry) {
    expanded += entry.originalSize;
    if (expanded > 30 * 1024 * 1024) throw new WorkspaceError("This document expands beyond the 30 MB processing limit");
    return false;
  }});
  return unzipSync(bytes);
}
export async function sourceImage(bytes: Uint8Array, label: string): Promise<SourceImage> {
  try {
    const data = await sharp(bytes, {limitInputPixels: 16777216}).rotate()
      .resize({width: 2048, height: 2048, fit: "inside", withoutEnlargement: true}).png().toBuffer();
    return {label, url: `data:image/png;base64,${data.toString("base64")}`};
  } catch { throw new WorkspaceError("This image is damaged or exceeds the 16 megapixel reading limit"); }
}
function ensureContent(document: ReadDocument) {
  if (!document.text.trim() && !document.images.length) throw new WorkspaceError("This file has no readable content");
  return document;
}

export async function readDocument(file: {name: string; bytes: Uint8Array}, imageBudget = MAX_SOURCE_IMAGES): Promise<ReadDocument> {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTENSIONS.includes(extension)) {
    if (imageBudget < 1) throw new WorkspaceError("Use up to 20 images or PDF pages per message");
    const images = [await sourceImage(file.bytes, file.name)];
    return {text: await transcribeImages(images), images};
  }
  if (["txt", "md", "csv", "tsv", "json", "html", "xml"].includes(extension)) {
    let text: string;
    try { text = new TextDecoder("utf-8", {fatal: true}).decode(file.bytes).replace(/^\uFEFF/, ""); }
    catch { throw new WorkspaceError("This text file is not readable as UTF-8"); }
    return ensureContent({text, images: []});
  }
  if (extension === "xlsx") {
    boundedArchive(file.bytes);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(file.bytes) as unknown as ExcelJS.Buffer);
    let cells = 0;
    const sheets = workbook.worksheets.map(sheet => {
      const lines: string[] = [];
      sheet.eachRow(row => {
        const values: Record<string, string> = {};
        row.eachCell(cell => {
          if (++cells > 20000) throw new WorkspaceError("This spreadsheet exceeds the 20,000 populated cell reading limit. Split it into smaller workbooks.");
          values[cell.address] = cell.text;
        });
        lines.push(JSON.stringify(values));
      });
      return `Worksheet: ${sheet.name}\n${lines.join("\n")}`;
    });
    return ensureContent({text: sheets.join("\n\n"), images: []});
  }
  if (["docx", "pptx"].includes(extension)) {
    const archive = boundedArchive(file.bytes);
    let text: string;
    if (extension === "docx") text = (await mammoth.extractRawText({buffer: Buffer.from(file.bytes)})).value;
    else text = Object.entries(archive).filter(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort(([a], [b]) => a.localeCompare(b, undefined, {numeric: true}))
      .map(([name, data]) => `${name}\n${load(Buffer.from(data).toString("utf8"), {xml: true})("a\\:t").toArray().map(node => load(node).text()).join("\n")}`).join("\n\n");
    const media = Object.entries(archive).filter(([name]) => /^(word|ppt)\/media\//.test(name) && IMAGE_EXTENSIONS.includes(name.split(".").pop()?.toLowerCase() || ""));
    if (media.length > imageBudget) throw new WorkspaceError("Use up to 20 images or PDF pages per message");
    const images: SourceImage[] = [];
    for (const [name, data] of media) images.push(await sourceImage(data, `${file.name}: ${name}`));
    if (images.length) text += `\nEmbedded visual sources (media order, not page order):\n${await transcribeImages(images)}`;
    return ensureContent({text, images});
  }
  if (extension === "pdf") {
    // Official PDF.js + its canvas factory retain full page graphics, including scans.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({data: new Uint8Array(file.bytes), disableFontFace: true, useSystemFonts: true, maxImageSize: 16777216});
    try {
      const pdf = await task.promise;
      if (pdf.numPages > imageBudget) throw new WorkspaceError("Use up to 20 images or PDF pages per message");
      const images: SourceImage[] = [], pages: string[] = [];
      let scanned = false, hasContent = false;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber), content = await page.getTextContent();
        const text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
        pages.push(`Page ${pageNumber}:\n${text}`);
        const operators = await page.getOperatorList();
        if (text.trim() || operators.fnArray.length) hasContent = true;
        if (text.trim().length < 40 && operators.fnArray.length) scanned = true;
        const viewport = page.getViewport({scale: 1});
        const scale = Math.min(2, 2048 / viewport.width, 2048 / viewport.height);
        const target = page.getViewport({scale});
        const canvas = createCanvas(Math.ceil(target.width), Math.ceil(target.height));
        await page.render({canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext("2d") as unknown as CanvasRenderingContext2D, viewport: target}).promise;
        images.push(await sourceImage(canvas.toBuffer("image/png"), `${file.name}, page ${pageNumber}`));
        page.cleanup();
      }
      let text = pages.join("\n\n");
      if (!hasContent) throw new WorkspaceError("This PDF has no readable text or visual content");
      if (scanned) text += `\nVisual transcription of scanned pages:\n${await transcribeImages(images)}`;
      return ensureContent({text, images});
    } finally { await task.destroy(); }
  }
  throw new WorkspaceError("Use images, PDF, DOCX, XLSX, PPTX, CSV, TSV or text files");
}
