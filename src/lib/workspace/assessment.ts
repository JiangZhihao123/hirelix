import { assessmentSignature } from "./assessment-evidence";
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
  locale: z.enum(["en", "zh"]).default("en"),
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
async function sources(userId: string, personId: string, roleId: string, tx: Runner = db) {
  return rows<SourceRecord>(
    sql`SELECT * FROM hirelix_private_records WHERE user_id=${userId}::uuid AND ((person_id=${personId}::uuid AND (role_id IS NULL OR role_id=${roleId}::uuid)) OR (role_id=${roleId}::uuid AND person_id IS NULL)) ORDER BY id`,
    tx,
  );
}
export const savedAssessmentsInput = z.object({
  role_id: idSchema,
  expected_role_version: z.number().int().positive(),
  candidates: z.array(z.object({
    person_id: idSchema,
    expected_person_version: z.number().int().positive(),
    expected_relationship_version: z.number().int().positive().nullable(),
    source_records: z.array(z.object({id: idSchema, version: z.number().int().positive()})).max(100),
    assessment: assessmentOutput,
  })).min(1).max(30),
});

// Persist the Agent's evidence-based judgment without a second model call or
// a prescribed recruiting workflow. The existing role/person pair owns it.
export async function saveAgentAssessments(userId: string, value: unknown, tx: Runner) {
  const input = savedAssessmentsInput.parse(value);
  if (new Set(input.candidates.map(item => item.person_id)).size !== input.candidates.length)
    throw new WorkspaceError("Choose each candidate once");
  const role = await owned<Role>(userId, "role", input.role_id, tx, true);
  if (role.version !== input.expected_role_version)
    throw new WorkspaceError("Role requirements changed. Read the current role before saving the assessment.", 409);
  const saved = [];
  for (const item of input.candidates) {
    const person = await owned<Person>(userId, "person", item.person_id, tx, true);
    const [prior] = await rows<RoleCandidate>(sql`SELECT * FROM hirelix_private_role_candidates WHERE user_id=${userId}::uuid AND role_id=${role.id}::uuid AND person_id=${person.id}::uuid FOR UPDATE`, tx);
    if (person.version !== item.expected_person_version || (prior?.version ?? null) !== item.expected_relationship_version)
      throw new WorkspaceError("Candidate details changed. Read the current candidate and role before saving the assessment.", 409);
    const records = await sources(userId, person.id, role.id, tx);
    for (const reference of item.source_records)
      if (!records.some(record => record.id === reference.id && record.version === reference.version))
        throw new WorkspaceError("An assessment source changed or belongs to another candidate or role.", 409);
    const references = new Set(item.source_records.map(record => record.id));
    if ([...item.assessment.strengths, ...item.assessment.gaps].some(observation => observation.record_ids.some(id => !references.has(id))))
      throw new WorkspaceError("Cite only the selected source records for this candidate and role.");
    const assessment = {
      ...item.assessment, source_records: item.source_records,
      scope: "Saved profile, current role requirements and explicitly cited records; an Agent assessment, not client feedback.",
      person_version: person.version, role_version: role.version,
      record_signature: assessmentSignature(records), assessed_at: new Date().toISOString(),
      relationship: {permission: prior?.permission ?? "unknown", interest: prior?.interest ?? "", notes: prior?.notes ?? ""},
    };
    const [link] = await rows<RoleCandidate>(sql`INSERT INTO hirelix_private_role_candidates(user_id,role_id,person_id,assessment,assessed_role_version)
      VALUES(${userId}::uuid,${role.id}::uuid,${person.id}::uuid,${json(assessment)},${role.version})
      ON CONFLICT(user_id,role_id,person_id) DO UPDATE SET assessment=excluded.assessment,assessed_role_version=excluded.assessed_role_version,version=hirelix_private_role_candidates.version+1,updated_at=now() RETURNING *`, tx);
    await snapshot(userId, "role_candidate", link, tx);
    saved.push({...link, name: person.name});
  }
  return {role_id: role.id, title: `${role.client_name} · ${role.title}`, candidates: saved, href: `/app/roles/${role.id}?tab=candidates`};
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
  const records = await sources(job.user_id, person.id, role.id);
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
      sql`SELECT e.record_id,e.content FROM hirelix_private_embeddings e WHERE e.user_id=${job.user_id}::uuid AND e.person_id=${person.id}::uuid AND e.model=${model} AND (e.record_id IS NULL OR e.record_id IN (SELECT id FROM hirelix_private_records WHERE user_id=${job.user_id}::uuid AND (role_id IS NULL OR role_id=${role.id}::uuid))) ORDER BY e.embedding<=>${JSON.stringify(vector)}::vector LIMIT 40`,
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
    `Write all user-facing prose in ${input.locale === "zh" ? "Simplified Chinese" : "English"}, keeping names and technical terms intact. ` + "Evaluate only the supplied (role, candidate) pair. Compare role function, seniority, actual work and must-have evidence, not employer prestige or keyword overlap. Treat omission as unknown, not absence. Compare seniority through documented scope; minimum qualifications do not establish a seniority ladder. Interest or rejection for another role is not a global label. Cite source_refs only from the provided reference catalog: profile or source_N. Use an empty array when describing missing evidence. Never invent a source reference. Distinguish missing evidence from evidence of mismatch. State unconfirmed availability, conditions and sharing permission. The relationship describes only this role. " + ROLE_BRIEF_EVIDENCE_RULES,
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
    record_signature: assessmentSignature(records),
    role_version: role.version,
    assessed_at: new Date().toISOString(),
    relationship: {permission: relationship.permission, interest: relationship.interest, notes: relationship.notes},
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
      const currentRecords = await sources(job.user_id, person.id, role.id, tx);
      const [currentRelationship] = await rows<RoleCandidate>(sql`SELECT * FROM hirelix_private_role_candidates WHERE user_id=${job.user_id}::uuid AND role_id=${role.id}::uuid AND person_id=${person.id}::uuid FOR UPDATE`, tx);
      if (
        currentRole.version !== role.version ||
        currentPerson.version !== person.version ||
        assessmentSignature(currentRecords) !== assessmentSignature(records) ||
        currentRelationship?.version !== relationship.version
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
