import { and, eq, or, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";

import { db } from "@/db/client";
import { hirelix_beta_invite_events, hirelix_beta_invites } from "@/db/schema";

export type BetaInviteStatus =
  | "reserved"
  | "clicked"
  | "activated"
  | "used"
  | "expired"
  | "revoked";

export type BetaInviteSource = "cold_email" | "referral" | "manual";

export type BetaInviteEventType =
  | "invite_opened"
  | "invite_scan_detected"
  | "invite_activated"
  | "invite_search_created"
  | "referral_invite_created";

export type BetaInviteRecord = typeof hirelix_beta_invites.$inferSelect;

export type InviteRequestMeta = {
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
};

export const BETA_INVITE_COOKIE = "hirelix_invite_code";
export const DEFAULT_BETA_SEAT_LIMIT = 100;
export const DEFAULT_FREE_SEARCH_LIMIT = 1;
export const DEFAULT_REFERRAL_LIMIT = 3;
export const DEFAULT_INVITE_EXPIRY_DAYS = 14;

const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz";
const BOT_USER_AGENT_PATTERN =
  /bot|crawler|spider|preview|monitor|headless|curl|python|wget|virustotal|appengine-google|go-http-client|urlscan|googleimageproxy|proofpoint|mimecast|barracuda|mandrill|sendgrid|mailchimp|linkexpand|slackbot|twitterbot|facebookexternalhit|linkedinbot|discordbot/i;

export function generateInviteCode(length = 18) {
  const bytes = randomBytes(length);
  let code = "";
  for (const byte of bytes) {
    code += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
  }
  return code;
}

export function getRequestMeta(req: NextRequest): InviteRequestMeta {
  return {
    ipAddress: getIpAddress(req),
    userAgent: getHeader(req, "user-agent"),
    referer: getHeader(req, "referer"),
  };
}

export function isInviteUnavailable(invite: Pick<BetaInviteRecord, "status" | "expires_at">, now = new Date()) {
  if (invite.status === "revoked") return "revoked";
  if (invite.status === "expired") return "expired";
  if (invite.expires_at && invite.expires_at <= now) return "expired";
  return null;
}

export function isLikelyInviteScanner(params: {
  ipAddress?: string | null;
  userAgent?: string | null;
  hasInteraction?: boolean;
}) {
  if (params.hasInteraction) return false;
  if (params.userAgent && BOT_USER_AGENT_PATTERN.test(params.userAgent)) return true;
  return isCloudOrSecurityIp(params.ipAddress);
}

export function isCloudOrSecurityIp(ipAddress: string | null | undefined) {
  if (!ipAddress) return false;
  return (
    isIpv4InCidr(ipAddress, "34.64.0.0", 10) ||
    isIpv4InCidr(ipAddress, "72.144.0.0", 14) ||
    isIpv4InCidr(ipAddress, "172.186.0.0", 16) ||
    isIpv4InCidr(ipAddress, "135.232.0.0", 16)
  );
}

export async function getInviteByCode(inviteCode: string) {
  const rows = await db
    .select()
    .from(hirelix_beta_invites)
    .where(eq(hirelix_beta_invites.invite_code, inviteCode))
    .limit(1);
  return rows[0] ?? null;
}

export async function markInviteClicked(inviteCode: string, now = new Date()) {
  const rows = await db
    .update(hirelix_beta_invites)
    .set({
      status: "clicked",
      clicked_at: now,
      updated_at: now,
    })
    .where(
      and(
        eq(hirelix_beta_invites.invite_code, inviteCode),
        eq(hirelix_beta_invites.status, "reserved"),
      ),
    )
    .returning();
  return rows[0] ?? null;
}

export async function createBetaInvite(params: {
  recipientEmail?: string | null;
  firstName?: string | null;
  company?: string | null;
  source?: BetaInviteSource;
  invitedByUserId?: string | null;
  batchId?: string | null;
  campaign?: string | null;
  seatNumber?: number | null;
  freeSearchLimit?: number;
  referralLimit?: number;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}) {
  const now = new Date();
  const expiresAt = params.expiresAt === undefined
    ? addDays(now, DEFAULT_INVITE_EXPIRY_DAYS)
    : params.expiresAt;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const rows = await db
        .insert(hirelix_beta_invites)
        .values({
          invite_code: generateInviteCode(),
          recipient_email: params.recipientEmail?.trim().toLowerCase() || null,
          first_name: params.firstName?.trim() || null,
          company: params.company?.trim() || null,
          source: params.source ?? "manual",
          invited_by_user_id: params.invitedByUserId ?? null,
          batch_id: params.batchId?.trim() || null,
          campaign: params.campaign?.trim() || null,
          status: "reserved",
          seat_number: params.seatNumber ?? null,
          free_search_limit: params.freeSearchLimit ?? DEFAULT_FREE_SEARCH_LIMIT,
          referral_limit: params.referralLimit ?? DEFAULT_REFERRAL_LIMIT,
          expires_at: expiresAt,
          metadata: sanitizeMetadata(params.metadata ?? {}),
          created_at: now,
          updated_at: now,
        })
        .returning();
      return rows[0];
    } catch (error) {
      if (attempt === 4 || !isUniqueViolation(error)) throw error;
    }
  }

  throw new Error("Failed to create beta invite.");
}

export async function recordInviteEvent(params: {
  inviteCode: string;
  eventType: BetaInviteEventType;
  request?: InviteRequestMeta | null;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(hirelix_beta_invite_events).values({
    invite_code: params.inviteCode,
    event_type: params.eventType,
    ip_address: params.request?.ipAddress ?? null,
    user_agent: params.request?.userAgent ?? null,
    referer: params.request?.referer ?? null,
    metadata: sanitizeMetadata(params.metadata ?? {}),
  });
}

export async function activateInviteForUser(params: {
  inviteCode: string;
  userId: string;
  userEmail?: string | null;
  request?: InviteRequestMeta | null;
}) {
  const invite = await getInviteByCode(params.inviteCode);
  if (!invite) return { ok: false as const, reason: "not_found" as const };

  const unavailable = isInviteUnavailable(invite);
  if (unavailable) return { ok: false as const, reason: unavailable };

  if (invite.activated_user_id && invite.activated_user_id !== params.userId) {
    return { ok: false as const, reason: "already_activated" as const };
  }

  const now = new Date();
  const normalizedRecipient = normalizeEmail(invite.recipient_email);
  const normalizedUserEmail = normalizeEmail(params.userEmail);
  const emailMismatch = Boolean(
    normalizedRecipient &&
      normalizedUserEmail &&
      normalizedRecipient !== normalizedUserEmail,
  );
  const emailMismatchMetadata = emailMismatch
    ? {
        metadata: sql`${hirelix_beta_invites.metadata} || ${JSON.stringify({
          email_mismatch: true,
          expected_email_domain: domainOf(normalizedRecipient),
          actual_email_domain: domainOf(normalizedUserEmail),
        })}::jsonb`,
      }
    : {};

  await db
    .update(hirelix_beta_invites)
    .set({
      status: invite.status === "used" ? "used" : "activated",
      activated_user_id: params.userId,
      activated_at: invite.activated_at ?? now,
      clicked_at: invite.clicked_at ?? now,
      updated_at: now,
      ...emailMismatchMetadata,
    })
    .where(eq(hirelix_beta_invites.invite_code, params.inviteCode));

  await recordInviteEvent({
    inviteCode: params.inviteCode,
    eventType: "invite_activated",
    request: params.request,
    metadata: {
      user_id: params.userId,
      email_mismatch: emailMismatch,
    },
  });

  const referralInvites = await ensureReferralInvitesForUser({
    invitedByUserId: params.userId,
    limit: invite.referral_limit ?? DEFAULT_REFERRAL_LIMIT,
    request: params.request,
  });

  return {
    ok: true as const,
    invite,
    emailMismatch,
    referralPasses: referralInvites.length,
  };
}

export async function ensureReferralInvitesForUser(params: {
  invitedByUserId: string;
  limit?: number | null;
  request?: InviteRequestMeta | null;
}) {
  const limit = Math.max(0, params.limit ?? DEFAULT_REFERRAL_LIMIT);
  if (limit === 0) return [];

  const existing = await db
    .select()
    .from(hirelix_beta_invites)
    .where(
      and(
        eq(hirelix_beta_invites.source, "referral"),
        eq(hirelix_beta_invites.invited_by_user_id, params.invitedByUserId),
      ),
    );

  const missing = Math.max(0, limit - existing.length);
  if (missing === 0) return existing;

  const now = new Date();
  const expiresAt = addDays(now, DEFAULT_INVITE_EXPIRY_DAYS);
  const rows = Array.from({ length: missing }, () => ({
    invite_code: generateInviteCode(),
    source: "referral" as const,
    invited_by_user_id: params.invitedByUserId,
    status: "reserved" as const,
    free_search_limit: DEFAULT_FREE_SEARCH_LIMIT,
    referral_limit: DEFAULT_REFERRAL_LIMIT,
    expires_at: expiresAt,
    metadata: { reserved_for_user_id: params.invitedByUserId },
    created_at: now,
    updated_at: now,
  }));

  const inserted = await db.insert(hirelix_beta_invites).values(rows).returning();
  await Promise.all(
    inserted.map((invite) =>
      recordInviteEvent({
        inviteCode: invite.invite_code,
        eventType: "referral_invite_created",
        request: params.request,
        metadata: {
          invited_by_user_id: params.invitedByUserId,
        },
      }),
    ),
  );

  return [...existing, ...inserted];
}

export async function markInviteSearchCreated(params: {
  inviteCode: string | null | undefined;
  userId: string;
  searchId: string;
  request?: InviteRequestMeta | null;
}) {
  if (!params.inviteCode) return null;
  const invite = await getInviteByCode(params.inviteCode);
  if (!invite) return null;
  if (invite.activated_user_id !== params.userId) return null;
  if (isInviteUnavailable(invite)) return null;
  if (invite.status === "used") return invite;

  await recordInviteEvent({
    inviteCode: invite.invite_code,
    eventType: "invite_search_created",
    request: params.request,
    metadata: {
      user_id: params.userId,
      search_id: params.searchId,
      invite_source: invite.source,
      invite_batch_id: invite.batch_id,
    },
  });

  if (invite.status !== "used") {
    const now = new Date();
    await db
      .update(hirelix_beta_invites)
      .set({
        status: "used",
        used_at: now,
        updated_at: now,
      })
      .where(
        and(
          eq(hirelix_beta_invites.invite_code, invite.invite_code),
          eq(hirelix_beta_invites.activated_user_id, params.userId),
          or(
            eq(hirelix_beta_invites.status, "activated"),
            eq(hirelix_beta_invites.status, "clicked"),
            eq(hirelix_beta_invites.status, "reserved"),
          ),
        ),
      );
  }

  return invite;
}

export function getInviteCodeFromRequest(req: NextRequest, bodyValue?: unknown) {
  const fromBody =
    bodyValue && typeof bodyValue === "object" && !Array.isArray(bodyValue)
      ? readString((bodyValue as Record<string, unknown>).invite_code)
      : null;
  const fromCookie = readString(req.cookies.get(BETA_INVITE_COOKIE)?.value);
  return sanitizeInviteCode(fromBody || fromCookie);
}

export function sanitizeInviteCode(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(trimmed)) return null;
  return trimmed;
}

function getHeader(req: NextRequest, name: string) {
  const value = req.headers.get(name);
  return value && value.trim() ? value.trim() : null;
}

function getIpAddress(req: NextRequest) {
  const forwarded = getHeader(req, "x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return getHeader(req, "x-real-ip");
}

function sanitizeMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => {
      return (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      );
    }),
  );
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybeCode = "code" in error ? (error as { code?: unknown }).code : null;
  return maybeCode === "23505";
}

function normalizeEmail(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : null;
}

function domainOf(value: string | null) {
  return value?.split("@")[1] ?? null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function isIpv4InCidr(ipAddress: string, cidrBase: string, prefixLength: number) {
  const ip = ipv4ToNumber(ipAddress);
  const base = ipv4ToNumber(cidrBase);
  if (ip === null || base === null) return false;
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (ip & mask) === (base & mask);
}

function ipv4ToNumber(ipAddress: string) {
  const parts = ipAddress.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const value = Number.parseInt(part, 10);
    if (!Number.isInteger(value) || value < 0 || value > 255) return null;
    result = ((result << 8) + value) >>> 0;
  }
  return result;
}
