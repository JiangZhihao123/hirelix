import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  generateEmbeddings,
  getEmbeddingConfig,
} from "@/lib/candidate-index/embedding";
import {
  json,
  owned,
  rows,
  snapshot,
  WorkspaceError,
  type Runner,
} from "./database";
import { structured } from "./ai";
import { ROLE_BRIEF_EVIDENCE_RULES } from "./roles";
import {
  idSchema,
  type Person,
  type Role,
  type RoleCandidate,
  type SourceRecord,
} from "./types";
import type { JobHandler } from "./jobs";
export const assessmentInput = z.object({
  role_id: idSchema,
  person_id: idSchema,
});
const observation = z.object({
  text: z.string(),
  record_ids: z.array(idSchema),
  from_profile: z.boolean(),
});
export const assessmentOutput = z.object({
  decision: z.enum([
    "worth_discussing",
    "needs_more_information",
    "not_aligned",
  ]),
  summary: z.string(),
  strengths: z.array(observation),
  gaps: z.array(observation),
  questions: z.array(z.string()),
  unconfirmed: z.array(z.string()),
});
const signature = (records: SourceRecord[]) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        records.map((record) => [record.id, record.version]).sort(),
      ),
    )
    .digest("hex");
async function sources(userId: string, personId: string, tx: Runner = db) {
  return rows<SourceRecord>(
    sql`SELECT * FROM hirelix_private_records WHERE user_id=${userId}::uuid AND person_id=${personId}::uuid ORDER BY id`,
    tx,
  );
}
export const assessCandidate: JobHandler = async (job, progress) => {
  const input = assessmentInput.parse(job.payload);
  const role = await owned<Role>(job.user_id, "role", input.role_id),
    person = await owned<Person>(job.user_id, "person", input.person_id);
  const [relationship] = await rows<RoleCandidate>(
    sql`SELECT * FROM hirelix_private_role_candidates WHERE user_id=${job.user_id}::uuid AND role_id=${role.id}::uuid AND person_id=${person.id}::uuid`,
  );
  if (!relationship)
    throw new WorkspaceError(
      "Link this candidate to the role before requesting an assessment",
    );
  const records = await sources(job.user_id, person.id);
  let evidence: unknown = records;
  let scope = "Full saved profile and source records";
  if (JSON.stringify({ person, records }).length > 140000) {
    await progress(
      "Finding relevant passages in this candidate's source records",
    );
    const model = getEmbeddingConfig().model,
      vector = (
        await generateEmbeddings([
          `${role.title}\n${role.jd_text}\n${JSON.stringify(role.brief)}`,
        ])
      ).embeddings[0];
    const passages = await rows<{ record_id: string | null; content: string }>(
      sql`SELECT record_id,content FROM hirelix_private_embeddings WHERE user_id=${job.user_id}::uuid AND person_id=${person.id}::uuid AND model=${model} ORDER BY embedding<=>${JSON.stringify(vector)}::vector LIMIT 40`,
    );
    if (!passages.length)
      throw new WorkspaceError(
        "This candidate has extensive source material that needs indexing first. Retry after indexing completes.",
        409,
      );
    evidence = passages;
    scope = `Saved profile plus 40 most relevant indexed passages from ${records.length} source records. Other passages have not been reviewed for this assessment.`;
  }
  await progress(`Comparing ${person.name} with ${role.title}`);
  // The model chooses short, constrained source references. Database identities are resolved here.
  const sourceItems = (
    evidence as Array<Partial<SourceRecord> & { record_id?: string | null }>
  ).map((item, index) => ({
    reference: `source_${index + 1}`,
    record_id: item.id || item.record_id || null,
    data: {
      title: item.title,
      kind: item.kind,
      content: item.content,
      occurred_at: item.occurred_at,
      recorded_at: item.created_at,
      source_url: item.source_url,
      role_context: item.role_id
        ? item.role_id === role.id
          ? "This role"
          : "A different role"
        : "General candidate record",
    },
  }));
  const references = new Map<string, string | null>([
    ["profile", null],
    ...sourceItems.map(
      (item) => [item.reference, item.record_id] as [string, string | null],
    ),
  ]);
  const sourceObservation = z.object({
    text: z.string(),
    source_refs: z.array(
      z.enum(["profile", ...sourceItems.map((item) => item.reference)]),
    ),
  });
  const modelSchema = assessmentOutput
    .omit({ strengths: true, gaps: true })
    .extend({
      strengths: z.array(sourceObservation),
      gaps: z.array(sourceObservation),
    });
  const answer = await structured(
    job.user_id,
    "private_role_assessment",
    modelSchema,
    "Evaluate only the supplied (role, candidate) pair. Compare role function, seniority, actual work and must-have evidence, not employer prestige or keyword overlap. Treat missing evidence as unknown. Interest or rejection for another role is not a global label. Cite source_refs only from the provided reference catalog: profile or source_N. Use an empty array when describing missing evidence. Never invent a source reference. Distinguish missing evidence from evidence of mismatch. State unconfirmed availability, conditions and sharing permission. The relationship describes only this role. " + ROLE_BRIEF_EVIDENCE_RULES,
    {
      role: {
        title: role.title,
        client_name: role.client_name,
        jd_text: role.jd_text,
        brief: role.brief,
        client_contact: role.client_contact,
      },
      candidate_profile: {
        reference: "profile",
        name: person.name,
        headline: person.headline,
        location: person.location,
        skills: person.skills,
        profile: person.profile,
      },
      relationship: {
        permission: relationship.permission,
        interest: relationship.interest,
        notes: relationship.notes,
      },
      source_scope: scope,
      source_records: sourceItems.map((item) => ({
        reference: item.reference,
        ...item.data,
      })),
    },
  );
  const resolve = (item: z.infer<typeof sourceObservation>) => ({
    text: item.text,
    from_profile: item.source_refs.some((ref) => references.get(ref) === null),
    record_ids: [
      ...new Set(
        item.source_refs
          .map((ref) => references.get(ref))
          .filter((id): id is string => typeof id === "string"),
      ),
    ],
  });
  const result = {
    ...answer,
    strengths: answer.strengths.map(resolve),
    gaps: answer.gaps.map(resolve),
  };
  const assessment = {
    ...result,
    scope,
    person_version: person.version,
    record_signature: signature(records),
    role_version: role.version,
    assessed_at: new Date().toISOString(),
  };
  return {
    result: { person_id: person.id, role_id: role.id, assessment },
    apply: async (tx) => {
      const currentRole = await owned<Role>(
          job.user_id,
          "role",
          role.id,
          tx,
          true,
        ),
        currentPerson = await owned<Person>(
          job.user_id,
          "person",
          person.id,
          tx,
          true,
        );
      const currentRecords = await sources(job.user_id, person.id, tx);
      if (
        currentRole.version !== role.version ||
        currentPerson.version !== person.version ||
        signature(currentRecords) !== signature(records)
      )
        return {
          superseded: true,
          message:
            "The role or candidate changed while this assessment was being prepared. Review the changes and run it again.",
        };
      const [updated] = await rows<RoleCandidate>(
        sql`UPDATE hirelix_private_role_candidates SET assessment=${json(assessment)},assessed_role_version=${role.version},version=version+1,updated_at=now() WHERE user_id=${job.user_id}::uuid AND role_id=${role.id}::uuid AND person_id=${person.id}::uuid RETURNING *`,
        tx,
      );
      if (!updated)
        throw new WorkspaceError(
          "The candidate is no longer linked to this role",
          409,
        );
      await snapshot(job.user_id, "role_candidate", updated, tx);
    },
  };
};
