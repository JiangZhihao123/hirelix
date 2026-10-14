import assert from "node:assert/strict";
import { test } from "node:test";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderPdfDocument, wrapPdfText } from "../src/lib/workspace/document-pdf";

const plain = (lines: Array<Array<{text: string}>>) => lines.map(line => line.map(span => span.text).join(""));
test("PDF wrapping fills Chinese lines while keeping Latin words and closing punctuation together", () => {
  const lines = plain(wrapPdfText([{text:'中文说明 Spark 和 Kubernetes，后续中文内容。'}], 14, span => [...span.text].length));
  assert.equal(lines.join('').replace(/\s/g,''), '中文说明Spark和Kubernetes，后续中文内容。');
  assert.ok(lines.some(line => line.includes('Kubernetes')));
  assert.ok(lines.every(line => !/^[，。]/.test(line)));
  assert.equal(lines[0], '中文说明 Spark 和');
  const long = plain(wrapPdfText([{text:'https://example.com/'+'x'.repeat(80)}], 20, span => span.text.length));
  assert.ok(long.every(line => line.length <= 20));
  assert.equal(long.join(''), 'https://example.com/'+'x'.repeat(80));
});

test("PDF export preserves mixed-language Markdown, paginates long text/tables, and keeps text in bounds", async () => {
  const source = '# 项目证据\n\n**David Liu**\n\n生产环境 Spark、Kubernetes 与 Python。**关键证据**和 *production experience*。\n\n- 第一项经验\n- 第二项经验\n\n' +
    '| 要求 | 证据 |\n| --- | --- |\n' + Array.from({length: 40}, (_,i)=>`| 要求 ${i} | 经历 ${i}：production Spark ${'数据平台'.repeat(8)} |`).join('\n') +
    '\n\n## 后续说明\n\n' + 'LONG_PARAGRAPH '.repeat(500) + '\n\nEND_OF_DOCUMENT';
  const bytes = await renderPdfDocument('候选人推荐 / Candidate recommendation', source);
  const task = getDocument({data: bytes, useSystemFonts: true});
  const pdf = await task.promise;
  try {
    assert.ok(pdf.numPages > 2);
    let text = '';
    for(let i=1;i<=pdf.numPages;i++) {
      const page = await pdf.getPage(i);
      const {items} = await page.getTextContent();
      const lines = items.filter(item => 'str' in item);
      for(const item of lines) {
        assert.ok(item.transform[4] >= 47, `page ${i} left overflow`);
        assert.ok(item.transform[4]+item.width <= 548.5, `page ${i} right overflow: ${item.str}`);
        assert.ok(item.transform[5] >= 23 && item.transform[5] <= 795, `page ${i} vertical overflow`);
      }
      const current = lines.map(item=>item.str).join('');
      assert.ok(current.includes(`${i} / ${pdf.numPages}`));
      text += current;
    }
    for(const expected of ['David Liu','Kubernetes','关键证据','第一项经验','第二项经验','要求 39','经历 39','END_OF_DOCUMENT']) assert.ok(text.includes(expected), expected);
    assert.equal((text.match(/LONG_PARAGRAPH/g)||[]).length, 500, 'no lost or duplicated paragraph text at page breaks');
    assert.ok(!text.includes('**'));
  } finally { await task.destroy(); }
});

test("Latin-only documents avoid embedding the large CJK font", async () => {
  const bytes = await renderPdfDocument('Candidate recommendation', '## Overview\n\n**Alex Morgan**\n\nPlatform engineering experience.');
  assert.ok(bytes.length < 30000);
});

test("a short evidence section stays together instead of leaving its last bullet on the next page", async () => {
  const content = Array.from({ length: 29 }, (_, i) => `Context line ${i}`).join("  \n") +
    "\n\n### Evidence section\n\n- First evidence\n- Second evidence\n- Last evidence";
  const task = getDocument({ data: await renderPdfDocument("Recommendation", content), useSystemFonts: true });
  const pdf = await task.promise;
  try {
    assert.equal(pdf.numPages, 2);
    const first = (await (await pdf.getPage(1)).getTextContent()).items.filter(item => "str" in item).map(item => item.str).join("");
    const second = (await (await pdf.getPage(2)).getTextContent()).items.filter(item => "str" in item).map(item => item.str).join("");
    assert.ok(!first.includes("Evidence section"));
    for (const text of ["Evidence section", "First evidence", "Second evidence", "Last evidence"]) assert.ok(second.includes(text));
  } finally { await task.destroy(); }
});
