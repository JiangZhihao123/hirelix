import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {test} from "node:test";
import {sql} from "drizzle-orm";
import {db, closeDb} from "../src/db/client";
import {reminderOverview} from "../src/lib/workspace/reminders";

test("upcoming commitments are ordered soonest first before paused and completed reminders across pages", {skip:process.env.WORKSPACE_REMINDER_OVERVIEW_INTEGRATION !== "true"}, async()=>{
  const url=new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost","127.0.0.1"].includes(url.hostname) && url.pathname.startsWith("/hirelix_workspace_qa_"));
  const rollback=new Error("rollback reminder fixtures");
  try {
    await db.transaction(async tx=>{
      const owner=randomUUID(), conversation=randomUUID(), base=Date.now()+600000;
      await tx.execute(sql`INSERT INTO hirelix_private_conversations(id,user_id,title) VALUES(${conversation}::uuid,${owner}::uuid,'Reminder ordering QA')`);
      for(let index=35;index>=1;index--) await tx.execute(sql`INSERT INTO hirelix_private_schedules(user_id,kind,title,conversation_id,next_run_at,timezone,enabled) VALUES(${owner}::uuid,'reminder',${`Upcoming ${index}`},${conversation}::uuid,${new Date(base+index*60000).toISOString()}::timestamptz,'America/Toronto',true)`);
      await tx.execute(sql`INSERT INTO hirelix_private_schedules(user_id,kind,title,conversation_id,next_run_at,timezone,enabled,completed_at) VALUES
        (${owner}::uuid,'reminder','Paused',${conversation}::uuid,${new Date(base).toISOString()}::timestamptz,'America/Toronto',false,NULL),
        (${owner}::uuid,'reminder','Completed earlier',${conversation}::uuid,now()-interval '2 days','America/Toronto',false,now()-interval '2 days'),
        (${owner}::uuid,'reminder','Completed recently',${conversation}::uuid,now()-interval '1 day','America/Toronto',false,now()-interval '1 day')`);
      const first=await reminderOverview(owner,"reminder",1,tx), second=await reminderOverview(owner,"reminder",2,tx);
      assert.equal(first.total,38);
      assert.equal(first.page_size,30);
      assert.deepEqual(first.items.map(item=>item.title),Array.from({length:30},(_,i)=>`Upcoming ${i+1}`));
      assert.deepEqual(second.items.map(item=>item.title),[...Array.from({length:5},(_,i)=>`Upcoming ${i+31}`),"Paused","Completed recently","Completed earlier"]);
      assert.equal((await reminderOverview(randomUUID(),"reminder",1,tx)).total,0);
      assert.equal((await reminderOverview(owner,"search_update",1,tx)).total,0);
      const reportRoles=Array.from({length:4},()=>randomUUID());
      for (const [index,role] of reportRoles.entries()) {
        await tx.execute(sql`INSERT INTO hirelix_private_roles(id,user_id,title,client_name,jd_text,status) VALUES(${role}::uuid,${owner}::uuid,${`Report ${index}`},'QA','QA',${index===2 ? "paused" : "active"})`);
        await tx.execute(sql`INSERT INTO hirelix_private_schedules(user_id,kind,title,role_id,next_run_at,timezone,enabled,weekday,local_time) VALUES(${owner}::uuid,'search_update',${["Report later","Report soon","Inactive role","Paused report"][index]},${role}::uuid,${new Date(base+[120000,60000,0,1000][index]).toISOString()}::timestamptz,'America/Toronto',${index!==3},1,'09:00')`);
      }
      assert.deepEqual((await reminderOverview(owner,"search_update",1,tx)).items.map(item=>item.title),["Report soon","Report later","Inactive role","Paused report"]);
      throw rollback;
    });
  } catch(error) { if(error!==rollback) throw error; }
  finally { await closeDb(); }
});
