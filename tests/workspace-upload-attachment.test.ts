import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { uploadAttachment } from "../src/components/workspace/upload-attachment";
import { UPLOAD_PART_BYTES } from "../src/lib/workspace/attachments";

test("large-file client resumes missing parts without retransmitting received bytes and recovers a completed response", async () => {
  const actual = globalThis.fetch;
  const bytes = Buffer.alloc(UPLOAD_PART_BYTES * 2 + 17, 65);
  const file = new File([bytes], "historical-candidates.zip", { type: "application/zip" });
  let status = 0;
  const uploaded: number[] = [];
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      assert.match(url, /\/files\/uploads\/source-id/);
      if (init?.method === "PUT") {
        const part = Number(new URL(url, "http://localhost").searchParams.get("part"));
        assert.equal((init.body as Blob).size, part === 2 ? 17 : UPLOAD_PART_BYTES);
        assert.equal((init.headers as Record<string,string>)["X-Upload-Filename"], "historical-candidates.zip");
        uploaded.push(part);
        return Response.json({ received_part: part });
      }
      const metadata = JSON.parse(String(init?.body));
      assert.equal(metadata.sha256, createHash("sha256").update(bytes).digest("hex"));
      status++;
      return Response.json({ file: status === 1 ? null : { file_id: "saved", name: file.name, size: file.size }, received_parts: [0] });
    };
    assert.equal((await uploadAttachment("source-id", file)).file_id, "saved");
    assert.deepEqual(uploaded, [1, 2]);
    uploaded.length = 0;
    assert.equal((await uploadAttachment("source-id", file)).file_id, "saved");
    assert.deepEqual(uploaded, []);
  } finally { globalThis.fetch = actual; }
});
