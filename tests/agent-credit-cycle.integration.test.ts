import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db, closeDb } from '../src/db/client';
import { getBillingSummaryForUser } from '../src/lib/billing-server';
import { getAgentAccess } from '../src/lib/agent-access';
import { enqueue } from '../src/lib/workspace/database';
import { subscriptionMonth } from '../src/lib/agent-credit-period';
import { POST } from '../src/app/api/paddle/webhook/route';

test('paid cycle ledger, renewal ordering, duplicates, cancellation and annual windows in Postgres', {skip:process.env.AGENT_BILLING_INTEGRATION !== 'true'}, async()=>{
 const url=new URL(process.env.DATABASE_URL || '');
 assert.ok(['localhost','127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/hirelix_workspace_qa_'));
 const owner=randomUUID(), sub=`sub_${owner}`;
 const env={PADDLE_WEBHOOK_SECRET:process.env.PADDLE_WEBHOOK_SECRET,NEXT_PUBLIC_PADDLE_AGENT_MONTHLY_PRICE_ID:process.env.NEXT_PUBLIC_PADDLE_AGENT_MONTHLY_PRICE_ID,RESEND_API_KEY:process.env.RESEND_API_KEY};
 process.env.PADDLE_WEBHOOK_SECRET='isolated-cycle-test';process.env.NEXT_PUBLIC_PADDLE_AGENT_MONTHLY_PRICE_ID='pri_cycle';delete process.env.RESEND_API_KEY;
 const now=new Date(),start=new Date(now.getTime()-10*86400000),end=subscriptionMonth(start,1);
 async function event(id:string,type:string,data:Record<string,unknown>,occurred=now){
  const body=JSON.stringify({event_id:id,event_type:type,occurred_at:occurred.toISOString(),data});
  const ts=String(Math.floor(Date.now()/1000)),h1=createHmac('sha256','isolated-cycle-test').update(`${ts}:${body}`).digest('hex');
  const response=await POST(new NextRequest('http://localhost/api/paddle/webhook',{method:'POST',body,headers:{'paddle-signature':`ts=${ts};h1=${h1}`}}));
  assert.equal(response.status,200);return response.json();
 }
 const subscription={id:sub,status:'active',started_at:start.toISOString(),next_billed_at:end.toISOString(),custom_data:{user_id:owner},items:[{price:{id:'pri_cycle'}}]};
 const payment={id:`txn_${owner}`,subscription_id:sub,status:'completed',origin:'subscription_recurring',billing_period:{starts_at:start.toISOString(),ends_at:end.toISOString()}};
 try{
  await db.execute(sql`INSERT INTO "user"(id,email,"emailVerified","createdAt","updatedAt") VALUES(${owner},${`${owner}@example.test`},true,now(),now())`);
  // Payment arrives before subscription ownership is known: retained event is still usable.
  await event(`payment_${owner}`,'transaction.completed',payment);
  await event(`subscription_${owner}`,'subscription.updated',subscription);
  let access=await getAgentAccess(owner);
  assert.equal(access.state,'paid');assert.equal(access.periodStart,start.toISOString());assert.equal(access.periodEnd,end.toISOString());
  // An Agent summary must not touch retired sourcing/redemption tables.
  await db.transaction(async tx => {
   await tx.execute(sql`LOCK TABLE hirelix_searches, hirelix_usage_events, hirelix_redemptions IN ACCESS EXCLUSIVE MODE`);
   let timer: ReturnType<typeof setTimeout> | undefined;
   try {
    const summary = await Promise.race([
     getBillingSummaryForUser(owner),
     new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Agent billing waited on retired tables')), 2000); }),
    ]);
    assert.equal(summary.agent?.state, 'paid');
    assert.equal(summary.agent?.periodEnd, end.toISOString());
   } finally { clearTimeout(timer); }
  });
  const job=await enqueue(owner,'chat',randomUUID(),{});
  await db.execute(sql`UPDATE hirelix_private_jobs SET status='done' WHERE id=${job.id}::uuid`);
  await db.execute(sql`UPDATE hirelix_agent_credit_usage SET consumed_units=250000,reserved_units=250000 WHERE job_id=${job.id}::uuid`);
  assert.equal((await getAgentAccess(owner)).remaining,2975);
  assert.equal((await event(`payment_${owner}`,'transaction.completed',payment)).duplicate,true);
  await event(`duplicate_payment_${owner}`,'transaction.completed',payment);
  assert.equal((await getAgentAccess(owner)).remaining,2975,'Repeated transaction never tops up');
  await event(`schedule_cancel_${owner}`,'subscription.updated',{...subscription,scheduled_change:{action:'cancel',effective_at:end.toISOString()}},new Date(now.getTime()+1000));
  assert.equal((await getAgentAccess(owner)).remaining,2975,'Scheduled cancel retains paid access');
  assert.equal((await getAgentAccess(owner)).autoRenews,false);
  assert.equal((await getAgentAccess(owner)).paidThrough,end.toISOString());
  await event(`old_cancel_${owner}`,'subscription.canceled',{...subscription,status:'canceled'},new Date(now.getTime()-1000));
  assert.equal((await getAgentAccess(owner)).state,'paid','Old cancel cannot override new status');
  const expiredStart=subscriptionMonth(start,-2),expiredEnd=subscriptionMonth(start,-1);
  await db.execute(sql`UPDATE hirelix_billing_events SET payload=jsonb_set(payload,'{data,billing_period}',${JSON.stringify({starts_at:expiredStart.toISOString(),ends_at:expiredEnd.toISOString()})}::jsonb) WHERE payload->'data'->>'subscription_id'=${sub}`);
  await event(`unpaid_renewal_${owner}`,'subscription.updated',{...subscription,next_billed_at:subscriptionMonth(end,1).toISOString()},new Date(now.getTime()+2000));
  assert.equal((await getAgentAccess(owner)).remaining,0,'New subscription dates without successful payment grant nothing');
  await event(`new_payment_${owner}`,'transaction.completed',payment);
  assert.equal((await getAgentAccess(owner)).remaining,2975,'Delayed payment preserves usage in that same period');
  await db.execute(sql`UPDATE hirelix_agent_credit_usage SET charged_at=${expiredStart.toISOString()}::timestamptz WHERE job_id=${job.id}::uuid`);
  assert.equal((await getAgentAccess(owner)).remaining,3000,'Prior-period usage does not reduce current allowance');
  await db.execute(sql`UPDATE hirelix_user_settings SET subscription_plan='agent_annual',billing_cycle='year',subscription_started_at=${subscriptionMonth(start,-3).toISOString()}::timestamptz WHERE user_id=${owner}::uuid`);
  await db.execute(sql`UPDATE hirelix_billing_events SET payload=jsonb_set(payload,'{data,billing_period}',${JSON.stringify({starts_at:subscriptionMonth(start,-3).toISOString(),ends_at:subscriptionMonth(start,9).toISOString()})}::jsonb) WHERE event_id=${`new_payment_${owner}`}`);
  access=await getAgentAccess(owner);assert.equal(access.periodStart,start.toISOString());assert.equal(access.periodEnd,end.toISOString());assert.equal(access.limit,3000);
  await event(`cancel_${owner}`,'subscription.canceled',{...subscription,status:'canceled'},new Date(now.getTime()+3000));
  assert.equal((await getAgentAccess(owner)).remaining,0);
  await db.execute(sql`DELETE FROM hirelix_user_settings WHERE user_id=${owner}::uuid`);
  await db.execute(sql`DELETE FROM "user" WHERE id=${owner}`);
  await event(`late_deleted_${owner}`,'subscription.updated',subscription,new Date(now.getTime()+4000));
  assert.equal((await db.execute(sql`SELECT 1 FROM hirelix_user_settings WHERE user_id=${owner}::uuid`)).length,0,'Delayed signed callback cannot recreate a deleted account');
  assert.equal((await db.execute(sql`SELECT user_id FROM hirelix_billing_events WHERE event_id=${`late_deleted_${owner}`}`))[0].user_id,null);
 }finally{
  await db.execute(sql`DELETE FROM hirelix_private_jobs WHERE user_id=${owner}::uuid`);
  await db.execute(sql`DELETE FROM hirelix_agent_access WHERE user_id=${owner}::uuid`);
  await db.execute(sql`DELETE FROM hirelix_billing_events WHERE user_id=${owner}::uuid OR payload->'data'->>'subscription_id'=${sub} OR payload->'data'->'custom_data'->>'user_id'=${owner}`);
  await db.execute(sql`DELETE FROM hirelix_user_settings WHERE user_id=${owner}::uuid`);
  await db.execute(sql`DELETE FROM "user" WHERE id=${owner}`);
  for(const [key,value] of Object.entries(env)){if(value===undefined) delete process.env[key];else process.env[key]=value;}
  await closeDb();
 }
});
