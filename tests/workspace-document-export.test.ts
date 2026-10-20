import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { renderDocument } from "../src/lib/workspace/document-export";

test("Word export preserves bilingual text and embeds the unchanged CJK font with separate Latin typography", async () => {
  const archive = unzipSync(await renderDocument(
    "候选人推荐 — Mara Vale",
    "## 推荐理由\n仓库收货流程与异常处理。\nExpected salary: GBP 146,000.\nCommuting arrangements have not been discussed.",
    "docx",
  ));
  const body = strFromU8(archive["word/document.xml"]);
  assert.match(body, /仓库收货流程与异常处理/);
  assert.match(body, /GBP 146,000/);
  assert.match(body, /Commuting arrangements have not been discussed/);
  const styles = strFromU8(archive["word/styles.xml"]);
  assert.match(styles, /w:ascii="Arial"/);
  assert.match(styles, /w:hAnsi="Arial"/);
  assert.match(styles, /w:eastAsia="Noto Sans SC"/);
  const fonts = strFromU8(archive["word/fontTable.xml"]);
  const key = Buffer.from(fonts.match(/w:fontKey="\{([^}]+)\}"/)![1].replaceAll("-", ""), "hex").reverse();
  const fontPath = Object.keys(archive).find((name) => name.endsWith(".odttf"))!;
  const restored = Buffer.from(archive[fontPath]);
  for (let i = 0; i < 32; i++) restored[i] ^= key[i % 16];
  assert.deepEqual(restored, await readFile("src/assets/fonts/NotoSansSC-Regular.ttf"));
});
