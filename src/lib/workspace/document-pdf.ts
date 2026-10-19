import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, TextRenderingMode, pushGraphicsState, popGraphicsState, setTextRenderingMode, setLineWidth, setStrokingColor, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import type { RootContent, PhrasingContent } from "mdast";

// Preserve Markdown structure without rewriting, enriching or interpreting the document.
type Span = { text: string; bold?: boolean; italic?: boolean };
type TextBlock = { kind: "text"; spans: Span[]; heading?: number; indent?: number; marker?: string; quote?: boolean };
type Block = TextBlock | { kind: "rule" } | { kind: "table"; rows: Span[][][] };
const parser = unified().use(remarkParse).use(remarkGfm);
function inline(nodes: PhrasingContent[], style: Omit<Span, "text"> = {}): Span[] {
  return nodes.flatMap((node): Span[] => {
    if (node.type === "text" || node.type === "inlineCode") return [{ ...style, text: node.value.replace(/\s*\n\s*/g, " ") }];
    if (node.type === "break") return [{ ...style, text: "\n" }];
    if (node.type === "strong") return inline(node.children, { ...style, bold: true });
    if (node.type === "emphasis") return inline(node.children, { ...style, italic: true });
    if (node.type === "link") return [...inline(node.children, style), { ...style, text: ` (${node.url})` }];
    if (node.type === "image") return [{ ...style, text: node.alt || "" }];
    if ("children" in node) return inline(node.children as PhrasingContent[], style);
    return [];
  });
}
function blocks(nodes: RootContent[], indent = 0, quote = false): Block[] {
  return nodes.flatMap((node): Block[] => {
    if (node.type === "heading") return [{ kind: "text", spans: inline(node.children), heading: node.depth, indent, quote }];
    if (node.type === "paragraph") {
      // A standalone bold line is a visual section label, not body text.
      const label = node.children.length === 1 && node.children[0].type === "strong";
      return [{ kind: "text", spans: inline(node.children), ...(label ? { heading: 3 } : {}), indent, quote }];
    }
    if (node.type === "list") return node.children.flatMap((item, index) => {
      const children = blocks(item.children, indent + 14, quote);
      const first = children.find(block => block.kind === "text");
      if (first?.kind === "text") first.marker = item.checked != null ? (item.checked ? "[x]" : "[ ]") : node.ordered ? `${(node.start ?? 1) + index}.` : "•";
      return children;
    });
    if (node.type === "blockquote") return blocks(node.children, indent + 12, true);
    if (node.type === "thematicBreak") return [{ kind: "rule" }];
    if (node.type === "code") return [{ kind: "text", spans: [{ text: node.value }], indent: indent + 10 }];
    if (node.type === "table") return [{ kind: "table", rows: node.children.map(row => row.children.map(cell => inline(cell.children))) }];
    return [];
  });
}

/** CJK can wrap between characters; Latin words stay intact unless wider than the column. */
export function wrapPdfText(spans: Span[], available: number, measure: (span: Span) => number): Span[][] {
  const units: Span[][] = [];
  const closing = /^[，。！？；：、）》」』】〉〕.,!?;:%）\]}]$/u;
  const opening = /^[（《「『【〈〔(\[{]$/u;
  for (const span of spans) {
    const tokens = span.text.match(/\n|[^\S\n]+|[（(][^（）()\n]{1,20}[）)]|[\p{Script=Latin}\p{N}]+(?:[.'’/+_@#%-][\p{Script=Latin}\p{N}]+)*|[^\s]/gu) || [];
    for (const text of tokens) {
      const token = { ...span, text };
      const previous = units.at(-1);
      const last = previous?.at(-1)?.text;
      if (previous && last !== "\n" && (closing.test(text) || (last && opening.test(last)))) previous.push(token);
      else units.push([token]);
    }
  }
  const lines: Span[][] = [];
  let line: Span[] = [], width = 0;
  const flush = () => {
    while (line.length && /^\s+$/.test(line.at(-1)!.text)) line.pop();
    lines.push(line); line = []; width = 0;
  };
  for (const unit of units) {
    if (unit[0].text === "\n") { flush(); continue; }
    const unitWidth = unit.reduce((sum, span) => sum + measure(span), 0);
    if (width + unitWidth > available && line.length) flush();
    if (!line.length && unit.every(span => /^\s+$/.test(span.text))) continue;
    if (unitWidth <= available) { line.push(...unit); width += unitWidth; continue; }
    // Only an oversized unbroken token (e.g. a URL) needs character-level wrapping.
    for (const span of unit) for (const text of span.text) {
      const char = { ...span, text }, charWidth = measure(char);
      if (width + charWidth > available && line.length) flush();
      line.push(char); width += charWidth;
    }
  }
  if (line.length) flush();
  return lines.length ? lines : [[]];
}

let fontBytes: Promise<Buffer> | undefined;
export async function renderPdfDocument(title: string, content: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title); pdf.setCreator("Hirelix");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const boldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);
  let cjk: PDFFont | undefined;
  try { regular.encodeText((title + content).replace(/[\r\n\t]/g, " ")); } catch {
    pdf.registerFontkit(fontkit);
    fontBytes ??= readFile(path.join(process.cwd(), "src/assets/fonts/NotoSansSC-Regular.ttf"));
    cjk = await pdf.embedFont(await fontBytes, { subset: false });
  }
  const fontFor = (character: string, span: Span) => {
    try { regular.encodeText(character); return span.bold ? (span.italic ? boldItalic : bold) : span.italic ? italic : regular; }
    catch { if (!cjk) throw new Error("Missing document font"); return cjk; }
  };
  function runs(span: Span) {
    const result: Array<{ text: string; font: PDFFont }> = [];
    for (const character of span.text) {
      const font = fontFor(character, span), last = result.at(-1);
      if (last?.font === font) last.text += character;
      else result.push({ text: character, font });
    }
    return result;
  }
  const measure = (span: Span, size: number) => runs(span).reduce((sum, run) => sum + run.font.widthOfTextAtSize(run.text, size), 0);
  const wrap = (spans: Span[], width: number, size: number) => wrapPdfText(spans, width, span => measure(span, size));
  const ink = rgb(0.16, 0.19, 0.18), green = rgb(0.17, 0.33, 0.28), muted = rgb(0.43, 0.48, 0.45), rule = rgb(0.85, 0.89, 0.86);
  const pageWidth = 595.28, pageHeight = 841.89, margin = 48, bottom = 52, available = pageWidth - margin * 2;
  let page!: PDFPage, y = 0;
  function drawLine(line: Span[], x: number, baseline: number, size: number, color = ink) {
    // Merge matching styles for natural kerning and compact selectable text.
    const merged: Span[] = [];
    for (const span of line) {
      const last = merged.at(-1);
      if (last && last.bold === span.bold && last.italic === span.italic) last.text += span.text;
      else merged.push({ ...span });
    }
    for (const span of merged) for (const run of runs(span)) {
      const cjkBold = run.font === cjk && span.bold;
      if (cjkBold) page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.FillAndOutline), setLineWidth(0.2), setStrokingColor(color));
      page.drawText(run.text, { x, y: baseline, size, font: run.font, color });
      if (cjkBold) page.pushOperators(popGraphicsState());
      x += run.font.widthOfTextAtSize(run.text, size);
    }
  }
  function newPage(first = false) {
    page = pdf.addPage([pageWidth, pageHeight]); y = pageHeight - margin;
    page.drawText("Hirelix", { x: margin, y: y - 9, font: bold, size: 10, color: green });
    page.drawLine({ start: { x: margin, y: y - 21 }, end: { x: pageWidth - margin, y: y - 21 }, color: rule, thickness: 0.7 });
    y -= first ? 42 : 36;
  }
  newPage(true);
  function textStyle(block: TextBlock, isTitle = false) {
    const majorHeading = !!block.heading && block.heading <= 2;
    return {
      majorHeading,
      size: isTitle ? 22 : block.heading ? (majorHeading ? 16 : 12) : 11,
      leading: isTitle ? 28 : block.heading ? (majorHeading ? 22 : 17) : 16.5,
      before: block.heading && !isTitle ? (majorHeading ? 14 : 8) : 0,
      after: isTitle ? 16 : block.heading ? (majorHeading ? 8 : 4) : block.marker ? 4 : 8,
      indent: Math.min(block.indent || 0, available / 3),
      spans: block.heading || isTitle ? block.spans.map(span => ({ ...span, bold: true })) : block.spans,
    };
  }
  function renderText(block: TextBlock, isTitle = false) {
    const { majorHeading, size, leading, before, after, indent, spans } = textStyle(block, isTitle);
    let lines = wrap(spans, available - indent, size);
    if (isTitle && lines.length > 1) {
      // Balance a multiline title so a final name/word is not stranded alone.
      const lineCount = lines.length;
      let low = (available - indent) / 2, high = available - indent;
      for (let step = 0; step < 12; step++) {
        const width = (low + high) / 2;
        if (wrap(spans, width, size).length > lineCount) low = width;
        else high = width;
      }
      lines = wrap(spans, high, size);
    }
    // Reserve the following two body lines with a heading. Split long paragraphs
    // using widow/orphan control instead of moving the whole paragraph to a new page.
    const minimum = Math.min(pageHeight - margin - 36 - bottom,
      before + (block.heading || isTitle ? lines.length * leading + after + 37 : Math.min(lines.length, 2) * leading));
    if (y - minimum < bottom) newPage();
    y -= before;
    let index = 0;
    while (index < lines.length) {
      let capacity = Math.floor((y - bottom) / leading);
      const remaining = lines.length - index;
      if (capacity < Math.min(2, remaining)) { newPage(); capacity = Math.floor((y - bottom) / leading); }
      let count = Math.min(remaining, capacity);
      if (remaining - count === 1) {
        if (count > 2) count--;
        else { newPage(); continue; }
      }
      if (block.quote) page.drawLine({ start: { x: margin + indent - 7, y }, end: { x: margin + indent - 7, y: y - count * leading }, color: rule, thickness: 2 });
      for (let i = 0; i < count; i++, index++) {
        y -= leading;
        if (index === 0 && block.marker) drawLine([{ text: block.marker }], margin + indent - 14, y, 9, muted);
        drawLine(lines[index], margin + indent, y, size, majorHeading || isTitle ? green : ink);
      }
      if (index < lines.length) newPage();
    }
    if (majorHeading && !isTitle) page.drawLine({
      start: { x: margin + indent, y: y - 7 }, end: { x: pageWidth - margin, y: y - 7 }, color: rule, thickness: 0.7,
    });
    y -= after;
  }
  renderText({ kind: "text", spans: [{ text: title }] }, true);
  function renderTable(rows: Span[][][]) {
    if (!rows.length) return;
    const columns = Math.max(...rows.map(row => row.length)), cellWidth = available / columns, padding = 7, size = 9, leading = 14;
    const prepare = (row: Span[][], header: boolean) => Array.from({length: columns}, (_, i) => wrap((row[i] || []).map(span => ({ ...span, bold: header || span.bold })), cellWidth - padding * 2, size));
    const header = prepare(rows[0], true);
    const headerHeight = Math.max(...header.map(cell => cell.length)) * leading + padding * 2;
    function drawRow(cells: Span[][][], offset: number, count: number, isHeader: boolean) {
      const height = count * leading + padding * 2;
      if (isHeader) page.drawRectangle({ x: margin, y: y - height, width: available, height, color: rgb(0.94, 0.96, 0.94) });
      cells.forEach((cell, column) => {
        cell.slice(offset, offset + count).forEach((line, i) => drawLine(line, margin + column * cellWidth + padding, y - padding - (i + 1) * leading + 3, size, isHeader ? green : ink));
      });
      y -= height;
      page.drawLine({ start: {x: margin, y}, end: {x: pageWidth - margin, y}, color: rule, thickness: 0.5 });
    }
    rows.forEach((row, rowIndex) => {
      const cells = prepare(row, rowIndex === 0), total = Math.max(...cells.map(cell => cell.length));
      let offset = 0;
      while (offset < total) {
        if (y - padding * 2 - leading * Math.min(total - offset, 2) < bottom) {
          newPage();
          // Repeated headers are useful only when they leave room for body rows.
          if (rowIndex > 0 && headerHeight < 160) drawRow(header, 0, Math.max(...header.map(cell => cell.length)), true);
        }
        const count = Math.min(total - offset, Math.floor((y - bottom - padding * 2) / leading));
        drawRow(cells, offset, count, rowIndex === 0); offset += count;
      }
    });
    y -= 12;
  }
  const body = blocks(parser.parse(content).children);
  // The export already renders its title. Suppress only an identical opening
  // heading; retain different headings and every later occurrence in the body.
  const first = body[0];
  const normalizedTitle = title.trim().replace(/\s+/g, " ");
  if (first?.kind === "text" && first.heading &&
      first.spans.map(span => span.text).join("").trim().replace(/\s+/g, " ") === normalizedTitle) {
    body.shift();
  }
  for (const [index, block] of body.entries()) {
    if (block.kind === "text" && block.heading) {
      // Keep a short evidence section intact. A parent heading travels with its
      // first subsection; long sections still use normal widow/orphan control.
      let height = 0, depth = block.heading;
      for (let next = index; next < body.length; next++) {
        const item = body[next];
        if (item.kind !== "text" || (next > index && item.heading && item.heading <= depth)) break;
        if (item.heading) depth = item.heading;
        const style = textStyle(item);
        height += style.before + wrap(style.spans, available - style.indent, style.size).length * style.leading + style.after;
      }
      const usable = pageHeight - margin - 36 - bottom;
      if (height <= usable * 0.45 && y - height < bottom) newPage();
    }
    if (block.kind === "text") renderText(block);
    else if (block.kind === "table") renderTable(block.rows);
    else {
      if (y < bottom + 20) newPage();
      y -= 10; page.drawLine({ start: {x: margin, y}, end: {x: pageWidth - margin, y}, color: rule, thickness: 0.7 }); y -= 10;
    }
  }
  for (const [index, page] of pdf.getPages().entries()) {
    page.drawLine({start: {x: margin, y: 38}, end: {x: pageWidth - margin, y: 38}, color: rule, thickness: 0.6});
    page.drawText("Hirelix", {x: margin, y: 24, font: regular, size: 8, color: muted});
    const number = `${index + 1} / ${pdf.getPageCount()}`;
    page.drawText(number, {x: pageWidth - margin - regular.widthOfTextAtSize(number, 8), y: 24, font: regular, size: 8, color: muted});
  }
  return pdf.save();
}
