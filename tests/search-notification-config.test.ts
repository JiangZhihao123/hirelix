import test from "node:test";
import assert from "node:assert/strict";
import {
  areSearchNotificationsEnabledOnServer,
  getSearchCompletionFollowUpCopy,
} from "../src/lib/search-notification-config";

const mutableEnv = process.env as Record<string, string | undefined>;

test("areSearchNotificationsEnabledOnServer respects the server flag", () => {
  const originalValue = mutableEnv.SEARCH_NOTIFICATIONS_ENABLED;

  mutableEnv.SEARCH_NOTIFICATIONS_ENABLED = "true";
  assert.equal(areSearchNotificationsEnabledOnServer(), true);

  mutableEnv.SEARCH_NOTIFICATIONS_ENABLED = "false";
  assert.equal(areSearchNotificationsEnabledOnServer(), false);

  if (originalValue === undefined) {
    delete mutableEnv.SEARCH_NOTIFICATIONS_ENABLED;
  } else {
    mutableEnv.SEARCH_NOTIFICATIONS_ENABLED = originalValue;
  }
});

test("getSearchCompletionFollowUpCopy only promises email when enabled", () => {
  assert.equal(
    getSearchCompletionFollowUpCopy(true),
    "We'll email you when the shortlist is ready",
  );
  assert.equal(
    getSearchCompletionFollowUpCopy(false),
    "You can leave this page and check back soon",
  );
});
