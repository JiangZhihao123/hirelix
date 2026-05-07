/**
 * Helpers for resolving "given a Hirelix user_id, what is their email/name".
 *
 * Reads directly from the better-auth `user` table (the single source of
 * truth for identity since we removed Zitadel + Supabase Auth). Kept as a
 * separate module so callers don't need to know whether the underlying
 * provider is better-auth, Zitadel, Clerk, etc.
 */

import { inArray, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { user } from "@/db/schema";

export async function getEmailByUserId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.email ?? null;
}

/**
 * Batch lookup: { userId -> email } for the given list. Missing users are
 * simply omitted from the returned map.
 */
export async function getEmailsByUserIds(
  userIds: string[],
): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const rows = await db
    .select({ user_id: user.id, email: user.email })
    .from(user)
    .where(inArray(user.id, userIds));

  const out: Record<string, string> = {};
  for (const row of rows) {
    if (row.email) out[row.user_id] = row.email;
  }
  return out;
}
