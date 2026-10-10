import { getEngagementThreshold, hasReachedEngagementThreshold } from "@/lib/growth-engagement";

export const ALLOWED_LANDING_EVENTS = new Set([
  "page_view",
  "personal_agent_cta_click",
  "session_summary",
  "engaged_10s",
  "engaged_30s",
  "engaged_60s",
  "engaged_180s",
  "section_view",
  "hero_input_start",
  "hero_submit_attempt",
  "try_for_free_click",
  "sample_view",
  "signin_view",
  "google_signin_click",
  "password_signin",
  "signup_success",
  "new_search_view",
  "sourcing_brief_generated",
  "search_create_success",
  "search_create_failed",
  "pricing_plan_select",
  "preview_request_click",
  "preview_request_submit",
  "book_feedback_click",
  "reply_email_click",
  "invite_activate_click",
  "email_otp_requested",
  "email_otp_verified",
  "search_processing_view",
  "search_results_view",
  "results_summary_view",
  "search_done",
  "candidate_expand",
  "upgrade_cta_click",
  "upgrade_value_exposed",
  "results_unlock_cta_viewed",
  "results_unlock_cta_clicked",
  "contact_unlock_gate_view",
  "client_brief_gate_view",
  "checkout_start",
  "checkout_success",
  "checkout_error",
  "retry_search_click",
  "plan_status_card_click",
]);

type LandingEventDecision =
  | {
      action: "record";
      eventType: string;
      metadata: Record<string, unknown>;
    }
  | {
      action: "ignore";
      eventType: string | null;
      reason: "invalid_event_type" | "invalid_engagement_duration" | "ops_page";
    }
  | {
      action: "reject";
      error: string;
      reason: "invalid_preview_request";
      status: 400;
    };

function textValue(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function isValidEmail(value: string | null) {
  return Boolean(value && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value));
}

function getMetadataText(metadata: Record<string, unknown>, key: string, maxLength = 500) {
  return textValue(metadata[key], maxLength);
}

function isOpsPage(value: string | null) {
  if (!value) return false;
  try {
    return new URL(value).pathname.startsWith("/ops/");
  } catch {
    return value.includes("/ops/");
  }
}

export function validateLandingEventForRecording(params: {
  eventType: string | null;
  metadata: Record<string, unknown>;
  pageUrl: string | null;
}): LandingEventDecision {
  if (!params.eventType || !ALLOWED_LANDING_EVENTS.has(params.eventType)) {
    return {
      action: "ignore",
      eventType: params.eventType,
      reason: "invalid_event_type",
    };
  }

  if (isOpsPage(params.pageUrl) || isOpsPage(getMetadataText(params.metadata, "route", 120))) {
    return {
      action: "ignore",
      eventType: params.eventType,
      reason: "ops_page",
    };
  }

  const engagementThreshold = getEngagementThreshold(params.eventType);
  if (
    engagementThreshold !== null &&
    !hasReachedEngagementThreshold({
      eventType: params.eventType,
      activeReadSeconds: Number(params.metadata.active_read_seconds) || 0,
      pageStaySeconds: Number(params.metadata.page_stay_seconds) || 0,
    })
  ) {
    return {
      action: "ignore",
      eventType: params.eventType,
      reason: "invalid_engagement_duration",
    };
  }

  if (params.eventType === "preview_request_submit") {
    const replyEmail = getMetadataText(params.metadata, "reply_email", 160);
    const rolePreview = getMetadataText(params.metadata, "role_preview", 500);
    if (!isValidEmail(replyEmail) || !rolePreview || rolePreview.length < 12) {
      return {
        action: "reject",
        error: "Invalid preview request",
        reason: "invalid_preview_request",
        status: 400,
      };
    }
    return {
      action: "record",
      eventType: params.eventType,
      metadata: {
        ...params.metadata,
        reply_email: replyEmail,
        role_preview: rolePreview,
        role_length: rolePreview.length,
      },
    };
  }

  return {
    action: "record",
    eventType: params.eventType,
    metadata: params.metadata,
  };
}

