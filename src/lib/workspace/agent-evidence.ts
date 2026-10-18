import { sql } from "drizzle-orm";
import { rows, textArray, WorkspaceError } from "./database";
import type { Message, SourceRecord } from "./types";
import type { Reminder } from "./reminders";

// Tool views preserve source provenance without turning saved summaries into
// original testimony or introducing a second store of business facts.
export async function recordEvidence(userId: string, records: SourceRecord[]) {
  if (records.some((record) => record.user_id !== userId))
    throw new WorkspaceError("Record not found", 404);
  const versions = records.length
    ? await rows<{
        entity_id: string;
        version: number;
        source_message_id: string;
      }>(sql`
    SELECT entity_id,version,snapshot->'details'->>'source_message_id' AS source_message_id
    FROM hirelix_private_versions WHERE user_id=${userId}::uuid AND entity_type='record'
      AND entity_id::text=ANY(${textArray(records.map((record) => record.id))})
      AND snapshot->'details'->>'source_message_id' IS NOT NULL ORDER BY version
  `)
    : [];
  const committed = records.length
    ? await rows<{
        record_id: string;
        record_version: number;
        message_id: string;
      }>(sql`
    SELECT receipt.value->'output'->'record'->>'id' AS record_id,
      (receipt.value->'output'->'record'->>'version')::int AS record_version,
      j.payload->>'message_id' AS message_id
    FROM hirelix_private_jobs j CROSS JOIN LATERAL jsonb_each(COALESCE(j.result->'tool_receipts','{}'::jsonb)) receipt
    WHERE j.user_id=${userId}::uuid AND j.kind='chat'
      AND receipt.value->'output'->'record'->>'id'=ANY(${textArray(records.map((record) => record.id))})
      AND j.payload->>'message_id' IS NOT NULL
  `)
    : [];
  const references = [
    ...committed,
    ...versions.map((item) => ({
      record_id: item.entity_id,
      record_version: item.version,
      message_id: item.source_message_id,
    })),
    ...records.flatMap((record) =>
      typeof record.details.source_message_id === "string"
        ? [
            {
              record_id: record.id,
              record_version: record.version,
              message_id: record.details.source_message_id,
            },
          ]
        : [],
    ),
  ].filter(
    (reference, index, all) =>
      all.findIndex(
        (item) =>
          item.record_id === reference.record_id &&
          item.record_version === reference.record_version,
      ) === index,
  );
  const ids = [...new Set(references.map((reference) => reference.message_id))];
  const messages = ids.length
    ? await rows<Message>(sql`
    SELECT id,content,created_at,conversation_id FROM hirelix_agent_messages
    WHERE user_id=${userId}::uuid AND role='user' AND id::text=ANY(${textArray(ids)}) ORDER BY created_at,id
  `)
    : [];
  return {
    saved_records: records.map((record) => ({
      id: record.id,
      kind: record.kind,
      title: record.title,
      content: record.content,
      version: record.version,
      person_id: record.person_id,
      role_id: record.role_id,
      file_id: record.file_id,
      source_url: record.source_url,
      occurred_at: record.occurred_at,
      occurred_on: record.details.occurred_on ?? null,
      recommendation_feedback: record.details.recommendation_id ? {
        recommendation_id: record.details.recommendation_id,
        recommendation_version: record.details.recommendation_version ?? null,
        share_id: record.details.share_id ?? null,
        response: record.details.response,
        source: record.details.source || "recruiter_report",
        submitted_name: record.details.submitted_name ?? null,
        identity_verified: record.details.identity_verified ?? null,
      } : null,
      source_message_ids: [
        ...new Set(
          references
            .filter((reference) => reference.record_id === record.id)
            .map((reference) => reference.message_id),
        ),
      ],
    })),
    reported_messages: messages.map((message) => ({
      id: message.id,
      text: message.content,
      reported_at: message.created_at,
      record_versions: references
        .filter((reference) => reference.message_id === message.id)
        .filter(
          (reference, index, all) =>
            all.findIndex(
              (item) =>
                item.record_id === reference.record_id &&
                item.record_version === reference.record_version,
            ) === index,
        )
        .map(({ record_id, record_version }) => ({
          record_id,
          record_version,
        })),
    })),
  };
}

export function reminderEvidence(reminder: Reminder) {
  const { completed_at, ...item } = reminder;
  return {
    ...item,
    notification_status: completed_at
      ? "delivered"
      : reminder.enabled
        ? "scheduled"
        : "paused",
    notification_delivered_at: completed_at,
  };
}
