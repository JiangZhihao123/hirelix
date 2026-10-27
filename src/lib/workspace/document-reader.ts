import mammoth from "mammoth";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { unzipSync } from "fflate";
import { load } from "cheerio";
import { createCanvas } from "@napi-rs/canvas";
import { WorkspaceError } from "./database";
import { getLogger } from "@/lib/logger";
import { pdfOptions } from "./pdf-options";
import { MAX_SOURCE_IMAGES, transcribeImages, type SourceImage } from "./vision";

export type ReadDocument = { text: string; images: SourceImage[] };
export const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];
export function boundedArchive(bytes: Uint8Array) {
  let expanded = 0;
  const paths = new Set<string>();
  unzipSync(bytes, {filter(entry) {
    if (paths.has(entry.name)) throw new WorkspaceError("This archive contains duplicate file paths. Repack it with unique paths before importing.");
    paths.add(entry.name);
    if (paths.size > 10000) throw new WorkspaceError("This archive contains more than 10,000 entries.");
    expanded += entry.originalSize;
    if (expanded > 30 * 1024 * 1024) throw new WorkspaceError("This document expands beyond the 30 MB processing limit");
    return false;
  }});
  return unzipSync(bytes);
}

/** Some exports omit extensions; identify a PDF only from its original bytes. */
export function archivedMediaType(bytes: Uint8Array) {
  return bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString("ascii") === "%PDF-"
    ? "application/pdf" : "application/octet-stream";
}

/** Read exactly one entry from the user's original archive; never extract to disk. */
export function readArchiveEntry(file: {name: string; bytes: Uint8Array}, path: string) {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new WorkspaceError("Choose a ZIP archive.");
  if (!path || path.startsWith("/") || path.endsWith("/") || path.includes("\u0000") || path.includes("\\") || path.split("/").some(part => part === ".."))
    throw new WorkspaceError("Choose a safe file path inside the ZIP.");
  const archive = boundedArchive(file.bytes);
  if (!Object.hasOwn(archive, path)) throw new WorkspaceError("This file was not found in the ZIP.", 404);
  const bytes = archive[path];
  return {name: path, bytes, media_type: archivedMediaType(bytes)};
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

export async function readDocument(file: {name: string; bytes: Uint8Array; media_type?: string}, imageBudget = MAX_SOURCE_IMAGES, readVisuals = true): Promise<ReadDocument> {
  const document = await readDocumentContent(file, imageBudget, readVisuals);
  // PDF font mappings and other source formats can contain NUL. PostgreSQL
  // text/jsonb cannot represent it; retain the original bytes, clean extracted text.
  const removed = document.text.split("\u0000").length - 1;
  if (removed) {
    getLogger({ component: "document_reader" }).warn({ removed_null_characters: removed }, "Removed unsupported NUL characters from extracted text");
    document.text = document.text.replaceAll("\u0000", "");
  }
  return readVisuals ? ensureContent(document) : document;
}

async function readDocumentContent(file: {name: string; bytes: Uint8Array; media_type?: string}, imageBudget: number, readVisuals: boolean): Promise<ReadDocument> {
  const extension = !file.name.includes(".") && file.media_type === "application/pdf"
    ? "pdf" : file.name.split(".").pop()?.toLowerCase() || "";
  if (extension === "zip") {
    const entries = Object.entries(boundedArchive(file.bytes)).filter(([path]) => !path.endsWith("/"));
    if (entries.length > 1000) throw new WorkspaceError("This ZIP contains more than 1,000 files.");
    return ensureContent({ text: `Archive inventory only. Enclosed file contents have not been read. Candidate tables and resumes can be processed by import_candidates when authorized.\n${entries.map(([path, bytes]) => JSON.stringify({ path, bytes: bytes.length })).join("\n")}`, images: [] });
  }
  if (IMAGE_EXTENSIONS.includes(extension)) {
    if (!readVisuals) return {text: "", images: []};
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
    const media = readVisuals ? Object.entries(archive).filter(([name]) => /^(word|ppt)\/media\//.test(name) && IMAGE_EXTENSIONS.includes(name.split(".").pop()?.toLowerCase() || "")) : [];
    if (media.length > imageBudget) throw new WorkspaceError("Use up to 20 images or PDF pages per message");
    const images: SourceImage[] = [];
    for (const [name, data] of media) images.push(await sourceImage(data, `${file.name}: ${name}`));
    if (images.length) text += `\nEmbedded visual sources (media order, not page order):\n${await transcribeImages(images)}`;
    return readVisuals ? ensureContent({text, images}) : {text, images};
  }
  if (extension === "pdf") {
    // Official PDF.js + its canvas factory retain full page graphics, including scans.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({...pdfOptions, data: new Uint8Array(file.bytes)});
    try {
      const pdf = await task.promise;
      if (readVisuals && pdf.numPages > imageBudget) throw new WorkspaceError("Use up to 20 images or PDF pages per message");
      const images: SourceImage[] = [], pages: string[] = [];
      let scanned = false, hasContent = false;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber), content = await page.getTextContent();
        const text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("");
        pages.push(`Page ${pageNumber}:\n${text}`);
        if (!readVisuals) { page.cleanup(); continue; }
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
      if (!readVisuals) return {text, images};
      if (!hasContent) throw new WorkspaceError("This PDF has no readable text or visual content");
      if (scanned) text += `\nVisual transcription of scanned pages:\n${await transcribeImages(images)}`;
      return ensureContent({text, images});
    } finally { await task.destroy(); }
  }
  throw new WorkspaceError("Use images, PDF, DOCX, XLSX, PPTX, CSV, TSV or text files");
}
