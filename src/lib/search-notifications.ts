import { supabaseAdmin } from "@/lib/supabase-server";
import { getSearchDisplayTitle } from "@/lib/search-title";

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

function logSearchNotification(eventName: string, payload: Record<string, unknown>) {
  console.log(`[search:${eventName}] ${JSON.stringify(payload)}`);
}

function notificationsEnabled() {
  return ["1", "true", "yes", "on"].includes(
    (process.env.SEARCH_NOTIFICATIONS_ENABLED || "").trim().toLowerCase(),
  );
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
    error_message: search.error_message,
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
  const errorMessage = typeof payload.error_message === "string" ? payload.error_message : "Hirelix could not finish the run.";
  const intro = kind === "first_shortlist_ready"
    ? `Your shortlist for <strong>${roleTitle}</strong> is ready to review.`
    : `Your search for <strong>${roleTitle}</strong> needs attention before it can continue.`;
  const body = kind === "first_shortlist_ready"
    ? `We started this search on ${startedAt}. Hirelix has ranked the first credible candidates and your shortlist is now ready to review.`
    : `We started this search on ${startedAt}, but it did not finish successfully. Error summary: ${errorMessage}`;
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
  const result = await supabaseAdmin.auth.admin.getUserById(userId);
  return result.data.user?.email || null;
}

export async function sendSearchNotification(notificationId: string) {
  const { data: notification } = await supabaseAdmin
    .from("hirelix_search_notifications")
    .select("id, search_id, user_id, kind, channel, recipient, status, payload")
    .eq("id", notificationId)
    .maybeSingle();

  const row = notification as SearchNotificationRow | null;
  if (!row || row.status !== "queued") return;

  if (!notificationsEnabled()) {
    await supabaseAdmin
      .from("hirelix_search_notifications")
      .update({
        status: "skipped",
        last_error: "Notifications disabled",
        updated_at: nowIso(),
      })
      .eq("id", row.id);
    return;
  }

  try {
    const providerMessageId = await sendViaResend(row);
    await supabaseAdmin
      .from("hirelix_search_notifications")
      .update({
        status: "sent",
        provider_message_id: providerMessageId,
        sent_at: nowIso(),
        updated_at: nowIso(),
        last_error: null,
      })
      .eq("id", row.id);
    logSearchNotification("search_notification_sent", {
      search_id: row.search_id,
      notification_id: row.id,
      kind: row.kind,
      recipient: row.recipient,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabaseAdmin
      .from("hirelix_search_notifications")
      .update({
        status: "failed",
        last_error: message,
        updated_at: nowIso(),
      })
      .eq("id", row.id);
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
  const { data: search } = await supabaseAdmin
    .from("hirelix_searches")
    .select("id, user_id, title, jd_text, created_at, error_message, parsed_requirements")
    .eq("id", searchId)
    .maybeSingle();

  const searchRow = search as SearchSummary | null;
  if (!searchRow) return;

  const recipient = await resolveRecipientEmail(searchRow.user_id);
  if (!recipient) {
    logSearchNotification("search_notification_failed", {
      search_id: searchId,
      kind,
      error: "Missing recipient email",
    });
    return;
  }

  const { data: existing } = await supabaseAdmin
    .from("hirelix_search_notifications")
    .select("id, status")
    .eq("search_id", searchId)
    .eq("kind", kind)
    .eq("channel", "email")
    .maybeSingle();

  if (existing?.id) {
    return;
  }

  const payload = buildNotificationPayload(searchRow);
  const { data: inserted, error } = await supabaseAdmin
    .from("hirelix_search_notifications")
    .insert({
      search_id: searchId,
      user_id: searchRow.user_id,
      kind,
      channel: "email",
      recipient,
      status: "queued",
      payload,
      updated_at: nowIso(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return;
    throw error;
  }

  if (!inserted?.id) return;

  logSearchNotification("search_notification_queued", {
    search_id: searchId,
    notification_id: inserted.id,
    kind,
    recipient,
  });
  await sendSearchNotification(inserted.id);
}
