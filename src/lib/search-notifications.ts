import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { hirelix_search_notifications, hirelix_searches } from "@/db/schema";
import { getLogger } from "@/lib/logger";
import { getEmailByUserId } from "@/lib/user-identity";
import { areSearchNotificationsEnabledOnServer } from "@/lib/search-notification-config";
import { getSearchDisplayTitle } from "@/lib/search-title";

const notificationLogger = getLogger({ component: "search_notifications" });

type SearchNotificationKind = "first_shortlist_ready" | "search_failed";

type SearchNotificationRow = {
  id: string;
  search_id: string;
  user_id: string;
  kind: SearchNotificationKind;
  channel: "email";
  recipient: string;
  status: "queued" | "sent" | "failed" | "skipped";
  payload: Record<string, unknown> | null;
};

type SearchSummary = {
  id: string;
  user_id: string;
  title: string | null;
  jd_text: string;
  created_at: string;
  error_message: string | null;
  parsed_requirements: Record<string, unknown> | null;
};

function nowIso() {
  return new Date().toISOString();
}

function nowDate() {
  return new Date();
}

function isUniqueViolation(error: unknown): boolean {
  // postgres.js attaches the SQLSTATE code as `.code` on thrown errors.
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "23505"
  );
}

function logSearchNotification(eventName: string, payload: Record<string, unknown>) {
  notificationLogger.info({ event: eventName, ...payload });
}

function buildSearchUrl(searchId: string) {
  const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return new URL(`/app/search/${searchId}`, baseUrl).toString();
}

function getSearchNotificationSubject(kind: SearchNotificationKind) {
  return kind === "first_shortlist_ready"
    ? "Your Hirelix shortlist is ready"
    : "Your Hirelix search needs attention";
}

function buildNotificationPayload(search: SearchSummary) {
  const roleTitle = getSearchDisplayTitle({
    title: search.title,
    parsedRequirements: search.parsed_requirements,
    fallback: "Your search",
  });

  return {
    role_title: roleTitle,
    started_at: search.created_at,
    search_url: buildSearchUrl(search.id),
  };
}

function renderNotificationHtml(kind: SearchNotificationKind, payload: Record<string, unknown>) {
  const roleTitle = typeof payload.role_title === "string" ? payload.role_title : "Your search";
  const startedAt = typeof payload.started_at === "string"
    ? new Date(payload.started_at).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    })
    : "recently";
  const searchUrl = typeof payload.search_url === "string" ? payload.search_url : "";
  const intro = kind === "first_shortlist_ready"
    ? `Your shortlist for <strong>${roleTitle}</strong> is ready to review.`
    : `Your search for <strong>${roleTitle}</strong> needs attention before it can continue.`;
  const body = kind === "first_shortlist_ready"
    ? `We started this search on ${startedAt}. Hirelix has ranked the first credible candidates and your shortlist is now ready to review.`
    : `We started this search on ${startedAt}, but it did not finish successfully. The detailed error has been logged for debugging.`;
  const ctaLabel = kind === "first_shortlist_ready" ? "Review shortlist" : "Retry search";

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
      <p>${intro}</p>
      <p>${body}</p>
      <p><a href="${searchUrl}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px">${ctaLabel}</a></p>
      <p style="color:#475569;font-size:14px">You can return to Hirelix at any time to keep working from this search.</p>
    </div>
  `;
}

async function sendViaResend(notification: SearchNotificationRow) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.SEARCH_NOTIFICATIONS_FROM_EMAIL;
  if (!resendApiKey || !from) {
    throw new Error("Email notifications are not configured");
  }

  const payload = notification.payload || {};
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [notification.recipient],
      subject: getSearchNotificationSubject(notification.kind),
      html: renderNotificationHtml(notification.kind, payload),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof data?.message === "string"
        ? data.message
        : `Resend failed with status ${response.status}`;
    throw new Error(message);
  }

  return typeof data?.id === "string" ? data.id : null;
}

async function resolveRecipientEmail(userId: string) {
  return getEmailByUserId(userId);
}

export async function sendSearchNotification(notificationId: string) {
  const rows = await db
    .select({
      id: hirelix_search_notifications.id,
      search_id: hirelix_search_notifications.search_id,
      user_id: hirelix_search_notifications.user_id,
      kind: hirelix_search_notifications.kind,
      channel: hirelix_search_notifications.channel,
      recipient: hirelix_search_notifications.recipient,
      status: hirelix_search_notifications.status,
      payload: hirelix_search_notifications.payload,
    })
    .from(hirelix_search_notifications)
    .where(eq(hirelix_search_notifications.id, notificationId))
    .limit(1);

  const row = rows[0] as SearchNotificationRow | undefined;
  if (!row || row.status !== "queued") return;

  if (!areSearchNotificationsEnabledOnServer()) {
    await db
      .update(hirelix_search_notifications)
      .set({
        status: "skipped",
        last_error: "Notifications disabled",
        updated_at: nowDate(),
      })
      .where(eq(hirelix_search_notifications.id, row.id));
    return;
  }

  try {
    const providerMessageId = await sendViaResend(row);
    await db
      .update(hirelix_search_notifications)
      .set({
        status: "sent",
        provider_message_id: providerMessageId,
        sent_at: nowDate(),
        updated_at: nowDate(),
        last_error: null,
      })
      .where(eq(hirelix_search_notifications.id, row.id));
    logSearchNotification("search_notification_sent", {
      search_id: row.search_id,
      notification_id: row.id,
      kind: row.kind,
      recipient: row.recipient,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(hirelix_search_notifications)
      .set({
        status: "failed",
        last_error: message,
        updated_at: nowDate(),
      })
      .where(eq(hirelix_search_notifications.id, row.id));
    logSearchNotification("search_notification_failed", {
      search_id: row.search_id,
      notification_id: row.id,
      kind: row.kind,
      error: message,
    });
  }
}

export async function queueOrSendSearchNotification(
  searchId: string,
  kind: SearchNotificationKind,
) {
  const searchRows = await db
    .select({
      id: hirelix_searches.id,
      user_id: hirelix_searches.user_id,
      title: hirelix_searches.title,
      jd_text: hirelix_searches.jd_text,
      created_at: hirelix_searches.created_at,
      error_message: hirelix_searches.error_message,
      parsed_requirements: hirelix_searches.parsed_requirements,
    })
    .from(hirelix_searches)
    .where(eq(hirelix_searches.id, searchId))
    .limit(1);

  const searchRowRaw = searchRows[0];
  if (!searchRowRaw) return;
  const searchRow: SearchSummary = {
    id: searchRowRaw.id,
    user_id: searchRowRaw.user_id,
    title: searchRowRaw.title,
    jd_text: searchRowRaw.jd_text,
    created_at: searchRowRaw.created_at ? searchRowRaw.created_at.toISOString() : nowIso(),
    error_message: searchRowRaw.error_message,
    parsed_requirements:
      searchRowRaw.parsed_requirements && typeof searchRowRaw.parsed_requirements === "object"
        ? (searchRowRaw.parsed_requirements as Record<string, unknown>)
        : null,
  };

  const recipient = await resolveRecipientEmail(searchRow.user_id);
  if (!recipient) {
    logSearchNotification("search_notification_failed", {
      search_id: searchId,
      kind,
      error: "Missing recipient email",
    });
    return;
  }

  const existingRows = await db
    .select({ id: hirelix_search_notifications.id })
    .from(hirelix_search_notifications)
    .where(
      and(
        eq(hirelix_search_notifications.search_id, searchId),
        eq(hirelix_search_notifications.kind, kind),
        eq(hirelix_search_notifications.channel, "email"),
      ),
    )
    .limit(1);

  if (existingRows[0]?.id) {
    return;
  }

  const payload = buildNotificationPayload(searchRow);
  let insertedId: string | null = null;
  try {
    const inserted = await db
      .insert(hirelix_search_notifications)
      .values({
        search_id: searchId,
        user_id: searchRow.user_id,
        kind,
        channel: "email",
        recipient,
        status: "queued",
        payload,
        updated_at: nowDate(),
      })
      .returning({ id: hirelix_search_notifications.id });
    insertedId = inserted[0]?.id ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) return;
    throw error;
  }

  if (!insertedId) return;

  logSearchNotification("search_notification_queued", {
    search_id: searchId,
    notification_id: insertedId,
    kind,
    recipient,
  });
  await sendSearchNotification(insertedId);
}
