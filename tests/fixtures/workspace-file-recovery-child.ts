import { executeBash, writeWorkspaceFile } from "../../src/lib/workspace/file-execution";

const ctx = {
  userId: process.env.QA_USER!, conversationId: process.env.QA_CONVERSATION!,
  jobId: process.env.QA_JOB!, leaseKey: process.env.QA_LEASE!,
  commit: async () => { throw new Error("The interrupted command must not commit"); },
};
async function main() {
  await writeWorkspaceFile(ctx, {path: "interrupted.txt", content: "temporary"});
  process.stdout.write("workspace-ready\n");
  await executeBash(ctx, {command: "sleep 60"});
}
void main();
