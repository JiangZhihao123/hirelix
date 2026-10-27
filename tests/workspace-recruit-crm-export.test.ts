import assert from "node:assert/strict";
import { test } from "node:test";
import { recruitCrmAttachmentPath, recruitCrmCandidateReference } from "../src/lib/workspace/recruit-crm-export";
import { archivedMediaType } from "../src/lib/workspace/document-reader";

test("source IDs require one exact Recruit CRM candidate URL", () => {
  const first = "https://app.recruitcrm.io/v1/candidate/fixture_123";
  assert.deepEqual(recruitCrmCandidateReference({resource: first, id: "1"}), {system: "recruitcrm", entity: "candidate", id: "fixture_123"});
  assert.equal(recruitCrmCandidateReference({resource: first, second: "https://app.recruitcrm.io/v2/candidate/other"}), null);
  for (const value of ["https://example.org/v1/candidate/fixture_123", "https://app.recruitcrm.io.evil.example/v1/candidate/fixture_123", "https://app.recruitcrm.io/v1/contact/fixture_123", "https://user:secret@app.recruitcrm.io/v1/candidate/fixture_123"])
    assert.equal(recruitCrmCandidateReference({resource: value}), null);
});

test("candidate archive paths and extensionless PDF bytes are preserved without guessing other files", () => {
  assert.deepEqual(recruitCrmAttachmentPath("Candidates/fixture_123/0_no_name_"), {candidate_id:"fixture_123", name:"0_no_name_"});
  for (const path of ["Contacts/fixture_123/file.pdf", "Candidates/../file.pdf", "Candidates/fixture_123/../x", "Candidates/fixture_123/file\\x"])
    assert.equal(recruitCrmAttachmentPath(path), null);
  assert.equal(archivedMediaType(Buffer.from("%PDF-1.4\n")), "application/pdf");
  assert.equal(archivedMediaType(Buffer.from("arbitrary bytes")), "application/octet-stream");
});
