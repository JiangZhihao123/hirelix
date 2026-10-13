import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { json, owned, rows, WorkspaceError } from "./database";
import { readSharedDocument } from "./document-sharing";
import { addRecord } from "./records";
import { recommendationFeedbackInput, feedbackLabels } from "./recommendation-feedback-contract";
import type { Deliverable, SourceRecord } from "./types";

export async function saveRecommendationFeedback(token: string, value: unknown) {
  const input = recommendationFeedbackInput.parse(value);
  return db.transaction(async tx => {
    const share = await readSharedDocument(token, tx);
    if (!share) throw new WorkspaceError("This recommendation is unavailable", 404);
    const person = share.snapshot.people.find(item => item.id === input.person_id);
    if (!person) throw new WorkspaceError("Choose a candidate from this recommendation", 400);
    const key = `${share.id}:${input.request_key}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`);
    const [existing] = await rows<SourceRecord>(sql`SELECT * FROM hirelix_private_records WHERE user_id=${share.user_id}::uuid AND details->>'feedback_request_key'=${key}`, tx);
    if (existing) {
      const [same] = await rows<{same: boolean}>(sql`SELECT details->'feedback_request'=${json(input)} AS same FROM hirelix_private_records WHERE id=${existing.id}::uuid`, tx);
      if (!same.same) throw new WorkspaceError("This feedback request was already used. Refresh before submitting different feedback.", 409);
      return {id: existing.id, saved_at: existing.created_at};
    }
    const [recent] = await rows<{count: number}>(sql`SELECT count(*)::int AS count FROM hirelix_private_records WHERE user_id=${share.user_id}::uuid AND details->>'share_id'=${share.id} AND created_at>now()-interval '1 hour'`, tx);
    if (recent.count >= 100) throw new WorkspaceError("Too many feedback submissions. Please try again later.", 429);
    const document = await owned<Deliverable>(share.user_id, "deliverable", share.deliverable_id, tx);
    const zh = share.snapshot.language === "zh";
    const record = await addRecord(share.user_id, {
      kind: "feedback", person_id: person.id, role_id: document.role_id,
      title: `${person.name} · ${feedbackLabels[input.response]}`,
      content: input.comment || feedbackLabels[input.response], occurred_at: new Date().toISOString(),
      details: {
        recommendation_id: document.id, recommendation_version: share.deliverable_version,
        response: input.response, source: "recommendation_link", submitted_name: input.name,
        identity_verified: false, share_id: share.id, feedback_request_key: key, feedback_request: input,
      },
    }, tx);
    // Return new evidence to the conversation that produced this recommendation.
    // This receipt reports feedback; it does not claim a meeting was scheduled.
    const [origin] = await rows<{conversation_id: string}>(sql`SELECT c.id AS conversation_id FROM hirelix_private_jobs j JOIN hirelix_private_conversations c ON c.user_id=j.user_id AND c.id::text=j.payload->>'conversation_id' WHERE j.user_id=${share.user_id}::uuid AND j.kind='deliverable' AND j.result->>'deliverable_id'=${document.id} ORDER BY j.created_at DESC LIMIT 1`, tx);
    const recordHref = `/app/roles/${document.role_id}?tab=activity&record=${record.id}`;
    if (origin) {
      const labels = {interview: "希望安排面试", hold: "暂缓考虑", decline: "此职位不再推进", comment: "补充意见"};
      const content = zh
        ? `推荐页收到针对 ${person.name} 的反馈：${labels[input.response]}。\n\n提交人填写的姓名：${input.name}（身份未经验证）。${input.comment ? `\n\n> ${input.comment.replace(/\n/g, "\n> ")}` : ""}\n\n反馈已关联到这位候选人和职位，可据此继续讨论下一步。`
        : `New recommendation-page feedback for ${person.name}: ${feedbackLabels[input.response]}.\n\nSubmitted name: ${input.name} (identity not verified).${input.comment ? `\n\n> ${input.comment.replace(/\n/g, "\n> ")}` : ""}\n\nSaved against this candidate and role, ready to use when deciding the next step.`;
      await tx.execute(sql`INSERT INTO hirelix_agent_messages(user_id,conversation_id,role,content,metadata) VALUES(${share.user_id}::uuid,${origin.conversation_id}::uuid,'assistant',${content},${json({feedback_record_id: record.id, sources: [{title: record.title, href: recordHref}]})})`);
      await tx.execute(sql`UPDATE hirelix_private_conversations SET updated_at=now() WHERE user_id=${share.user_id}::uuid AND id=${origin.conversation_id}::uuid`);
    }
    await tx.execute(sql`INSERT INTO hirelix_private_notifications(user_id,title,href,kind,request_key) VALUES(${share.user_id}::uuid,${record.title},${origin ? `/app?conversation=${origin.conversation_id}` : recordHref},'recommendation_feedback',${key}) ON CONFLICT DO NOTHING`);
    return {id: record.id, saved_at: record.created_at};
  });
}
