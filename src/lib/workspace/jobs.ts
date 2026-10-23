import { workErrorDiagnostics } from "./error-diagnostics";
import { turnParts } from "./turn-progress";
import { isIncludedTask } from "./database";
import { reserveAgentCredits, AgentCreditError } from "@/lib/agent-access";
import { agentCreditContext, executionTrace } from "@/lib/agent-credit-context";
import { CREDIT_UNITS } from "@/lib/agent-plan";
import { getLogger } from "@/lib/logger";
import { IndexProviderError } from "@/lib/candidate-index/provider-request";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { json, owned, rows, WorkspaceError, type Runner } from "./database";
import type { Job, JobKind } from "./types";
import { turnActivity } from "./turn-progress";

const LEASE_SECONDS = 120;
const logger = getLogger({ component: "private_workspace_jobs" });
export type PreparedJob = {
  result: Record<string, unknown>;
  apply?: (tx: Runner) => Promise<Record<string, unknown> | void>;
};
export type JobHandler = (
  job: Job,
  progress: (message: string) => Promise<void>,
) => Promise<PreparedJob>;
export class LostLease extends Error {
  constructor() {
    super("This task was taken over by another worker");
  }
}
export async function claimJob(kinds: JobKind[], exact?: {id:string;userId:string}): Promise<Job | null> {
  if (!kinds.length) return null;
  return db.transaction(async (tx) => {
    const eligible = sql`(j.kind<>'chat' OR (
      EXISTS(SELECT 1 FROM hirelix_private_conversations c WHERE c.user_id=j.user_id AND c.id::text=j.payload->>'conversation_id' AND NOT c.stopped)
      AND NOT EXISTS(SELECT 1 FROM hirelix_private_jobs other WHERE other.user_id=j.user_id AND other.kind='chat' AND other.payload->>'conversation_id'=j.payload->>'conversation_id' AND other.id<>j.id AND (other.status='running' OR (other.status='queued' AND (
        coalesce((other.payload->>'priority')::int,0)>coalesce((j.payload->>'priority')::int,0) OR (coalesce((other.payload->>'priority')::int,0)=coalesce((j.payload->>'priority')::int,0) AND (other.created_at,other.id)<(j.created_at,j.id))
      ))))
    ))`;
    const candidates = await rows<Job>(sql`SELECT j.* FROM hirelix_private_jobs j WHERE j.status='queued' AND j.kind IN (${sql.join(kinds.map(kind=>sql`${kind}`),sql`, `)}) ${exact ? sql`AND j.id=${exact.id}::uuid AND j.user_id=${exact.userId}::uuid` : sql``} AND ${eligible} ORDER BY CASE WHEN j.kind='index' THEN 1 ELSE 0 END,j.created_at,j.id LIMIT 20`,tx);
    for (const candidate of candidates) {
      // Same lock order as send/stop/edit: conversation, job, then billing.
      if(candidate.kind==='chat') {
        const locked = await rows(sql`SELECT id FROM hirelix_private_conversations WHERE user_id=${candidate.user_id}::uuid AND id=${String(candidate.payload.conversation_id)}::uuid FOR UPDATE SKIP LOCKED`,tx);
        if(!locked.length) continue;
      }
      const [job] = await rows<Job>(sql`SELECT j.* FROM hirelix_private_jobs j WHERE j.id=${candidate.id}::uuid AND j.status='queued' AND ${eligible} FOR UPDATE SKIP LOCKED`,tx);
      if(!job) continue;
      // A reclaimed execution replaces its unfinished attempt; no retry costs
      // accumulate into the customer's successful result.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-billing:${job.user_id}`},0))`);
      await tx.execute(sql`UPDATE hirelix_agent_credit_usage SET consumed_units=0,cost_nano_usd=0,pricing_snapshot='[]'::jsonb,reserved_units=least(reserved_units,${CREDIT_UNITS}) WHERE job_id=${job.id}::uuid`);
      const [claimed] = await rows<Job>(
        sql`UPDATE hirelix_private_jobs SET status='running',result=(coalesce(result,'{}'::jsonb)-'live_reply'-'message_id'-'parts'-'stream_sequence'-'stream_epoch'-'phase'-'cancelled_lease_token'-'cancelled_sequence') || ${json({stream_epoch: randomUUID()})},progress='Starting',attempts=attempts+1,lease_token=${randomUUID()}::uuid,lease_until=now()+${LEASE_SECONDS}*interval '1 second',error=NULL,updated_at=now() WHERE id=${job.id}::uuid RETURNING *`,
        tx,
      );
      if (claimed.kind === "chat") {
        await tx.execute(sql`UPDATE hirelix_agent_messages SET created_at=CASE WHEN metadata->>'delivery'='queued' THEN clock_timestamp() ELSE created_at END,metadata=metadata||'{"delivery":"sent"}'::jsonb WHERE user_id=${claimed.user_id}::uuid AND id=${claimed.payload.message_id as string}::uuid`);
      }
      return claimed;
    }
    return null;
  });
}
export async function heartbeat(job: Job, message?: string) {
  const updated = await rows(
    sql`UPDATE hirelix_private_jobs SET lease_until=now()+${LEASE_SECONDS}*interval '1 second',
      result=CASE WHEN ${message ?? null}::text IS NOT NULL AND progress IS DISTINCT FROM ${message ?? null}
        THEN jsonb_set(coalesce(result,'{}'::jsonb),'{activity}',coalesce(result->'activity','[]'::jsonb) || jsonb_build_array(jsonb_build_object('label',${message ?? null}::text,'at',now()))) ELSE result END,
      progress=coalesce(${message ?? null},progress),updated_at=now() WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid AND status='running' AND lease_token=${job.lease_token}::uuid AND lease_until>now() RETURNING id`,
  );
  if (!updated.length) throw new LostLease();
}
export { liveReplyWriter } from "./live-reply";
export async function finishJob(job: Job, prepared: PreparedJob) {
  return db.transaction(async (tx) => {
    if(job.kind === "chat") await owned(job.user_id,"conversation",String(job.payload.conversation_id),tx,true);
    if (typeof job.payload.parent_chat_job_id === "string") {
      const parent = await owned<Job>(job.user_id,"job",job.payload.parent_chat_job_id,tx,true);
      if (parent.status !== "running" || !parent.lease_until || new Date(parent.lease_until).getTime() <= Date.now()) throw new LostLease();
    }
    const current = await owned<Job>(job.user_id, "job", job.id, tx, true);
    if (
      current.status !== "running" ||
      current.lease_token !== job.lease_token ||
      !current.lease_until ||
      new Date(current.lease_until).getTime() <= Date.now()
    )
      throw new LostLease();
    const applied = await prepared.apply?.(tx);
    const activity = turnActivity(current.result);
    const result: Record<string, unknown> = { ...current.result, ...prepared.result, ...applied, ...(activity.length ? {activity} : {}) };
    if (typeof result.message_id === "string" && job.kind === "chat") {
      await tx.execute(sql`UPDATE hirelix_agent_messages SET metadata=metadata || ${json({activity})} WHERE id=${result.message_id}::uuid AND user_id=${job.user_id}::uuid`);
    }
    await tx.execute(
      sql`UPDATE hirelix_private_jobs SET status='done',result=${json(result)},progress='Complete',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid`,
    );
    if (typeof job.payload.conversation_id === "string" && !job.payload.schedule_id && !job.payload.parent_chat_job_id) {
      const href = `/app?conversation=${job.payload.conversation_id}`;
      await tx.execute(sql`INSERT INTO hirelix_private_notifications(user_id,title,href,kind,request_key) VALUES(${job.user_id}::uuid,${result.waiting_for_input ? "Your answer is needed" : job.kind === "chat" ? "Reply ready" : "Work complete"},${href},'conversation_result',${`job-ready:${job.id}`}) ON CONFLICT DO NOTHING`);
    }
    return result;
  });
}
export async function failJob(job: Job, message: string) {
  await db.transaction(async tx=>{
    if(job.kind==='chat') await owned(job.user_id,'conversation',String(job.payload.conversation_id),tx,true);
    const failed=await rows(sql`UPDATE hirelix_private_jobs SET status='error',result=coalesce(result,'{}'::jsonb)||${json(job.kind === 'chat' ? {paused:true} : {})},error=${message},progress='Needs attention',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=${job.id}::uuid AND user_id=${job.user_id}::uuid AND status='running' AND lease_token=${job.lease_token}::uuid RETURNING id`,tx);
    if(failed.length && job.kind==='chat') await tx.execute(sql`UPDATE hirelix_private_conversations SET stopped=true WHERE id=${String(job.payload.conversation_id)}::uuid AND user_id=${job.user_id}::uuid`);
  });
}
export async function reclaimJobs() {
  const expired = await rows<Job>(sql`SELECT * FROM hirelix_private_jobs WHERE status='running' AND lease_until<=now()`);
  const reclaimed: {id:string;status:string}[] = [];
  for (const job of expired) {
    const changed = await db.transaction(async tx => {
      if(job.kind === "chat") await owned(job.user_id,"conversation",String(job.payload.conversation_id),tx,true);
      const [updated] = await rows<{id:string;status:string}>(sql`UPDATE hirelix_private_jobs SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'error' END,result=(coalesce(result,'{}'::jsonb)-'live_reply'-'message_id'-'parts'-'stream_sequence'-'stream_epoch'-'phase'-'cancelled_lease_token'-'cancelled_sequence')||CASE WHEN kind='chat' THEN jsonb_build_object('paused',attempts>=3) ELSE '{}'::jsonb END,progress=CASE WHEN attempts<3 THEN 'Resuming interrupted task' ELSE 'Needs attention' END,error=CASE WHEN attempts<3 THEN NULL ELSE 'This task was interrupted repeatedly. Retry it when the worker is available.' END,lease_token=NULL,lease_until=NULL,updated_at=now() WHERE id=${job.id}::uuid AND status='running' AND lease_until<=now() RETURNING id,status`,tx);
      if(updated?.status === "error" && job.kind === "chat") await tx.execute(sql`UPDATE hirelix_private_conversations SET stopped=true WHERE id=${String(job.payload.conversation_id)}::uuid AND user_id=${job.user_id}::uuid`);
      return updated;
    });
    if(changed) reclaimed.push(changed);
  }
  return reclaimed;
}
export async function retryJob(userId: string, id: string, parent?: Job) {
  return db.transaction(async (tx) => {
    if (parent) {
      const current = await owned<Job>(userId,"job",parent.id,tx,true);
      if (current.user_id !== userId || current.kind !== "chat" || current.status !== "running" || current.lease_token !== parent.lease_token || !current.lease_until || new Date(current.lease_until).getTime() <= Date.now()) throw new LostLease();
    }
    const original = await owned<Job>(userId, "job", id, tx);
    if (original.kind === "chat" && typeof original.payload.conversation_id === "string") {
      // Serialize with sendMessage before taking the billing lock. A stale tab
      // must not restart an older failed turn after the user has moved on.
      await owned(userId, "conversation", original.payload.conversation_id, tx, true);
      const [latest] = await rows<{id: string}>(sql`SELECT id FROM hirelix_private_jobs WHERE user_id=${userId}::uuid AND kind='chat' AND status<>'queued' AND payload->>'conversation_id'=${original.payload.conversation_id} ORDER BY created_at DESC,id DESC LIMIT 1`, tx);
      if (latest?.id !== original.id) throw new WorkspaceError("A newer message has replaced this reply. Continue in the conversation instead.", 409);
    }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-billing:${userId}`}, 0))`);
    const job = await owned<Job>(userId, "job", id, tx, true);
    if (job.status !== "error" && !(parent && job.status === "cancelled" && job.payload.conversation_id === parent.payload.conversation_id && ["import","deliverable","revision"].includes(job.kind)))
      throw new WorkspaceError("Only failed tasks can be retried", 409);
    if (!(await isIncludedTask(job, tx))) {
      if (await reserveAgentCredits(userId, job.id, tx) === false) throw new WorkspaceError("Your AI credit allowance has ended. Open Settings → Billing to continue.", 402);
    }
    const [result] = await rows<Job>(
      sql`UPDATE hirelix_private_jobs SET status='queued',payload=(payload-'parent_chat_job_id') || ${json(parent ? {parent_chat_job_id:parent.id} : {})},result=coalesce(result,'{}'::jsonb)-'live_reply'-'message_id'-'parts'-'stream_sequence'-'stream_epoch'-'phase'-'cancelled_lease_token'-'cancelled_sequence'-'paused',progress='Queued for retry',error=NULL,attempts=0,updated_at=now() WHERE id=${id}::uuid AND user_id=${userId}::uuid RETURNING *`,
      tx,
    );
    if(job.kind === "chat") await tx.execute(sql`UPDATE hirelix_private_conversations SET stopped=false WHERE id=${String(job.payload.conversation_id)}::uuid AND user_id=${userId}::uuid`);
    return result;
  });
}
export async function processJob(
  handlers: Partial<Record<JobKind, JobHandler>>,
) {
  const job = await claimJob(Object.keys(handlers) as JobKind[]);
  if (!job) return false;
  let leaseLost = false,
    heartbeatRunning = false;
  const timer = setInterval(async () => {
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    try {
      await heartbeat(job);
    } catch {
      leaseLost = true;
    } finally {
      heartbeatRunning = false;
    }
  }, 30000);
  let phase = "prepare";
  const trace = executionTrace(job);
  try {
    const prepared = await agentCreditContext.run({...job, trace}, () => handlers[job.kind]!(job, async (message) => {
      if (leaseLost) throw new LostLease();
      await heartbeat(job, message);
    }));
    if (leaseLost) throw new LostLease();
    phase = "persist";
    await finishJob(job, prepared);
  } catch (error) {
    const fields = {
      ...trace,
      job_id: job.id,
      kind: job.kind,
      attempt: job.attempts,
      phase,
      ...workErrorDiagnostics(error),
      error_type: error instanceof Error ? error.name : "Unknown",
      provider_status: error instanceof IndexProviderError ? error.status : undefined,
    };
    // Provider errors can contain private source material or credentials.
    // Log identifiers and the error class, never its message or payload.
    if (error instanceof LostLease) {
      logger.warn(fields, "Private workspace task lost its lease");
    } else {
      logger.error(fields, "Private workspace task failed");
      await failJob(
        job,
        error instanceof IndexProviderError
          ? error.userMessage
          : error instanceof WorkspaceError || error instanceof AgentCreditError
          ? error.message
          : "This task could not finish. Your source material is saved. Retry the task or review the input.",
      );
    }
  } finally {
    clearInterval(timer);
  }
  return true;
}

export async function cancelJobInTransaction(userId: string, id: string, tx: Runner, visible?: {stream_epoch?: string; stream_sequence?: number}) {
    const job = await owned<Job>(userId, "job", id, tx, true);
    if (!["queued", "running"].includes(job.status)) return job;
    let result = job.result || {};
    if (job.kind === "chat" && typeof job.payload.conversation_id === "string") {
      // Preserve the visible transcript and committed receipts after interruption.
      const preservedParts = turnParts(result);
      result = {...result, parts: preservedParts};
      const preservedText = preservedParts.filter(part => part.type === "text").map(part => part.text).join("\n\n") || String(result.live_reply || "");
      const metadata = {reply_request_key: job.request_key, turn_status: "cancelled", activity: turnActivity(result), parts: preservedParts};
      const receiptId = result.receipt_message_id;
      const [message] = typeof receiptId === "string"
        ? await rows<{id:string}>(sql`UPDATE hirelix_agent_messages SET content=${preservedText},metadata=metadata || ${json(metadata)} WHERE id=${receiptId}::uuid AND user_id=${userId}::uuid AND conversation_id=${job.payload.conversation_id}::uuid RETURNING id`,tx)
        : await rows<{id:string}>(sql`INSERT INTO hirelix_agent_messages(user_id,conversation_id,role,content,metadata) VALUES(${userId}::uuid,${job.payload.conversation_id}::uuid,'assistant',${preservedText},${json(metadata)}) RETURNING id`,tx);
      result = {...result, message_id: message.id, cancelled_lease_token: job.lease_token,
        ...((visible?.stream_epoch === result.stream_epoch || (!visible?.stream_epoch && visible?.stream_sequence === 0)) && Number.isSafeInteger(visible?.stream_sequence) && visible!.stream_sequence! >= 0
          ? {cancelled_sequence: visible!.stream_sequence} : {})};
      delete result.live_reply;
    }
    const [cancelled] = await rows<Job>(sql`UPDATE hirelix_private_jobs SET status='cancelled',result=${json(result)},progress='Stopped',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE user_id=${userId}::uuid AND id=${id}::uuid RETURNING *`, tx);
    await tx.execute(sql`UPDATE hirelix_private_jobs SET status='cancelled',progress='Stopped',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE user_id=${userId}::uuid AND payload->>'parent_chat_job_id'=${id} AND status IN ('queued','running')`);
    if (job.kind === "chat" && job.lease_token) {
      await tx.execute(sql`SELECT pg_notify(${`hirelix_turn_${id.replaceAll("-", "")}_stop`},${JSON.stringify({lease:job.lease_token,sequence:result.cancelled_sequence})})`);
    }
    return cancelled;
}
export async function cancelJob(userId: string, id: string, visible?: {stream_epoch?: string; stream_sequence?: number}) {
  return db.transaction(async tx => {
    const job = await owned<Job>(userId,"job",id,tx);
    if(job.kind === "chat" && ["queued","running"].includes(job.status)) {
      await owned(userId,"conversation",String(job.payload.conversation_id),tx,true);
      const current = await owned<Job>(userId,"job",id,tx,true);
      if(!["queued","running"].includes(current.status)) return current;
      await tx.execute(sql`UPDATE hirelix_private_conversations SET stopped=true WHERE id=${String(job.payload.conversation_id)}::uuid AND user_id=${userId}::uuid`);
      await tx.execute(sql`UPDATE hirelix_private_jobs SET result=coalesce(result,'{}'::jsonb)||'{"paused":true}'::jsonb WHERE id=${id}::uuid`);
    }
    return cancelJobInTransaction(userId, id, tx, visible);
  });
}
