import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  hirelix_redemption_codes,
  hirelix_redemptions,
  hirelix_user_settings,
} from "@/db/schema";
import { getEffectivePlanCode } from "@/lib/billing";
import {
  addRedemptionDays,
  hashRedemptionCode,
  normalizeRedemptionCode,
} from "@/lib/redemption-codes";

export type RedemptionFailureReason =
  | "invalid_code"
  | "code_unavailable"
  | "already_redeemed"
  | "paid_subscription_active";

export async function redeemStarterCode(params: {
  code: unknown;
  userId: string;
  userEmail?: string | null;
  now?: Date;
}) {
  const normalizedCode = normalizeRedemptionCode(params.code);
  if (!normalizedCode) {
    return { ok: false as const, reason: "invalid_code" as const };
  }

  const now = params.now ?? new Date();
  return db.transaction(async (tx) => {
    // Serialize redemption attempts per account so two different valid codes
    // cannot race past the one-beta-redemption-per-user rule.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${params.userId}))`);

    const [settings] = await tx
      .select({
        subscription_plan: hirelix_user_settings.subscription_plan,
        subscription_status: hirelix_user_settings.subscription_status,
      })
      .from(hirelix_user_settings)
      .where(eq(hirelix_user_settings.user_id, params.userId))
      .limit(1);

    if (
      getEffectivePlanCode(settings?.subscription_plan, settings?.subscription_status) !== "free"
    ) {
      return { ok: false as const, reason: "paid_subscription_active" as const };
    }

    const [existing] = await tx
      .select({ id: hirelix_redemptions.id })
      .from(hirelix_redemptions)
      .where(
        and(
          eq(hirelix_redemptions.user_id, params.userId),
          eq(hirelix_redemptions.benefit_plan, "starter_monthly"),
        ),
      )
      .limit(1);
    if (existing) {
      return { ok: false as const, reason: "already_redeemed" as const };
    }

    const [claimedCode] = await tx
      .update(hirelix_redemption_codes)
      .set({
        redemption_count: sql`${hirelix_redemption_codes.redemption_count} + 1`,
        updated_at: now,
      })
      .where(
        and(
          eq(hirelix_redemption_codes.code_hash, hashRedemptionCode(normalizedCode)),
          eq(hirelix_redemption_codes.status, "active"),
          lt(hirelix_redemption_codes.redemption_count, hirelix_redemption_codes.max_redemptions),
          or(
            isNull(hirelix_redemption_codes.expires_at),
            gt(hirelix_redemption_codes.expires_at, now),
          ),
        ),
      )
      .returning({
        id: hirelix_redemption_codes.id,
        benefitPlan: hirelix_redemption_codes.benefit_plan,
        durationDays: hirelix_redemption_codes.duration_days,
        campaign: hirelix_redemption_codes.campaign,
      });
    if (!claimedCode || claimedCode.benefitPlan !== "starter_monthly") {
      return { ok: false as const, reason: "code_unavailable" as const };
    }

    const endsAt = addRedemptionDays(now, claimedCode.durationDays);
    await tx.insert(hirelix_redemptions).values({
      code_id: claimedCode.id,
      user_id: params.userId,
      benefit_plan: "starter_monthly",
      status: "active",
      redeemed_at: now,
      starts_at: now,
      ends_at: endsAt,
      metadata: {
        campaign: claimedCode.campaign,
        user_email: params.userEmail?.trim().toLowerCase() || null,
      },
      created_at: now,
      updated_at: now,
    });

    return { ok: true as const, planCode: "starter_monthly" as const, startsAt: now, endsAt };
  });
}

export function getRedemptionErrorMessage(reason: RedemptionFailureReason) {
  switch (reason) {
    case "invalid_code":
      return "Enter a valid Hirelix beta code.";
    case "already_redeemed":
      return "This account has already used its beta Starter access.";
    case "paid_subscription_active":
      return "This account already has an active paid subscription.";
    default:
      return "This beta code is unavailable, expired, or already redeemed.";
  }
}
