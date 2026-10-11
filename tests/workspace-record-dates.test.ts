import assert from "node:assert/strict";
import {test} from "node:test";
import {recordLocalDate, recordWithinPeriod} from "../src/lib/workspace/record-dates";

test("weekly reports include known calendar dates without inventing event times", () => {
  const start = "2026-10-04T23:00:00Z", end = "2026-10-09T22:59:59Z";
  for (const day of ["2026-10-05", "2026-10-09"]) {
    const record = {occurred_at: null, details: {occurred_on: day}};
    assert.equal(recordWithinPeriod(record, start, end, "Europe/London"), true);
    assert.equal(recordLocalDate(record, "Europe/London"), day);
    assert.equal(record.occurred_at, null);
  }
  for (const day of [null, "2026-10-04", "2026-10-10", "2026-02-30", "not a date"])
    assert.equal(recordWithinPeriod({occurred_at: null, details: {occurred_on: day}}, start, end, "Europe/London"), false);
  const timed = {occurred_at: "2026-10-04T23:30:00Z", details: {occurred_on: "2026-10-04"}};
  assert.equal(recordLocalDate(timed, "Europe/London"), "2026-10-05");
  assert.equal(recordWithinPeriod(timed, start, end, "Europe/London"), true);
});
