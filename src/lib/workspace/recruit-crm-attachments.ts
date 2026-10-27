import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { agentCreditContext } from "@/lib/agent-credit-context";
import { archivedMediaType, readDocument } from "./document-reader";
import { owned, rows, WorkspaceError, type Runner } from "./database";
import { saveImportedFile } from "./files";
import { addRecord } from "./records";
import type { Job } from "./types";

export type RecruitCrmAttachment = {
  archive_file_id: string;
  path: string;
  name: string;
  candidate_id: string;
  bytes: Uint8Array;
  sha256: string;
  media_type: string;
  text: string;
  extraction: "extracted" | "empty" | "unsupported" | "unreadable" | "too_large";
};

/** Preserve unknown attachments even when text cannot be extracted. */
export async function prepareRecruitCrmAttachment(input: {archive_file_id:string;path:string;name:string;candidate_id:string;bytes:Uint8Array}): Promise<RecruitCrmAttachment> {
  const media_type = archivedMediaType(input.bytes);
  const common = {...input, media_type, sha256:createHash("sha256").update(input.bytes).digest("hex")};
  if (media_type !== "application/pdf") return {...common,text:"",extraction:"unsupported"};
  try {
    // Text-only extraction does not run OCR or call a model for every file.
    const source = await readDocument({name:input.name,bytes:input.bytes,media_type}, 0, false);
    if (source.text.length > 500000) return {...common,text:"",extraction:"too_large"};
    const body = source.text.replace(/^Page \d+:\s*$/gm, "").trim();
    return {...common,text:body ? source.text : "",extraction:body ? "extracted" : "empty"};
  } catch (error) {
    const signal = agentCreditContext.getStore()?.signal;
    if (signal?.aborted) throw signal.reason;
    // Corrupt or password-protected user files are still preserved; runtime or
    // configuration failures must not be hidden as an unreadable document.
    if (error instanceof WorkspaceError || error instanceof Error && ["InvalidPDFException", "PasswordException", "MissingPDFException"].includes(error.name))
      return {...common,text:"",extraction:"unreadable"};
    throw error;
  }
}

/** Associate only exact exported IDs belonging to this user; never match names. */
export async function saveRecruitCrmAttachments(job: Pick<Job, "id" | "user_id" | "payload">, files: RecruitCrmAttachment[], tx: Runner) {
  if (!files.length) return {found:0,linked:0,reused:0,unmatched:0,ambiguous:0,files:[]};
  if (job.payload.save_new_candidates !== true) throw new WorkspaceError("Ask the assistant to import these files in the conversation before saving them.", 403);
  for (const id of new Set(files.map(file => file.archive_file_id))) await owned(job.user_id, "file", id, tx);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${"candidate-intake:" + job.user_id},0))`);
  const ids = [...new Set(files.map(file => file.candidate_id))];
  const references = await rows<{person_id:string;source_id:string}>(sql`SELECT DISTINCT person_id,details->'external_reference'->>'id' AS source_id
    FROM hirelix_private_records WHERE user_id=${job.user_id}::uuid AND person_id IS NOT NULL AND kind='profile'
      AND details->'external_reference'->>'system'='recruitcrm' AND details->'external_reference'->>'entity'='candidate'
      AND details->'external_reference'->>'id' IN (${sql.join(ids.map(id => sql`${id}`),sql`, `)})`, tx);
  const matches = new Map<string, Set<string>>();
  for (const reference of references) {
    const people = matches.get(reference.source_id) || new Set<string>();
    people.add(reference.person_id); matches.set(reference.source_id, people);
  }
  const output: Array<{archive_file_id:string;path:string;candidate_id:string;status:"linked"|"reused"|"unmatched"|"ambiguous";person_id?:string;record_id?:string;file_id?:string;extraction:RecruitCrmAttachment["extraction"]}> = [];
  for (const file of files) {
    const people = [...(matches.get(file.candidate_id) || [])];
    const common = {archive_file_id:file.archive_file_id,path:file.path,candidate_id:file.candidate_id,extraction:file.extraction};
    if (people.length !== 1) {
      output.push({...common,status:people.length ? "ambiguous" : "unmatched"});
      continue;
    }
    const personId = people[0];
    const [existing] = await rows<{id:string;file_id:string}>(sql`SELECT id,file_id FROM hirelix_private_records WHERE user_id=${job.user_id}::uuid AND person_id=${personId}::uuid AND kind IN ('attachment','cv')
      AND details->>'source_system'='recruitcrm' AND details->>'source_candidate_id'=${file.candidate_id}
      AND details->>'source_archive_path'=${file.path} AND details->>'source_sha256'=${file.sha256} LIMIT 1`, tx);
    if (existing) {
      output.push({...common,status:"reused",person_id:personId,record_id:existing.id,file_id:existing.file_id});
      continue;
    }
    const saved = await saveImportedFile(job.user_id, {name:file.name,type:file.media_type,bytes:file.bytes}, tx);
    const record = await addRecord(job.user_id, {person_id:personId,file_id:saved.id,kind:"attachment",
      title:`Imported attachment · ${saved.name}`,content:file.text,details:{
        import_job_id:job.id,source_system:"recruitcrm",source_candidate_id:file.candidate_id,
        source_archive_file_id:file.archive_file_id,source_archive_path:file.path,source_sha256:file.sha256,extraction:file.extraction,
        ...(typeof job.payload.source_message_id === "string" ? {source_message_id: job.payload.source_message_id} : {}),
      }}, tx);
    output.push({...common,status:"linked",person_id:personId,record_id:record.id,file_id:saved.id});
  }
  return {found:files.length, linked:output.filter(item=>item.status==="linked").length,
    reused:output.filter(item=>item.status==="reused").length, unmatched:output.filter(item=>item.status==="unmatched").length,
    ambiguous:output.filter(item=>item.status==="ambiguous").length, files:output};
}
