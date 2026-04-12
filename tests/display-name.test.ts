import test from "node:test";
import assert from "node:assert/strict";
import {
  getDisplayNameColorSeed,
  getDisplayNameInitials,
  sanitizeDisplayName,
} from "../src/lib/display-name";

test("sanitizeDisplayName removes replacement characters and decorative prefixes", () => {
  assert.equal(
    sanitizeDisplayName("👨‍💻Radhakrishnan R Mukkai"),
    "Radhakrishnan R Mukkai",
  );
  assert.equal(
    sanitizeDisplayName("�Paul Collins,"),
    "Paul Collins",
  );
});

test("getDisplayNameInitials stays stable for emoji-prefixed names", () => {
  assert.equal(
    getDisplayNameInitials("👨‍💻Radhakrishnan R Mukkai"),
    "RR",
  );
});

test("display-name helpers preserve non-latin names", () => {
  assert.equal(sanitizeDisplayName("李 雷"), "李 雷");
  assert.equal(getDisplayNameInitials("李 雷"), "李雷");
  assert.ok(getDisplayNameColorSeed("李 雷") > 0);
});
