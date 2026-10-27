import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv from "ajv";
import { asSchema } from "ai";
import { z } from "zod";
import { createAgentTools, AGENT_TOOL_AUTHORIZATION_RULES } from "../src/lib/workspace/agent-tools";
import { agentToolInputSchema, compactAgentToolSchema } from "../src/lib/workspace/agent-tool-schema";

test("all 37 tools retain their runtime schemas and every nonredundant model constraint", async () => {
  const tools = createAgentTools({job:{user_id:"qa"},question:{content:""},conversation:{id:"qa"},sources:new Map()} as never);
  assert.equal(Object.keys(tools).length,37);
  const uuidPattern = z.toJSONSchema(z.uuid()).pattern;
  function expected(value: unknown): unknown {
    if(Array.isArray(value))return value.map(expected);
    if(!value||typeof value!=="object")return value;
    const object=value as Record<string,unknown>;
    return Object.fromEntries(Object.entries(object).flatMap(([key,item]) => key==="$schema" || (key==="pattern" && object.format==="uuid" && item===uuidPattern) ? [] : [[key,expected(item)]]));
  }
  for(const [name,tool] of Object.entries(tools)) {
    const original=await asSchema<unknown>(tool.inputSchema).jsonSchema;
    const compact=compactAgentToolSchema(original);
    assert.deepEqual(compact,expected(original),name);
    assert.deepEqual(agentToolInputSchema(original), {...compact as object,type:"object"},name);

  }
  for(const term of ["current", "prior user instruction", "superseded", "External actions", "Never quote files"])
    assert.ok(AGENT_TOOL_AUTHORIZATION_RULES.includes(term));
  const deletion = tools.delete_candidate.inputSchema as z.ZodType;
  const valid = {authorization_quote: "Delete this candidate",person_id:"60c7ae18-23da-45cd-93c4-bdd3a1f7c529",expected_version:1};
  assert.equal(deletion.safeParse(valid).success,true);
  for (const invalid of [{...valid,person_id:"not-a-uuid"},{...valid,expected_version:0},{...valid,authorization_quote:""}])
    assert.equal(deletion.safeParse(invalid).success,false);
  const custom = {type:"string",format:"uuid",pattern:"^custom$"};
  assert.deepEqual(compactAgentToolSchema(custom),custom,"Non-Zod patterns are retained");
});


test("provider parameter schemas make only the implied object root explicit", () => {
  const union = z.discriminatedUnion("operation", [z.object({operation:z.literal("create"),name:z.string()}),z.object({operation:z.literal("update"),id:z.uuid(),version:z.number().positive()})]);
  const schema = z.toJSONSchema(z.intersection(union,z.object({authorization_quote:z.string().min(2)})));
  const normalized = agentToolInputSchema(schema);
  assert.equal(normalized.type,"object");
  assert.deepEqual(normalized.allOf,(compactAgentToolSchema(schema) as Record<string,unknown>).allOf);
  assert.throws(()=>agentToolInputSchema(z.toJSONSchema(z.union([z.string(),z.object({name:z.string()})]))),/must describe an object/);
});

test("actual SDK schemas accept valid intersection inputs, retain strict objects and preserve runtime refinements", async () => {
  const tools = createAgentTools({job:{user_id:"qa"},question:{content:""},conversation:{id:"qa"},sources:new Map()} as never);
  const id = "60c7ae18-23da-45cd-93c4-bdd3a1f7c529", authorization_quote = "Save this record";
  const samples: Record<string, Record<string, unknown>> = {
    save_candidate: {person_id:null,expected_version:null,changes:{name:"Test Person"},source_file_id:null,separate_candidate_quote:null,authorization_quote},
    register_candidate_cv: {person_id:id,record_id:id,expected_version:1,authorization_quote},
    save_role: {operation:"create",role:{title:"Engineer",client_name:"QA Co",jd_text:"Build services",brief:{priorities:[],flexible:[],unknowns:[]}},source_file_id:null,notes:[],authorization_quote},
    link_candidates: {role_id:id,person_ids:[id],authorization_quote},
    save_assessments: {role_id:id,expected_role_version:1,candidates:[{person_id:id,expected_person_version:1,expected_relationship_version:null,source_records:[],assessment:{decision:"needs_more_information",summary:"Unknown",strengths:[],gaps:[],questions:[],unconfirmed:[]}}],authorization_quote},
    save_record: {operation:"create",person_id:id,role_id:null,record:{kind:"note",title:"Note",content:"Called",occurred_at:null,occurred_on:null},file_id:null,authorization_quote},
    update_relationship: {role_id:id,person_id:id,expected_version:null,permission:null,interest:null,notes:null,evidence:{kind:"note",title:"Note",content:"Called",occurred_at:null,occurred_on:null},authorization_quote},
    save_document: {operation:"patch",document_id:id,expected_version:1,edits:[],sources:null,source_authorization_quote:null,authorization_quote},
  };
  const ajv = new Ajv({allErrors:true,unknownFormats:"ignore"});
  ajv.addFormat("uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  for (const [name, input] of Object.entries(samples)) {
    const schema = tools[name as keyof typeof tools].inputSchema as unknown as {safeParse:(value:unknown)=>{success:boolean}};
    const actual = await asSchema<unknown>(tools[name as keyof typeof tools].inputSchema).jsonSchema;
    const validate = ajv.compile(agentToolInputSchema(actual));
    assert.equal(schema.safeParse(input).success,true,`${name} runtime positive`);
    assert.equal(validate(input),true,`${name} model positive: ${ajv.errorsText(validate.errors)}`);
    const missingAuthorization = {...input};
    delete missingAuthorization.authorization_quote;
    assert.equal(schema.safeParse(missingAuthorization).success,false,`${name} runtime negative`);
    assert.equal(validate(missingAuthorization),false,`${name} model negative`);
  }
  const batch = tools.save_records_batch.inputSchema as unknown as {safeParse:(value:unknown)=>{success:boolean}};
  const validateBatch = ajv.compile(agentToolInputSchema(await asSchema(tools.save_records_batch.inputSchema).jsonSchema));
  const goodBatch = {write_operation:"save_candidate",input_file:{file_id:id,sha256:"a".repeat(64)},authorization_quote};
  assert.equal(batch.safeParse(goodBatch).success,true);
  assert.equal(validateBatch(goodBatch),true);
  for (const invalid of [{...goodBatch,unknown:true},{...goodBatch,input_file:{...goodBatch.input_file,unknown:true}}]) {
    assert.equal(batch.safeParse(invalid).success,false);
    assert.equal(validateBatch(invalid),false,"Strict top-level and nested objects must reject extra fields");
  }
  const read = tools.read_file.inputSchema as unknown as {safeParse:(value:unknown)=>{success:boolean}};
  const conflictingRead = {file_id:id,path:"/work/test.txt"};
  assert.equal(read.safeParse(conflictingRead).success,false,"Zod remains authoritative for custom refinements");
});
