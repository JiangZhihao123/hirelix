/** Identities and paths verified against Recruit CRM's real candidate export. */
export type RecruitCrmCandidateReference = {
  system: "recruitcrm";
  entity: "candidate";
  id: string;
};

function validCandidateId(value: string) {
  return /^[a-zA-Z0-9_-]{1,200}$/.test(value);
}

/** Return an ID only when the row contains one unambiguous official URL. */
export function recruitCrmCandidateReference(raw: Record<string, string>): RecruitCrmCandidateReference | null {
  const ids = new Set<string>();
  for (const value of Object.values(raw)) {
    if (!value.startsWith("https://app.recruitcrm.io/")) continue;
    let url: URL;
    try { url = new URL(value); } catch { continue; }
    if (url.protocol !== "https:" || url.hostname !== "app.recruitcrm.io" || url.username || url.password || url.port) continue;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 3 && ["v1", "v2"].includes(parts[0]) && parts[1] === "candidate" && validCandidateId(parts[2]))
      ids.add(parts[2]);
  }
  return ids.size === 1 ? {system: "recruitcrm", entity: "candidate", id: [...ids][0]} : null;
}

/** Paths are evidence of an association only when matched to an official row URL. */
export function recruitCrmAttachmentPath(path: string): {candidate_id: string; name: string} | null {
  const parts = path.split("/");
  if (parts.length < 3 || parts[0].toLowerCase() !== "candidates" || !validCandidateId(parts[1]) ||
      parts.some(part => !part || part === "." || part === "..") || path.includes("\\")) return null;
  return { candidate_id: parts[1], name: parts.at(-1)! };
}
