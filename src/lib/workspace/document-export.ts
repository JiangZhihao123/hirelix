import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
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
            paragraph: { spacing: { after: 280, line: 480 } },
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
  const pdf = await PDFDocument.create();
  const latin = await pdf.embedFont(StandardFonts.Helvetica);
  const needsCjk = paragraphs.some((block) =>
    [...block.text].some((character) => {
      try {
        latin.encodeText(character);
        return false;
      } catch {
        return true;
      }
    }),
  );
  let cjk: PDFFont | null = null;
  if (needsCjk) {
    fontBytes ??= readFile(
      path.join(process.cwd(), "src/assets/fonts/NotoSansSC-Regular.ttf"),
    );
    pdf.registerFontkit(fontkit);
    cjk = await pdf.embedFont(await fontBytes, { subset: false });
  }
  const fontCache = new Map<string, PDFFont>();
  function fontFor(character: string) {
    const cached = fontCache.get(character);
    if (cached) return cached;
    let selected = latin;
    try {
      latin.encodeText(character);
    } catch {
      if (!cjk) throw new Error(`The PDF font cannot encode ${character}`);
      cjk.encodeText(character);
      selected = cjk;
    }
    fontCache.set(character, selected);
    return selected;
  }
  pdf.setTitle(title);
  pdf.setCreator("Hirelix");
  const width = 595.28,
    height = 841.89,
    margin = 54,
    available = width - margin * 2;
  let page = pdf.addPage([width, height]),
    y = height - margin;
  function newPage() {
    page = pdf.addPage([width, height]);
    y = height - margin;
  }
  for (const block of paragraphs) {
    const size = block.level === 1 ? 19 : block.level === 2 ? 13 : 11;
    const lineHeight = size * 1.55;
    if (block.level && y < margin + lineHeight * 3) newPage();
    const lines: string[] = [];
    let line = "",
      lineWidth = 0;
    // Preserve words where possible; long URLs and CJK paragraphs still wrap without clipping.
    for (const token of block.text.split(/(\s+)/)) {
      const tokenWidth = [...token].reduce(
        (width, character) =>
          width + fontFor(character).widthOfTextAtSize(character, size),
        0,
      );
      if (line.trim() && lineWidth + tokenWidth > available) {
        lines.push(line.trimEnd());
        line = "";
        lineWidth = 0;
      }
      for (const char of token) {
        if (!line && /\s/.test(char)) continue;
        const width = fontFor(char).widthOfTextAtSize(char, size);
        if (lineWidth + width > available && line.trim()) {
          lines.push(line.trimEnd());
          line = "";
          lineWidth = 0;
        }
        line += char;
        lineWidth += width;
      }
    }
    if (line.trim()) lines.push(line.trimEnd());
    for (const lineText of lines) {
      if (y - lineHeight < margin) newPage();
      y -= lineHeight;
      let x = margin,
        run = "",
        runFont: PDFFont | null = null;
      const drawRun = () => {
        if (!run || !runFont) return;
        page.drawText(run, {
          x,
          y,
          size,
          font: runFont,
          color: rgb(0.14, 0.16, 0.14),
        });
        x += runFont.widthOfTextAtSize(run, size);
      };
      for (const character of lineText) {
        const nextFont = fontFor(character);
        if (runFont && nextFont !== runFont) {
          drawRun();
          run = "";
        }
        runFont = nextFont;
        run += character;
      }
      drawRun();
    }
    y -= block.level ? 10 : 7;
  }
  return pdf.save();
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
