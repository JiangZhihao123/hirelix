function isTruthyFlag(value: string | undefined | null) {
  return ["1", "true", "yes", "on"].includes((value || "").trim().toLowerCase());
}

export function areSearchNotificationsEnabledOnServer() {
  return isTruthyFlag(process.env.SEARCH_NOTIFICATIONS_ENABLED);
}

export function areSearchNotificationsPromisedInClient() {
  return isTruthyFlag(process.env.NEXT_PUBLIC_SEARCH_NOTIFICATIONS_ENABLED);
}

export function getSearchCompletionFollowUpCopy(emailEnabled: boolean) {
  return emailEnabled
    ? "We'll email you when the shortlist is ready"
    : "You can leave this page and check back soon";
}
