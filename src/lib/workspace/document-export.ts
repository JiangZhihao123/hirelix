import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderPdfDocument } from "./document-pdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { owned, expectVersion } from "./database";
import type { Deliverable } from "./types";
import { attachment } from "./files";

// Formatting only: no model rewrite, source lookup or extra private fields during export.
function blocks(title: string, content: string) {
  return [
    { text: title, level: 1 },
    ...content
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => {
        const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
        const text = (heading ? heading[2] : line)
          .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\*([^*]+)\*/g, "$1")
          .replace(/`([^`]+)`/g, "$1");
        return { text, level: heading ? 2 : 0 };
      }),
  ];
}
let fontBytes: Promise<Buffer> | undefined;
// CJK ideographs, kana, hangul, CJK punctuation and full-width forms.
const CJK_TEXT = /[\u2E80-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/;
export async function renderDocument(
  title: string,
  content: string,
  format: "pdf" | "docx",
) {
  const paragraphs = blocks(title, content);
  if (format === "docx") {
    // The CJK font is ~10.6MB. Embed it only for documents that can actually
    // render CJK glyphs; an English client document stays a few kilobytes.
    const fontData = CJK_TEXT.test(`${title}\n${content}`)
      ? await (fontBytes ??= readFile(
          path.join(process.cwd(), "src/assets/fonts/NotoSansSC-Regular.ttf"),
        ))
      : undefined;
    const doc = new Document({
      ...(fontData ? { fonts: [{ name: "Noto Sans SC", data: fontData }] } : {}),
      creator: "Hirelix",
      title,
      styles: {
        default: {
          document: {
            run: {
              font: {
                // Keep Latin text on a Latin font: using the CJK font for every
                // script collapses wrapped line spacing in LibreOffice.
                ascii: "Arial",
                hAnsi: "Arial",
                eastAsia: "Noto Sans SC",
                cs: "Arial",
              },
              size: 22,
              color: "242824",
            },
            paragraph: { spacing: { after: 160, line: 276 } },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
            },
          },
          children: paragraphs.map(
            (block) =>
              new Paragraph({
                heading:
                  block.level === 1
                    ? HeadingLevel.TITLE
                    : block.level === 2
                      ? HeadingLevel.HEADING_2
                      : undefined,
                keepNext: !!block.level,
                children: [
                  new TextRun({
                    text: block.text,
                    color: "242824",
                    bold: !!block.level,
                    size: block.level === 1 ? 36 : block.level === 2 ? 26 : 22,
                  }),
                ],
              }),
          ),
        },
      ],
    });
    return new Uint8Array(await Packer.toBuffer(doc));
  }
  return renderPdfDocument(title, content);
}
export async function exportDocument(
  userId: string,
  id: string,
  format: "pdf" | "docx",
  version: number,
) {
  const document = await owned<Deliverable>(userId, "deliverable", id);
  expectVersion(document.version, version);
  const bytes = await renderDocument(document.title, document.content, format);
  const filename =
    document.title.replace(/[\\/\r\n\x00-\x1f]/g, " ").slice(0, 120) ||
    "Client document";
  return attachment(
    bytes,
    `${filename}.${format}`,
    format === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
}
