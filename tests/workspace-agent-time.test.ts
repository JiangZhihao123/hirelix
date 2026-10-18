import assert from "node:assert/strict";
import { test } from "node:test";
import { localTimeEvidence } from "../src/lib/workspace/agent-time";

test("agent timestamp presentation retains date rollover, zone and source facts", () => {
  const source = {records: [{occurred_at: "2026-10-18T20:20:32Z", occurred_on: "2026-10-18", content: "Reported at 2026-10-18T20:20:32Z"}], date: new Date("2026-10-18T08:20:45Z")};
  const times = localTimeEvidence(source, "Asia/Shanghai");
  assert.equal(times["records[0].occurred_at"], "19/10/2026, 04:20:32 GMT+08:00 (Asia/Shanghai)");
  assert.equal(times.date, "18/10/2026, 16:20:45 GMT+08:00 (Asia/Shanghai)");
  assert.equal(Object.keys(times).length, 2);
  assert.equal(source.records[0].occurred_at, "2026-10-18T20:20:32Z");
});

test("agent timestamp presentation disambiguates repeated DST clock hours", () => {
  const times = localTimeEvidence({a: "2026-11-01T05:30:00Z", b: "2026-11-01T06:30:00Z", invalid: "2026-99-99T08:00:00Z"}, "America/New_York");
  assert.equal(times.a, "01/11/2026, 01:30:00 GMT-04:00 (America/New_York)");
  assert.equal(times.b, "01/11/2026, 01:30:00 GMT-05:00 (America/New_York)");
  assert.equal(Object.keys(times).length, 2);
});
