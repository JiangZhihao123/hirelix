import assert from 'node:assert/strict';
import {test} from 'node:test';
import {microsoftSendBody} from '../src/lib/workspace/gmail';

test('Microsoft JSON preserves Unicode, binary attachments and exact recipient',()=>{
 const bytes=Buffer.from([0,255,128,13,10]);
 const result=JSON.parse(microsoftSendBody({to:'recipient@example.com',title:'候选人介绍',content:'正文\n第二行'},[{filename:'简历.pdf',content:bytes,contentType:'application/pdf'}]));
 assert.equal(result.message.subject,'候选人介绍');
 assert.deepEqual(result.message.body,{contentType:'Text',content:'正文\n第二行'});
 assert.deepEqual(result.message.toRecipients,[{emailAddress:{address:'recipient@example.com'}}]);
 assert.deepEqual(Buffer.from(result.message.attachments[0].contentBytes,'base64'),bytes);
 assert.equal(result.message.attachments[0].name,'简历.pdf');
 assert.equal(result.message.attachments[0]['@odata.type'],'#microsoft.graph.fileAttachment');
 assert.equal(result.saveToSentItems,true);
 assert.equal(result.message.internetMessageId,undefined);
});
test('Microsoft rejects oversized individual files and aggregate JSON before sending',()=>{
 const snapshot={to:'recipient@example.com',title:'test',content:'body'};
 const file=(size:number)=>({filename:'cv.pdf',content:Buffer.alloc(size),contentType:'application/pdf'});
 assert.throws(()=>microsoftSendBody(snapshot,[file(3*1024*1024)]),/too large/);
 assert.throws(()=>microsoftSendBody(snapshot,[file(2*1024*1024),file(2*1024*1024)]),/too large/);
 assert.deepEqual(JSON.parse(microsoftSendBody(snapshot,[])).message.attachments,[]);
});
