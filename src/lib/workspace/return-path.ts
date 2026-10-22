// Settings/checkout may return only to a known local workspace surface.
export function workspaceReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/app") || /[\\\r\n]/.test(value)) return null;
  try {
    const url = new URL(value, "https://workspace.invalid");
    if (url.origin !== "https://workspace.invalid" || !/^\/app(?:\/(?:candidates|roles\/[a-f0-9-]{36}|submissions\/[a-f0-9-]{36}))?$/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}

export function billingSettingsHref(returnTo: string) {
  const path = workspaceReturnPath(returnTo);
  const query = new URLSearchParams({section: "billing"});
  if (path) {
    query.set("returnTo", path);
    const plan = new URL(path, "https://workspace.invalid").searchParams.get("plan");
    if (plan === "agent_monthly" || plan === "agent_annual") query.set("plan", plan);
  }
  return `/app/settings?${query.toString()}`;
}

export function checkoutReturnUrl(origin: string, returnTo: string | null) {
  const url = new URL("/app/settings?section=billing&checkout=pending", origin);
  const path = workspaceReturnPath(returnTo);
  if (path) url.searchParams.set("returnTo", path);
  return url.toString();
}
