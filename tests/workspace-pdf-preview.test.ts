import assert from "node:assert/strict";
import { test } from "node:test";
import { PDFDocument, rgb } from "pdf-lib";
import { pdfPagePreview, pdfThumbnail } from "../src/lib/workspace/file-thumbnail";

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
