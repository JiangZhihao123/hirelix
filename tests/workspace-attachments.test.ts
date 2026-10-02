import assert from "node:assert/strict";
import { test } from "node:test";
import { attachmentError, messageAttachments, messageImportJobs, MAX_ATTACHMENT_BYTES } from "../src/lib/workspace/attachments";
const id = "df68f77d-a043-4751-9c30-8a30e04be9b3";
test("file constraints reject empty, oversized and unsupported files without rejecting valid siblings", () => {
  assert.equal(attachmentError("notes.MD", 4), null);
  assert.equal(attachmentError("cv.pdf", MAX_ATTACHMENT_BYTES), null);
  assert.ok(attachmentError("cv.pdf", MAX_ATTACHMENT_BYTES + 1));
  assert.ok(attachmentError("empty.txt", 0));
  assert.ok(attachmentError("file.exe", 100));
});
test("message files retain original identities and ignore malformed metadata", () => {
  const file = { file_id: id, name: "cv.txt", size: 7 };
  assert.deepEqual(messageAttachments({ attachments: [file, { file_id: "bad" }] }), [file]);
  assert.deepEqual(messageAttachments({ attachment: file }), [file]);
  assert.deepEqual(messageImportJobs({ import_job_ids: [id, id, "invalid", null] }), [id]);
  assert.deepEqual(messageImportJobs({ import_job_id: id }), [id]);
});
