import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import postgres from "postgres";

test("production health SQL distinguishes stopped work from overdue reminders and expired leases", async () => {
  const url=new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
  assert.equal(url.hostname,"127.0.0.1");
  assert.ok(url.pathname.startsWith("/hirelix_workspace_qa_isolated_"));
  const client=postgres(url.toString(),{ssl:false,max:1});
  const query=await readFile("deploy/hirelix-health.sql","utf8");
  const owner=randomUUID(), conversation=randomUUID(), job=randomUUID(), reminder=randomUUID();
  const rollback=new Error("rollback isolated fixtures");
  try {
    await assert.rejects(client.begin(async tx=>{
      const count=async()=>{
        // Execute the exact shipped SQL, including its statement timeout.
        const results=await tx.unsafe(query).simple();
        return Number(results.at(-1)![0].stalled);
      };
      const baseline=await count();
      await tx`INSERT INTO hirelix_private_conversations(id,user_id,title,stopped) VALUES(${conversation},${owner},'Health fixture',true)`;
      await tx`INSERT INTO hirelix_private_jobs(id,user_id,kind,request_key,payload,status,updated_at) VALUES(${job},${owner},'chat',${randomUUID()},${tx.json({conversation_id:conversation})},'queued',now()-interval '20 minutes')`;
      assert.equal(await count(),baseline,"Stopped conversation is intentionally paused");
      await tx`UPDATE hirelix_private_conversations SET stopped=false WHERE id=${conversation}`;
      assert.equal(await count(),baseline+1,"Eligible queued work is overdue");
      await tx`UPDATE hirelix_private_jobs SET status='running',lease_until=now()-interval '5 minutes' WHERE id=${job}`;
      assert.equal(await count(),baseline+1,"Expired running lease is unhealthy");
      await tx`UPDATE hirelix_private_jobs SET status='done' WHERE id=${job}`;
      await tx`INSERT INTO hirelix_private_schedules(id,user_id,kind,title,conversation_id,timezone,next_run_at) VALUES(${reminder},${owner},'reminder','Due reminder',${conversation},'UTC',now()-interval '20 minutes')`;
      assert.equal(await count(),baseline+1,"Role-less reminders must be monitored");
      await tx`UPDATE hirelix_private_schedules SET completed_at=now() WHERE id=${reminder}`;
      assert.equal(await count(),baseline,"Completed reminders must not alert");
      await tx`UPDATE hirelix_private_schedules SET completed_at=null,enabled=false WHERE id=${reminder}`;
      assert.equal(await count(),baseline,"Cancelled reminders must not alert");
      await tx`UPDATE hirelix_private_schedules SET enabled=true,next_run_at=now()+interval '1 hour' WHERE id=${reminder}`;
      assert.equal(await count(),baseline,"Future reminders must not alert");
      throw rollback;
    }),e=>e===rollback);
  } finally {await client.end();}
});
