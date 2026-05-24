export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | undefined, rawAdminEmails: string | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails(rawAdminEmails).includes(email.toLowerCase());
}
