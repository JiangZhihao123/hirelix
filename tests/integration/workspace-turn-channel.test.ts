import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {after, test} from "node:test";
import {sql} from "drizzle-orm";
import {db, closeDb} from "../../src/db/client";
import {rows, json} from "../../src/lib/workspace/database";
import {cancelJob, liveReplyWriter} from "../../src/lib/workspace/jobs";
import {subscribeTurn, closeTurnChannel, type LiveTurn} from "../../src/lib/workspace/turn-channel";
import type {Job} from "../../src/lib/workspace/types";
const url = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.startsWith("/hirelix_workspace_qa_"));
const owner = randomUUID();
after(async () => {
  await db.execute(sql`DELETE FROM hirelix_agent_messages WHERE user_id=${owner}::uuid`);
  await db.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${owner}::uuid`);
  await db.execute(sql`DELETE FROM hirelix_private_conversations WHERE user_id=${owner}::uuid`);
  await closeTurnChannel(); await closeDb();
});
async function fixture() {
  const [conversation] = await rows<{id:string}>(sql`INSERT INTO hirelix_private_conversations(user_id,title) VALUES(${owner}::uuid,'Live stream isolation test') RETURNING id`);
  const [job] = await rows<Job>(sql`INSERT INTO hirelix_private_jobs(user_id,kind,request_key,payload,result,status,attempts,lease_token,lease_until)
    VALUES(${owner}::uuid,'chat',${randomUUID()},${json({conversation_id:conversation.id})},${json({stream_epoch:randomUUID()})},'running',1,${randomUUID()}::uuid,now()+interval '5 minutes') RETURNING *`);
  return job;
}
const delay = (ms:number) => new Promise(resolve=>setTimeout(resolve,ms));
async function until(check:()=>boolean, ms=5000) {
  const start=Date.now(); while(!check()) {if(Date.now()-start>ms) throw new Error("Timed out");await delay(10);}
}
test("real PG: notifications reach two viewers while checkpoint row is locked, large UTF-8 output survives reconnect", {timeout:20000}, async () => {
  const job=await fixture();const a:LiveTurn[]=[];const b:LiveTurn[]=[];const other:LiveTurn[]=[];
  const stopA=await subscribeTurn(job.id,s=>a.push(s)); const stopB=await subscribeTurn(job.id,s=>b.push(s));
  const stopOther=await subscribeTurn(randomUUID(),s=>other.push(s));
  const write=liveReplyWriter(job);await write.ready;
  let unlock!:()=>void;const release=new Promise<void>(r=>unlock=r);
  let locked!:()=>void;const acquired=new Promise<void>(r=>locked=r);
  const lock=db.transaction(async tx=>{await tx.execute(sql`SELECT id FROM hirelix_private_jobs WHERE id=${job.id}::uuid FOR UPDATE`);locked();await release;});
  await acquired;
  try {
    const text="真实通知与独立保存🙂".repeat(1400);
    write(text,[{type:"text",text}],true);
    await until(()=>a.length>0&&b.length>0);
    assert.equal(a.at(-1)!.live_reply,text);assert.equal(b.at(-1)!.live_reply,text);
    const [before]=await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE id=${job.id}::uuid`);
    assert.equal(before.result?.live_reply,undefined,"visible before blocked persistence can commit");
    assert.equal(other.length,0,"job channels are isolated");
    unlock();await lock;await write.flush();
    const [saved]=await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE id=${job.id}::uuid`);
    assert.equal(saved.result?.live_reply,text);
    await stopB();const reconnected:LiveTurn[]=[];const stopC=await subscribeTurn(job.id,s=>reconnected.push(s));
    write(text+"接续",[{type:"text",text:text+"接续"}]);await until(()=>reconnected.length>0);
    assert.equal(reconnected.at(-1)!.sequence,2);assert.equal(reconnected.at(-1)!.live_reply,text+"接续");
    await stopC();
  } finally {unlock();await lock;await write.close();await stopA();await stopB();await stopOther();}
});
test("real PG: stop seals uncheckpointed text, rejects late tokens, and cannot overwrite a replacement lease",{timeout:15000},async()=>{
  const job=await fixture();let stopped=false;const write=liveReplyWriter(job,()=>{stopped=true;});await write.ready;
  const visible:LiveTurn[]=[];const unsubscribe=await subscribeTurn(job.id,s=>visible.push(s));
  write("已经显示的半句",[{type:"text",text:"已经显示的半句"}]);await until(()=>visible.length>0);
  const first = visible.at(-1)!;
  write("已经显示的半句以及在途文字",[{type:"text",text:"已经显示的半句以及在途文字"}],true);
  await until(()=>visible.some(s=>s.sequence>first.sequence));await write.flush();
  await cancelJob(owner,job.id,{stream_epoch:first.epoch,stream_sequence:first.sequence});await until(()=>stopped);
  write("迟到的数据",[{type:"text",text:"迟到的数据"}]);await write.close();
  const [state]=await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE id=${job.id}::uuid`);
  assert.equal(state.status,"cancelled");assert.equal(state.result?.live_reply,undefined);
  assert.deepEqual(state.result?.parts,[{type:"text",text:"已经显示的半句"}]);
  const [message]=await rows<{metadata:Record<string,unknown>}>(sql`SELECT metadata FROM hirelix_agent_messages WHERE id=${String(state.result?.message_id)}::uuid`);
  assert.deepEqual(message.metadata.parts,state.result?.parts);
  await unsubscribe();
  const old=await fixture();const stale=liveReplyWriter(old);await stale.ready;stale("old",[{type:"text",text:"old"}]);
  await db.execute(sql`UPDATE hirelix_private_jobs SET lease_token=${randomUUID()}::uuid,result=${json({stream_epoch:randomUUID(),parts:[{type:"text",text:"new"}]})} WHERE id=${old.id}::uuid`);
  await stale.close();
  const [replacement]=await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE id=${old.id}::uuid`);
  assert.deepEqual(replacement.result?.parts,[{type:"text",text:"new"}]);
});
