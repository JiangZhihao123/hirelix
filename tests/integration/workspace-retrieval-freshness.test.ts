// Real PostgreSQL retrieval/ownership/version checks; embedding boundary mocked.
// Run only on a NEW schema-only local QA database, without a worker or dotenv.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, mock, test } from "node:test";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.equal(database.hostname, "127.0.0.1");
assert.match(database.pathname, /^\/hirelix_workspace_qa_isolated_[a-z0-9_]+$/);
assert.equal(process.env.RETRIEVAL_FRESHNESS_FIXTURE, database.pathname.slice(1));
let calls = 0;
const vector = [1, ...Array<number>(1535).fill(0)];
const ready = (async () => {
  mock.module("../../src/lib/candidate-index/embedding.ts", { namedExports: {
    getEmbeddingConfig: () => ({model:"fixture-embedding",dimensions:1536}),
    generateEmbeddings: async (texts: string[]) => {
      calls++;
      return {embeddings:texts.map(() => vector),model:"fixture-embedding",dimensions:1536,inputTokens:0};
    },
  } });
  return {
    ...await import("../../src/lib/workspace/retrieval"),
    ...await import("../../src/lib/workspace/role-retrieval"),
    ...await import("../../src/lib/workspace/people"),
    ...await import("../../src/lib/workspace/roles"),
    ...await import("../../src/lib/workspace/database"),
    ...await import("../../src/db/client"),
  };
})();
after(async () => { await (await ready).closeDb(); mock.restoreAll(); });

test("candidate retrieval excludes other owners and stale evidence, reports partial coverage and handles deletion", async () => {
  const s = await ready, owner = randomUUID(), other = randomUUID();
  const person = await s.createPerson(owner,{name:"Fictional local retrieval candidate",location:"London",headline:"Original evidence"});
  const foreign = await s.createPerson(other,{name:"Other owner fixture"});
  const index = async (userId: string, id: string) => {
    const job = await s.enqueue(userId,"index",randomUUID(),{person_id:id});
    const result = await s.indexCandidate(job,async () => {});
    await s.db.transaction(async tx => { await result.apply?.(tx); });
  };
  await index(owner,person.id);
  await index(other,foreign.id);
  const pending = await s.createPerson(owner,{name:"Unindexed local fixture"});
  let found = await s.retrieveCandidates(owner,{query:"professional evidence"});
  assert.equal(found.coverage.total,2);
  assert.equal(found.coverage.indexed,1);
  assert.deepEqual(found.matches.map(item => item.person_id),[person.id]);
  assert.ok(found.matches[0].source_href.includes(person.id));
  assert.match(found.scope!,/not a role assessment/);
  assert.equal((await s.retrieveCandidates(owner,{query:"evidence",location:"%"})).matches.length,0,"Location wildcard is literal");
  const updated = await s.updatePerson(owner,person.id,{...person,headline:"Updated evidence only"},person.version);
  const before = calls;
  await assert.rejects(s.retrieveCandidates(owner,{query:"original evidence"}), /not been indexed/);
  assert.equal(calls,before,"No provider call when all owned evidence is stale");
  await index(owner,updated.id);
  found = await s.retrieveCandidates(owner,{query:"updated evidence"});
  assert.match(found.matches[0].content,/Updated evidence only/);
  assert.doesNotMatch(found.matches[0].content,/Original evidence/);
  await s.deletePerson(owner,person.id,updated.version);
  await s.deletePerson(owner,pending.id,pending.version);
  const noPeople = await s.retrieveCandidates(owner,{query:"evidence"});
  assert.equal(noPeople.coverage.total,0);
  assert.deepEqual(noPeople.matches,[]);
});

test("JD retrieval rejects stale versions and never returns another owner's role", async () => {
  const s = await ready, owner = randomUUID(), other = randomUUID();
  const role = await s.createRole(owner,{title:"Fictional local role",client_name:"QA",jd_text:"Original job evidence"});
  const foreign = await s.createRole(other,{title:"Foreign local role",client_name:"Other QA",jd_text:"Same job evidence"});
  const index = async (userId: string, id: string) => {
    const job = await s.enqueue(userId,"index",randomUUID(),{role_id:id});
    const result = await s.indexRole(job,async () => {});
    await s.db.transaction(async tx => { await result.apply?.(tx); });
  };
  await index(owner,role.id);
  await index(other,foreign.id);
  assert.deepEqual((await s.retrieveRoles(owner,"job evidence")).roles.map(item => item.id),[role.id]);
  const updated = await s.updateRole(owner,role.id,{...role,jd_text:"Updated job evidence"},role.version);
  const before = calls;
  await assert.rejects(s.retrieveRoles(owner,"original evidence"), /still being indexed/);
  assert.equal(calls,before);
  await index(owner,updated.id);
  const found = await s.retrieveRoles(owner,"updated evidence");
  assert.equal(found.coverage.indexed,1);
  assert.equal(found.roles[0].jd_text,"Updated job evidence");
});
