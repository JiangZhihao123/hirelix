import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCandidateChanges } from "../src/lib/workspace/candidate-changes";
import { personInput } from "../src/lib/workspace/types";
test("candidate patches preserve unspecified profile and contact fields", () => {
  const prior = personInput.parse({name:"Example Person",email:"person@example.test",skills:["Operations"],profile:{summary:"Original summary",education:["Example college"],experience:[{company:"Example",title:"Lead"}]}});
  const next = applyCandidateChanges(prior,{location:"Leeds",work_preferences:"Hybrid"});
  assert.equal(next.location,"Leeds"); assert.equal(next.profile.work_preferences,"Hybrid");
  assert.deepEqual(next.profile.experience,prior.profile.experience);
  assert.deepEqual(next.profile.education,prior.profile.education);
  assert.equal(next.profile.summary,prior.profile.summary);assert.equal(next.email,prior.email);assert.deepEqual(next.skills,prior.skills);
  assert.equal(prior.location,"");
  const cleared=applyCandidateChanges(prior,{email:"",education:[]});
  assert.equal(cleared.email,"");assert.deepEqual(cleared.profile.education,[]);assert.equal(cleared.profile.summary,prior.profile.summary);
  assert.throws(()=>applyCandidateChanges(null,{location:"Leeds"}));
});
