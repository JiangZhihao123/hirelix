import { sql } from "drizzle-orm";
import { owned, rows } from "./database";
import type { Deliverable, Role, SourceRecord } from "./types";
import type {
  RecommendationEvent,
  RecommendationRole,
  RecommendationWorkspace,
} from "./recommendations-contract";

// A read model over existing business records. Creating a document/link is not a delivery.
export async function recommendations(
  userId: string,
  roleId: string | null = null,
): Promise<RecommendationWorkspace> {
  if (roleId) await owned(userId, "role", roleId);
  const [roles, documents, records, emails, shares] = await Promise.all([
    rows<Role>(
      sql`SELECT * FROM hirelix_private_roles WHERE user_id=${userId}::uuid AND (${roleId}::uuid IS NULL OR id=${roleId}::uuid) ORDER BY updated_at DESC`,
    ),
    rows<Deliverable>(
      sql`SELECT * FROM hirelix_private_deliverables WHERE user_id=${userId}::uuid AND kind='submission' AND source_snapshot->>'audience' IS DISTINCT FROM 'internal' AND (${roleId}::uuid IS NULL OR role_id=${roleId}::uuid) ORDER BY updated_at DESC`,
    ),
    rows<SourceRecord>(
      sql`SELECT * FROM hirelix_private_records WHERE user_id=${userId}::uuid AND (kind='feedback' OR details ? 'deliverable_id') AND (${roleId}::uuid IS NULL OR role_id=${roleId}::uuid) ORDER BY COALESCE(occurred_at,created_at) DESC`,
    ),
    rows<{
      id: string;
      deliverable_id: string;
      deliverable_version: number;
      status: string;
      snapshot: RecommendationEvent["snapshot"] & { to?: string };
      created_at: string;
    }>(
      sql`SELECT e.* FROM hirelix_private_email_deliveries e JOIN hirelix_private_deliverables d ON d.id=e.deliverable_id AND d.user_id=e.user_id WHERE e.user_id=${userId}::uuid AND d.kind='submission' AND (${roleId}::uuid IS NULL OR d.role_id=${roleId}::uuid) ORDER BY e.created_at DESC`,
    ),
    rows<{
      id: string;
      deliverable_id: string;
      deliverable_version: number;
      snapshot: RecommendationEvent["snapshot"];
      created_at: string;
      revoked_at: string | null;
      expires_at: string;
    }>(
      sql`SELECT s.* FROM hirelix_private_document_shares s JOIN hirelix_private_deliverables d ON d.id=s.deliverable_id AND d.user_id=s.user_id WHERE s.user_id=${userId}::uuid AND (${roleId}::uuid IS NULL OR d.role_id=${roleId}::uuid) ORDER BY s.created_at DESC`,
    ),
  ]);
  const result: RecommendationRole[] = roles.map((role) => {
    const materials = documents.filter((d) => d.role_id === role.id);
    const byId = new Map(materials.map((d) => [d.id, d]));
    const feedback = records.filter(
      (r) => r.role_id === role.id && r.kind === "feedback" && r.person_id,
    );
    const events: RecommendationEvent[] = [];
    for (const email of emails) {
      const doc = byId.get(email.deliverable_id);
      if (!doc) continue;
      const stale =
        email.status === "sending" &&
        new Date(email.created_at).getTime() < Date.now() - 120000;
      events.push({
        id: email.id,
        document_id: doc.id,
        version: email.deliverable_version,
        channel: "gmail",
        status: stale ? "unknown" : email.status,
        at: email.created_at,
        recipient: email.snapshot.to || "",
        note: "",
        person_ids: email.snapshot.people?.map((p) => p.id) || doc.person_ids,
        snapshot: email.snapshot,
      });
    }
    for (const record of records) {
      const doc = byId.get(String(record.details.deliverable_id));
      if (!doc || record.kind !== "event") continue;
      // Gmail also writes a legacy submission marker; its receipt is the authoritative event.
      if (
        !record.details.channel &&
        events.some((e) => e.document_id === doc.id && e.status === "sent")
      )
        continue;
      events.push({
        id: record.id,
        document_id: doc.id,
        version: Number(record.details.deliverable_version) || doc.version,
        channel: String(record.details.channel || "other"),
        status: "recorded",
        at: record.occurred_at || record.created_at,
        recipient: String(record.details.recipient || ""),
        note: record.content,
        person_ids: Array.isArray(record.details.person_ids)
          ? (record.details.person_ids as string[])
          : doc.person_ids,
        snapshot: (record.details
          .delivery_snapshot as RecommendationEvent["snapshot"]) || {
          title: doc.title,
          content: doc.content,
          people: doc.source_snapshot
            .people as RecommendationEvent["snapshot"]["people"],
        },
      });
    }
    for (const share of shares) {
      const doc = byId.get(share.deliverable_id);
      if (!doc) continue;
      events.push({
        id: share.id,
        document_id: doc.id,
        version: share.deliverable_version,
        channel: "link",
        status: share.revoked_at
          ? "revoked"
          : new Date(share.expires_at).getTime() < Date.now()
            ? "expired"
            : "published",
        at: share.created_at,
        recipient: "",
        note: "",
        person_ids: share.snapshot.people?.map((p) => p.id) || [],
        snapshot: share.snapshot,
      });
    }
    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const delivered = events.filter(
      (e) => e.status === "sent" || e.status === "recorded",
    );
    const people = new Map<
      string,
      { id: string; name: string; headline: string }
    >();
    for (const doc of materials)
      for (const person of (doc.source_snapshot.people || []) as Array<{
        id: string;
        name: string;
        headline?: string;
      }>)
        if (!people.has(person.id)) people.set(person.id, { ...person, headline: person.headline || "" });
    for (const event of events)
      for (const person of event.snapshot.people || [])
        if (!people.has(person.id))
          people.set(person.id, { ...person, headline: person.headline || "" });
    return {
      role,
      materials,
      events,
      feedback,
      people: [...people.values()],
      recommended_count: new Set(delivered.flatMap((e) => e.person_ids)).size,
      last_delivery: delivered[0]?.at || null,
    };
  });
  return { roles: result };
}
