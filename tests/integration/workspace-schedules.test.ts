import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, afterEach, test } from "node:test";
import { sql } from "drizzle-orm";
import { db, closeDb } from "../../src/db/client";
import { initializeGlobalOutboundProxy } from "../../src/lib/server-outbound-proxy";
import { createRole, linkPerson } from "../../src/lib/workspace/roles";
import { createPerson } from "../../src/lib/workspace/people";
import { addRecord } from "../../src/lib/workspace/records";
import { enqueue, owned, rows, WorkspaceError } from "../../src/lib/workspace/database";
import { saveSchedule, nextScheduleRun, queueScheduledDrafts, retrySchedule } from "../../src/lib/workspace/schedules";
import { generateDeliverable } from "../../src/lib/workspace/deliverables";
import { claimJob, finishJob, failJob, retryJob, LostLease } from "../../src/lib/workspace/jobs";
import type { Deliverable, Job, Schedule } from "../../src/lib/workspace/types";
const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
if (!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/hirelix_workspace_qa_") || process.env.WORKSPACE_REAL_AI_TEST !== "true") throw new Error("Use isolated local PostgreSQL and real AI; stop the QA worker while this test claims its jobs");
initializeGlobalOutboundProxy();
const owner = randomUUID();
const accounts = [owner];
afterEach(async () => { for (const account of accounts) await db.execute(sql`UPDATE hirelix_private_schedules SET enabled=false WHERE user_id=${account}::uuid`); });
after(async () => {
  for (const account of accounts) {
    await db.execute(sql`UPDATE hirelix_private_schedules SET enabled=false WHERE user_id=${account}::uuid`);
    await db.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled' WHERE user_id=${account}::uuid AND status IN ('queued','running')`);
  }
  await closeDb();
});
const agreement = { enabled: true, timezone: "Europe/London", weekday: 5, local_time: "09:00", interval_weeks: 1, language: "en", person_ids: [], include_role_records: true, include_candidate_records: false, only_when_changed: true };

test("real PostgreSQL recurrence: local clock across DST, folds/gaps, fortnight phase and delayed execution", async () => {
  const config = { timezone: "Europe/London", weekday: 0, local_time: "01:30", interval_weeks: 1 as const };
  assert.equal(await nextScheduleRun(config, "2026-03-28T12:00:00Z"), "2026-03-29T01:30:00.000Z"); // gap -> 02:30 BST
  assert.equal(await nextScheduleRun(config, "2026-10-24T12:00:00Z"), "2026-10-25T01:30:00.000Z"); // fold -> standard time
  assert.equal(await nextScheduleRun({ ...config, weekday: 5, local_time: "09:00" }, "2026-03-27T09:01:00Z"), "2026-04-03T08:00:00.000Z");
  assert.equal(await nextScheduleRun({ ...config, weekday: 5, local_time: "09:00", interval_weeks: 2 }, "2026-04-10T08:01:00Z", "2026-03-27T09:00:00Z"), "2026-04-24T08:00:00.000Z");
});

test("real PG + AI: atomic due runs, source opt-in, pause, allowance error, failure retry, one draft/charge/notice", { timeout: 240000 }, async () => {
  const role = await createRole(owner, { title: "Fictional schedule QA VP Product", client_name: "Fictional QA", jd_text: "Lead 12 product managers in enterprise B2B SaaS. Confirmed GBP 165,000–180,000. Two office days each week in London." });
  const person = await createPerson(owner, { name: "Fictional scheduled candidate", headline: "Product Director", note: "PRIVATE UNSELECTED NOTE: do not expose this marker", email: "private-schedule@example.test" });
  await linkPerson(owner, role.id, person.id);
  const now = new Date(), due = await nextScheduleRun({ timezone: agreement.timezone, weekday: agreement.weekday, local_time: agreement.local_time, interval_weeks: 1 }, new Date(now.getTime() - 8 * 86400000).toISOString()), start = new Date(now.getTime() - 7 * 86400000).toISOString();
  const feedback = await addRecord(owner, { role_id: role.id, kind: "feedback", title: "Fictional dated office requirement", content: "Client confirmed two office days each week in London and unchanged GBP 165,000–180,000.", occurred_at: new Date(now.getTime() - 120000).toISOString() });
  const schedule = await saveSchedule(owner, role.id, { ...agreement, person_ids: [person.id] });
  await assert.rejects(() => saveSchedule(randomUUID(), role.id, agreement), (e: unknown) => e instanceof WorkspaceError && e.status === 404);
  await assert.rejects(() => saveSchedule(owner, role.id, { ...agreement, timezone: "Invalid/Nowhere" }));
  await db.execute(sql`UPDATE hirelix_private_schedules SET next_run_at=${due}::timestamptz,last_period_end=${start}::timestamptz WHERE id=${schedule.id}::uuid`);
  for (const status of ["paused", "closed", "active"]) {
    await db.execute(sql`UPDATE hirelix_private_roles SET status=${status} WHERE id=${role.id}::uuid`);
    if (status !== "active") assert.equal(await queueScheduledDrafts(), 0);
  }
  const counts = await Promise.all([queueScheduledDrafts(), queueScheduledDrafts()]);
  assert.equal(counts.reduce((a, b) => a + b, 0), 1);
  const [saved] = await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE id=${schedule.id}::uuid`);
  assert(saved.last_job_id);
  const queued = await owned<Job>(owner, "job", saved.last_job_id);
  assert.equal((queued.payload.request as { report_timezone: string }).report_timezone, agreement.timezone);
  assert.equal((queued.payload.source as { report_timezone: string }).report_timezone, agreement.timezone);
  assert.deepEqual((queued.payload.request as { record_ids: string[] }).record_ids, [feedback.id]);
  assert.doesNotMatch(JSON.stringify(queued.payload.source), /PRIVATE UNSELECTED|private-schedule@example/);
  const job = await claimJob(["deliverable"]);
  assert.equal(job?.id, queued.id); assert(job);
  await failJob(job, "Fictional QA simulated worker failure; source evidence retained");
  assert.equal(await queueScheduledDrafts(), 0);
  const retried = await retryJob(owner, job.id);
  assert.equal(retried.id, job.id);
  const claimed = await claimJob(["deliverable"]); assert(claimed); assert.equal(claimed.id, job.id);
  const result = await finishJob(claimed, await generateDeliverable(claimed, async () => {}));
  const document = await owned<Deliverable>(owner, "deliverable", String((result as Record<string, unknown>).deliverable_id));
  assert.equal(document.status, "draft"); assert.equal(document.source_snapshot.role && (document.source_snapshot.role as { id: string }).id, role.id);
  assert.match(document.content, /165,000/); assert.match(document.content, /London/);
  assert.doesNotMatch(document.content, /PRIVATE UNSELECTED|private-schedule@example/);
  const [totals] = await rows<{ documents: number; usage: number; notices: number }>(sql`SELECT (SELECT count(*)::int FROM hirelix_private_deliverables WHERE user_id=${owner}::uuid) documents,(SELECT count(*)::int FROM hirelix_agent_credit_usage WHERE job_id=${job.id}::uuid) usage,(SELECT count(*)::int FROM hirelix_private_notifications WHERE user_id=${owner}::uuid) notices`);
  assert.deepEqual(totals, { documents: 1, usage: 1, notices: 1 });
  await saveSchedule(owner, role.id, { ...agreement, person_ids: [person.id], enabled: false });
  await db.execute(sql`UPDATE hirelix_private_schedules SET next_run_at=${due}::timestamptz WHERE id=${schedule.id}::uuid`);
  assert.equal(await queueScheduledDrafts(), 0);
  await saveSchedule(owner, role.id, { ...agreement, person_ids: [person.id], enabled: true });
  await db.execute(sql`UPDATE hirelix_agent_access SET trial_started_at=now()-interval '8 days' WHERE user_id=${owner}::uuid`);
  const quotaRole = await createRole(owner, { title: "Fictional expired schedule QA", client_name: "QA", jd_text: "Lead a product team" });
  const quotaSchedule = await saveSchedule(owner, quotaRole.id, agreement);
  await db.execute(sql`UPDATE hirelix_private_schedules SET next_run_at=${due}::timestamptz WHERE id=${quotaSchedule.id}::uuid`);
  assert.equal(await queueScheduledDrafts(), 0);
  const [blocked] = await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE id=${quotaSchedule.id}::uuid`);
  assert.match(blocked.error ?? "", /allowance/); assert.equal(new Date(blocked.next_run_at).toISOString(), due);
  await retrySchedule(owner, quotaRole.id);
  assert.equal(await queueScheduledDrafts(), 0); // same real expired allowance still fails
});

test("real scheduled drafts: unchanged evidence produces another draft without a repeated notice", { timeout: 240000 }, async () => {
  const account = randomUUID();
  accounts.push(account);
  const role = await createRole(account, { title: "Fictional unchanged schedule QA", client_name: "QA", jd_text: "Lead product managers. Other activity is not established." });
  const schedule = await saveSchedule(account, role.id, { ...agreement, include_role_records: false });
  for (let iteration = 0; iteration < 2; iteration++) {
    const [current] = await rows<Schedule>(sql`SELECT * FROM hirelix_private_schedules WHERE id=${schedule.id}::uuid`);
    assert.equal(await queueScheduledDrafts(1, new Date(current.next_run_at).toISOString()), 1);
    const job = await claimJob(["deliverable"]); assert(job); assert.equal(job.payload.schedule_id, schedule.id);
    const completed = await finishJob(job, await generateDeliverable(job, async () => {}));
    const document = await owned<Deliverable>(account, "deliverable", String((completed as Record<string, unknown>).deliverable_id));
    assert.equal(document.status, "draft");
  }
  const [total] = await rows<{ count: number }>(sql`SELECT count(*)::int AS count FROM hirelix_private_notifications WHERE user_id=${account}::uuid AND href LIKE ${`/app/roles/${role.id}/updates/%`}`);
  assert.equal(total.count, 1);
  await saveSchedule(account, role.id, { ...agreement, include_role_records: false, enabled: false });
});


test("real PG: pausing an agreement cancels its running result and preserves its next date", async () => {
  const account = randomUUID(); accounts.push(account);
  const role = await createRole(account, {title: "Pause fence QA", client_name: "QA", jd_text: "Lead product."});
  const saved = await saveSchedule(account, role.id, agreement);
  const queued = await enqueue(account, "deliverable", randomUUID(), {schedule_id: saved.id, schedule_version: saved.version});
  const running = await claimJob(["deliverable"]); assert.equal(running?.id, queued.id);
  const paused = await saveSchedule(account, role.id, {...agreement, enabled: false});
  assert.equal(new Date(paused.next_run_at).getTime(), new Date(saved.next_run_at).getTime());
  assert.equal(paused.version, saved.version + 1);
  assert.equal((await owned<Job>(account, "job", queued.id)).status, "cancelled");
  let wrote = false;
  await assert.rejects(() => finishJob(running!, {result: {}, apply: async () => {wrote = true;}}), LostLease);
  assert.equal(wrote, false);
});
