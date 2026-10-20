import assert from "node:assert/strict";
import {test} from "node:test";
import {auth} from "../src/lib/auth";
import {getDb} from "../src/db/client";
import {readMailboxThread,readMailboxAttachment} from "../src/lib/workspace/mailbox";
import {microsoftSendBody} from "../src/lib/workspace/gmail";
import {toolResultMailbox} from "../src/lib/workspace/tool-result-view";

process.env.DATABASE_URL ||= "postgresql://fixture:fixture@127.0.0.1:1/fixture";

test("Outlook conversation reads use exact provider identity, retain chronology and disclose incomplete coverage", async t=>{
  t.mock.method(getDb(),"execute",async()=>[{accountId:"selected-account"}]);
  const keys=["MICROSOFT_CLIENT_ID","MICROSOFT_CLIENT_SECRET","MICROSOFT_MAIL_READ_ENABLED"];
  const old=keys.map(k=>process.env[k]);keys.forEach(k=>process.env[k]=k.endsWith("ENABLED")?"true":"fixture");
  t.after(()=>keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}));
  t.mock.getter(auth,"api",()=>({getAccessToken:async()=>({accessToken:"fixture",scopes:["Mail.Read"]})}));
  const paths:string[]=[];
  t.mock.method(globalThis,"fetch",async (url:string)=>{
    const u=new URL(url);paths.push(url);
    if(u.searchParams.has("$filter")){
      assert.equal(u.searchParams.get("$filter"),"conversationId eq 'thread''id'");
      return Response.json({value:[{id:"incoming"},{id:"sent"}],"@odata.nextLink":"https://graph.microsoft.com/next"});
    }
    if(u.pathname.includes("mailFolders"))return Response.json({displayName:u.pathname.includes("sent")?"Sent Items":"Inbox"});
    const incoming=u.pathname.endsWith("incoming");
    return Response.json({id:incoming?"incoming":"sent",conversationId:"thread'id",subject:"Client feedback",parentFolderId:incoming?"inbox":"sent",from:{emailAddress:{address:"client@example.com"}},receivedDateTime:incoming?"2026-10-18T11:00:00Z":"2026-10-18T10:00:00Z",body:{contentType:"text",content:incoming?"Mira: interview; Alex: hold":"Two recommendations"}});
  });
  const result=await readMailboxThread("owner",{provider:"microsoft",message_id:"incoming"});
  assert.deepEqual(result.messages.map(m=>m.id),["sent","incoming"]);
  assert.equal(result.more_available,true);
  assert.equal(result.messages[0].mailbox_folder,"Sent Items");
  assert.ok(paths.every(p=>p.startsWith("https://graph.microsoft.com/v1.0/me/")));
  const view=toolResultMailbox("read_mail_thread",result)!;
  assert.equal(view.messages[1].body,"Mira: interview; Alex: hold");
  assert.equal(view.more_available,true);
});

test("Outlook reply payload preserves the reviewed audience and does not use sendMail-only options",()=>{
  const reply={message_id:"original",thread_id:"thread",subject:"Original",source_url:"https://outlook.live.com/mail/"};
  const payload=JSON.parse(microsoftSendBody({to:"client@example.com",title:"Re: Original",content:"Thank you",reply},[{filename:"notes.txt",content:Buffer.from("facts"),contentType:"text/plain"}]));
  assert.equal(payload.saveToSentItems,undefined);
  assert.deepEqual(payload.message.toRecipients,[{emailAddress:{address:"client@example.com"}}]);
  assert.deepEqual(payload.message.ccRecipients,[]);
  assert.deepEqual(payload.message.bccRecipients,[]);
  assert.equal(Buffer.from(payload.message.attachments[0].contentBytes,"base64").toString(),"facts");
});

test("Attachment ownership is checked against the selected mailbox message before downloading bytes",async t=>{
  t.mock.method(getDb(),"execute",async()=>[{accountId:"selected-account"}]);
  const keys=["MICROSOFT_CLIENT_ID","MICROSOFT_CLIENT_SECRET","MICROSOFT_MAIL_READ_ENABLED"];
  const old=keys.map(k=>process.env[k]);keys.forEach(k=>process.env[k]=k.endsWith("ENABLED")?"true":"fixture");
  t.after(()=>keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}));
  t.mock.getter(auth,"api",()=>({getAccessToken:async()=>({accessToken:"fixture",scopes:["Mail.Read"]})}));
  let downloaded=false;
  t.mock.method(globalThis,"fetch",async(url:string)=>{
    if(url.includes("/attachments?"))return Response.json({value:[{id:"allowed",name:"feedback.txt",size:12,contentType:"text/plain"}]});
    if(url.includes("/attachments/")){downloaded=true;return Response.json({"@odata.type":"#microsoft.graph.fileAttachment",contentBytes:Buffer.from("Client facts").toString("base64")});}
    return Response.json({id:"incoming",hasAttachments:true,body:{contentType:"text",content:"See notes"},webLink:"https://outlook.live.com/mail/"});
  });
  await assert.rejects(readMailboxAttachment("owner",{provider:"microsoft",message_id:"incoming",attachment_id:"foreign"}),/does not belong/);
  assert.equal(downloaded,false);
  assert.equal((await readMailboxAttachment("owner",{provider:"microsoft",message_id:"incoming",attachment_name:"feedback.txt"})).bytes.toString(),"Client facts");
});

test("A source-only correction preserves the original URL and rejects an empty correction", async()=>{
  const {recordChangesSchema}=await import("../src/lib/workspace/conversation-schema");
  const base={title:null,content:null,occurred_at:null};
  const source="https://outlook.live.com/owa/?ItemID=original&viewmodel=ReadMessageItem";
  assert.equal(recordChangesSchema.parse({...base,source_url:source}).source_url,source);
  assert.equal(recordChangesSchema.safeParse(base).success,false);
  assert.equal(recordChangesSchema.parse({...base,source_url:""}).source_url,"");
});

test("Outlook attachment boundaries reject ambiguity, oversized bytes and unsupported objects", async t=>{
  t.mock.method(getDb(),"execute",async()=>[{accountId:"selected-account"}]);
  const keys=["MICROSOFT_CLIENT_ID","MICROSOFT_CLIENT_SECRET","MICROSOFT_MAIL_READ_ENABLED"];
  const old=keys.map(k=>process.env[k]);keys.forEach(k=>process.env[k]=k.endsWith("ENABLED")?"true":"fixture");
  t.after(()=>keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}));
  t.mock.getter(auth,"api",()=>({getAccessToken:async()=>({accessToken:"fixture",scopes:["Mail.Read"]})}));
  let entries=[{id:"first",name:"CV.pdf",size:10},{id:"second",name:"CV.pdf",size:10}];
  let nextPage=false, downloads=0;
  const downloadedIds:string[]=[];
  let attachment:Record<string,unknown>={"@odata.type":"#microsoft.graph.fileAttachment",contentBytes:Buffer.from("selected file").toString("base64")};
  t.mock.method(globalThis,"fetch",async(url:string)=>{
    if(url.includes("/attachments?"))return Response.json({value:entries,...(nextPage?{"@odata.nextLink":"https://graph.microsoft.com/next"}:{})});
    if(url.includes("/attachments/")){downloads++;downloadedIds.push(new URL(url).pathname.split("/").at(-1)!);return Response.json(attachment);}
    return Response.json({id:"incoming",hasAttachments:true,body:{contentType:"text",content:"Attached CV"},webLink:"https://outlook.live.com/mail/"});
  });
  const input={provider:"microsoft",message_id:"incoming",attachment_name:"CV.pdf"};
  await assert.rejects(readMailboxAttachment("owner",input),/Multiple attachments/);
  assert.equal(downloads,0,"Ambiguous names must not download an arbitrary file");
  assert.equal((await readMailboxAttachment("owner",{...input,attachment_id:"second"})).bytes.toString(),"selected file");
  assert.deepEqual(downloadedIds,["second"],"The explicit ID selects the right file among duplicate names");
  entries=[{id:"first",name:"CV.pdf",size:4*1024*1024+1}];
  await assert.rejects(readMailboxAttachment("owner",input),/4 MB/);
  assert.equal(downloads,1,"Provider size rejects before downloading");
  entries[0].size=10;
  attachment={"@odata.type":"#microsoft.graph.itemAttachment"};
  await assert.rejects(readMailboxAttachment("owner",input),/original mailbox/);
  attachment={"@odata.type":"#microsoft.graph.fileAttachment",contentBytes:Buffer.alloc(4*1024*1024+1).toString("base64")};
  await assert.rejects(readMailboxAttachment("owner",input),/4 MB/);
  assert.equal(downloads,3,"Actual decoded size is enforced even when metadata understates it");
  nextPage=true;
  await assert.rejects(readMailboxAttachment("owner",input),/more than 50 attachments/);
  assert.equal(downloads,3,"Incomplete attachment listings must not claim complete selection");
});
