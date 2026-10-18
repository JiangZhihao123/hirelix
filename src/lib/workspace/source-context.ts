import { z } from "zod";

export const viewedSourceInput = z.object({
  kind: z.enum(["person", "role", "record", "deliverable", "file"]),
  id: z.uuid(),
});
export type ViewedSource = z.infer<typeof viewedSourceInput>;

// Recognize only the routes the workspace's source panel can actually display.
// The server separately checks ownership before accepting a selection.
export function viewedSourceFromHref(href: string): ViewedSource | null {
  let url: URL;
  try {
    url = new URL(href, "https://hirelix.online");
  } catch {
    return null;
  }
  if (url.origin !== "https://hirelix.online") return null;
  const documentId = url.pathname.match(
    /^\/app\/(?:submissions|roles\/[a-f0-9-]+\/updates)\/([a-f0-9-]+)$/,
  )?.[1];
  const roleId = url.pathname.match(/^\/app\/roles\/([a-f0-9-]+)$/)?.[1];
  const fileId = url.pathname.match(
    /^\/api\/workspace\/files\/([a-f0-9-]+)$/,
  )?.[1];
  const personId =
    url.pathname === "/app/candidates" ? url.searchParams.get("person") : null;
  const recordId = (roleId || personId) && url.searchParams.get("record");
  const parsed = viewedSourceInput.safeParse(
    recordId
      ? { kind: "record", id: recordId }
      : documentId
        ? { kind: "deliverable", id: documentId }
        : roleId
          ? { kind: "role", id: roleId }
          : personId
            ? { kind: "person", id: personId }
            : fileId
              ? { kind: "file", id: fileId }
              : null,
  );
  return parsed.success ? parsed.data : null;
}


// A generated host is not authoritative. Resolve only an exact tool-provided
// internal resource path; unrelated external URLs and unknown IDs stay intact.
export function resolveWorkspaceHref(href: string, sourceLinks: readonly string[]) {
  if (!/^https?:\/\//i.test(href)) return href;
  let url: URL;
  try { url = new URL(href); } catch { return href; }
  const path = `${url.pathname}${url.search}`;
  const source = sourceLinks.find(link => link === path && link.startsWith("/") && (viewedSourceFromHref(link) || /^\/recommendation\/[a-f0-9-]{36}\.[\w-]{43}$/.test(link)));
  return source ? `${source}${url.hash}` : href;
}
