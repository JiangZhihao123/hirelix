import test from "node:test";
import assert from "node:assert/strict";

import { formatBrightDataSnapshotFailure } from "../src/lib/brightdata";

test("formatBrightDataSnapshotFailure surfaces provider error text", () => {
  assert.equal(
    formatBrightDataSnapshotFailure("snap_123", {
      error: "NOT_ENOUGH_FUNDS",
      error_code: "104",
    }),
    "Bright Data snapshot snap_123 failed (error=NOT_ENOUGH_FUNDS, error_code=104)",
  );
});
