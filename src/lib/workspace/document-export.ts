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
export async function renderDocument(
  title: string,
  content: string,
  format: "pdf" | "docx",
) {
  const paragraphs = blocks(title, content);
  if (format === "docx") {
    fontBytes ??= readFile(
      path.join(process.cwd(), "src/assets/fonts/NotoSansSC-Regular.ttf"),
    );
    const fontData = await fontBytes;
    const doc = new Document({
      fonts: [{ name: "Noto Sans SC", data: fontData }],
      creator: "Hirelix",
      title,
      styles: {
        default: {
          document: {
            run: {
              font: {
                ascii: "Noto Sans SC",
                hAnsi: "Noto Sans SC",
                eastAsia: "Noto Sans SC",
                cs: "Noto Sans SC",
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
