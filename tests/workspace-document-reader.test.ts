import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeFileFixtures} from './helpers/workspace-file-fixtures';
import {readDocument} from '../src/lib/workspace/document-reader';
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
