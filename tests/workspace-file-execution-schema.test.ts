import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { bashInputSchema, readWorkspaceFileInputSchema, writeFileInputSchema } from "../src/lib/workspace/file-execution";

test("file tool schemas can be sent to the model while rejecting unsafe paths", () => {
  for (const schema of [bashInputSchema, readWorkspaceFileInputSchema, writeFileInputSchema]) assert.doesNotThrow(() => z.toJSONSchema(schema));
  assert.equal(writeFileInputSchema.safeParse({path:"nested/file.txt", content:"ok"}).success, true);
  for (const path of ["../outside", "/etc/passwd", "/work/a/../../x", "/work/link\\x", "/work/a//b"]) {
    assert.equal(readWorkspaceFileInputSchema.safeParse({path}).success, false, path);
  }
});
