import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, rgb } from "pdf-lib";
import { pdfPagePreview, pdfThumbnail } from "../src/lib/workspace/file-thumbnail";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { pdfOptions } from "../src/lib/workspace/pdf-options";

test("standard PDF text loads bundled font bytes instead of relying on host fonts", async () => {
  const document = await PDFDocument.create();
  document.addPage([300,200]).drawText("Visible original CV", {x:20,y:100,size:20});
  const bytes = await document.save();
  const fetched: string[] = [];
  class FontData {
    async fetch({filename}: {filename:string}) {
      fetched.push(filename);
      return new Uint8Array(await readFile(join(pdfOptions.standardFontDataUrl, filename)));
    }
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({...pdfOptions, data:new Uint8Array(bytes), StandardFontDataFactory:FontData});
  try {
    await (await (await task.promise).getPage(1)).getOperatorList();
    assert.ok(fetched.length > 0, "Non-embedded Helvetica must load real bundled font data");
  } finally { await task.destroy(); }
  const preview = await pdfPagePreview(bytes,1);
  const image = await loadImage(preview.image);
  const canvas = createCanvas(image.width,image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image,0,0);
  const pixels = context.getImageData(0,0,canvas.width,canvas.height).data;
  let ink = 0;
  for (let i=0;i<pixels.length;i+=4) {
    if (pixels[i]<100 && pixels[i+1]<100 && pixels[i+2]<100 && pixels[i+3]>0) ink++;
  }
  assert.ok(ink>100, "Successful preview must contain the original text, not a blank white page");
});

test("PDF preview renders the requested original page and reports the full page count", async () => {
  const document = await PDFDocument.create();
  for (const [index, color] of [rgb(1,0,0),rgb(0,0,1)].entries()) {
    const page = document.addPage([300,400]);
    page.drawRectangle({x:0,y:0,width:300,height:400,color});
    page.drawText(`Original page ${index + 1}`,{x:30,y:300,size:20,color:rgb(1,1,1)});
  }
  const bytes = await document.save();
  const first = await pdfPagePreview(bytes,1), second = await pdfPagePreview(bytes,2);
  assert.equal(first.pages,2);
  assert.equal(second.pages,2);
  assert.match(first.image,/^data:image\/png;base64,/);
  assert.notEqual(first.image,second.image);
  assert.equal((await pdfThumbnail(bytes)).pages,2);
  for (const page of [0,-1,1.5,NaN,3]) {
    await assert.rejects(pdfPagePreview(bytes,page),(error:unknown)=>{
      assert.equal((error as {status:number}).status,400);
      return true;
    });
  }
});
