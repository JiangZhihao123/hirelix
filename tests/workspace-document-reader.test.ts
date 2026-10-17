import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeFileFixtures} from './helpers/workspace-file-fixtures';
import {readDocument} from '../src/lib/workspace/document-reader';
import {pdfOptions} from '../src/lib/workspace/pdf-options';
import {attachmentError} from '../src/lib/workspace/attachments';
test('actual office files preserve sheets, cell addresses, slide text and PDF pixels',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hirelix-files-'))+'/';
 try {
  await makeFileFixtures(dir);
  for(const name of ['qa-candidates.xlsx','qa-notes.docx','qa-brief.pptx','qa-text.pdf']) {
   const result=await readDocument({name,bytes:await readFile(dir+name)});
   assert.match(result.text,/Harbor Labs/);
   if(name.endsWith('xlsx')){assert.match(result.text,/Worksheet: Role terms/);assert.match(result.text,/120000/);assert.match(result.text,/Rowan Vale/);assert.match(result.text,/A2/);}
   if(name.endsWith('pdf')){assert.equal(result.images.length,1);assert.ok(result.images[0].url.startsWith('data:image/png;base64,'));}
  }
  await assert.rejects(()=>readDocument({name:'broken.jpg',bytes:Buffer.from('not an image')}),/damaged/);
  await assert.rejects(()=>readDocument({name:'qa-scan.pdf',bytes:Buffer.from([])},0));
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('common attachments share one client and server allowlist',()=>{
 for(const name of ['cv.JPG','notes.png','diagram.webp','roster.xlsx','brief.pptx','notes.tsv','data.json'])assert.equal(attachmentError(name,100),null);
 assert.ok(attachmentError('code.exe',100));
});
test('source previews do not transcribe images or scanned PDFs',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hirelix-preview-'))+'/';
 try {
  await makeFileFixtures(dir);
  for(const name of ['qa-profile.jpg','qa-scan.pdf','qa-notes.docx','qa-candidates.xlsx']) {
   const result=await readDocument({name,bytes:await readFile(dir+name)},0,false);
   assert.equal(result.images.length,0);
   if(name.endsWith('docx'))assert.match(result.text,/Harbor Labs/);
   if(name.endsWith('xlsx'))assert.match(result.text,/Rowan Vale/);
  }
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('PDFs without ToUnicode preserve Chinese through predefined Adobe CMaps', async () => {
 const {PDFDocument, PDFName, PDFString} = await import('pdf-lib');
 const pdf = await PDFDocument.create(), context = pdf.context;
 // A real CID-font PDF, deliberately without ToUnicode; no personal source data.
 const descriptor = context.register(context.obj({Type:'FontDescriptor', FontName:'STSong-Light', Flags:6, FontBBox:[-25,-254,1000,880], ItalicAngle:0, Ascent:880, Descent:-120, CapHeight:880, StemV:80}));
 const cid = context.register(context.obj({Type:'Font', Subtype:'CIDFontType0', BaseFont:'STSong-Light', CIDSystemInfo:{Registry:PDFString.of('Adobe'), Ordering:PDFString.of('GB1'), Supplement:4}, DW:1000, FontDescriptor:descriptor}));
 const font = context.register(context.obj({Type:'Font', Subtype:'Type0', BaseFont:'STSong-Light', Encoding:'UniGB-UCS2-H', DescendantFonts:[cid]}));
 const page = pdf.addPage([600,200]);
 page.node.set(PDFName.of('Resources'), context.obj({Font:{F1:font}}));
 const expected = '计算机科学 全栈开发工程师 一等奖';
 const hex = Array.from(expected, char => char.charCodeAt(0).toString(16).padStart(4,'0')).join('');
 page.node.set(PDFName.of('Contents'), context.register(context.flateStream(`BT /F1 18 Tf 30 100 Td <${hex}> Tj ET`)));
 const result = await readDocument({name:'chinese-cid.pdf', bytes:await pdf.save()}, 0, false);
 for (const phrase of expected.split(' ')) assert.ok(result.text.includes(phrase), `Missing Chinese text: ${phrase}`);
});

test('source text removes PostgreSQL-incompatible NUL without changing the original file', async () => {
 const bytes=Buffer.from('王\u0000宇鑫\n姓名\t履历 😀');
 const original=Buffer.from(bytes);
 for(const readVisuals of [true,false]) {
  const result=await readDocument({name:'source.txt',bytes},20,readVisuals);
  assert.equal(result.text,'王宇鑫\n姓名\t履历 😀');
  assert.deepEqual(bytes,original);
 }
});

test('PDF font mappings containing NUL can be extracted for database storage',async()=>{
 const {PDFDocument,PDFName}=await import('pdf-lib');
 const pdf=await PDFDocument.create(),ctx=pdf.context;
 const cmap=ctx.register(ctx.flateStream('/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Test def /CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange 3 beginbfchar <41> <0041> <42> <0000> <43> <0043> endbfchar endcmap CMapName currentdict /CMap defineresource pop end end'));
 const font=ctx.register(ctx.obj({Type:'Font',Subtype:'Type1',BaseFont:'Helvetica',ToUnicode:cmap}));
 const page=pdf.addPage([300,200]);
 page.node.set(PDFName.of('Resources'),ctx.obj({Font:{F1:font}}));
 page.node.set(PDFName.of('Contents'),ctx.register(ctx.flateStream(`BT /F1 8 Tf 30 100 Td (${'ABC'.repeat(20)}) Tj ET`)));
 const bytes=await pdf.save();
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const task=pdfjs.getDocument({...pdfOptions,data:new Uint8Array(bytes)});
 try {
  const source=await task.promise;
  const content=await (await source.getPage(1)).getTextContent();
  assert.ok(content.items.some(item=>'str' in item&&item.str.includes('\u0000')),'fixture reproduces the real PDF.js NUL extraction');
 }finally{await task.destroy();}
 for(const visual of [false,true]){
  const result=await readDocument({name:'nul-font.pdf',bytes},20,visual);
  assert.ok(result.text.includes('AC'));
  assert.ok(!result.text.includes('\u0000'));
  assert.equal(result.images.length,visual?1:0);
 }
});
