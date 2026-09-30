import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

for (const stopped of ["postgresql", "hirelix-scheduler"]) {
  test(`operational health fails when ${stopped} is stopped and the other service is active`, () => {
    const directory = mkdtempSync(join(tmpdir(), "hirelix-health-"));
    try {
      // systemctl is-active succeeds if ANY requested unit is active.
      writeFileSync(join(directory, "systemctl"), `#!/bin/sh
result=3
for argument in "$@"; do
  case "$argument" in
    postgresql|hirelix-scheduler)
      if [ "$argument" != "$QA_STOPPED_SERVICE" ]; then result=0; fi
      ;;
  esac
done
exit "$result"
`, { mode: 0o755 });
      const result = spawnSync("bash", [resolve("deploy/hirelix-health.sh")], {
        env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, QA_STOPPED_SERVICE: stopped },
        encoding: "utf8",
      });
      assert.equal(result.status, 3, result.stderr);
      assert.equal(result.stdout.includes("checks passed"), false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
