import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { closeDb } from "../../src/db/client";
import { recoverFileWorkspaces } from "../../src/lib/workspace/file-execution";

const database = new URL(process.env.DATABASE_URL || "postgres://invalid/invalid");
assert.ok(["localhost","127.0.0.1"].includes(database.hostname) && database.port !== "15432" && database.pathname.startsWith("/hirelix_workspace_qa_coldstart_missing_"));
const name = `hirelix-recovery-unavailable-${randomUUID()}`;
const docker = (...args:string[]) => execFileSync("docker",args,{encoding:"utf8"}).trim();
after(async()=>{await closeDb();});

test("database failure leaves Docker resources untouched", async()=>{
  docker("create","--pull=never","--name",name,"--label","hirelix.agent.managed=workspace-v1","--label",`hirelix.agent.scope=${randomUUID().replaceAll("-","")}`,"hirelix-agent-sandbox:1","sleep","infinity");
  try {
    await assert.rejects(()=>recoverFileWorkspaces());
    assert.ok(docker("inspect","--format","{{.Id}}",name));
  } finally {docker("rm","-f",name);}
});
