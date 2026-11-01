/** Admin is served on the canonical production origin, regardless of proxy URL.
 * Never derive the trusted origin from Host / Forwarded / X-Forwarded-* headers.
 */
export function adminOriginAllowed(req: Request, production: boolean) {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null" || req.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const target = new URL(req.url);
    if (production) return origin === "https://hirelix.online";
    // Development retains exact same-origin matching; non-HTTP origins are invalid.
    return (target.protocol === "http:" || target.protocol === "https:") && origin === target.origin;
  } catch {
    return false;
  }
}
