import { sql } from "drizzle-orm";
import sharp from "sharp";
import { db } from "@/db/client";
import { rows, WorkspaceError } from "@/lib/workspace/database";
import type { ApiAuthUser } from "@/lib/api-auth";
import {
  feedbackInput,
  feedbackUpdate,
  feedbackPagePath,
  type ProductFeedback,
} from "./product-feedback-contract";
import { getLogger } from "./logger";
import { readAdminSession } from "./admin-auth";
async function requireAdmin(token: string | undefined) {
  if (!(await readAdminSession(token)))
    throw new WorkspaceError("Not authorized", 403);
}
const logger = getLogger({ component: "product_feedback" });
export async function saveFeedback(
  user: ApiAuthUser,
  input: unknown,
  screenshot?: File | null,
) {
  const data = feedbackInput.parse(input);
  if (!user.email) throw new WorkspaceError("An account email is required");
  let image: Buffer | null = null;
  if (screenshot?.size) {
    if (
      screenshot.size > 2 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(screenshot.type)
    )
      throw new WorkspaceError(
        "Choose a PNG, JPEG or WebP screenshot up to 2 MB",
      );
    try {
      image = await sharp(Buffer.from(await screenshot.arrayBuffer()), {
        limitInputPixels: 20000000,
      })
        .rotate()
        .resize({
          width: 2000,
          height: 2000,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
    } catch {
      throw new WorkspaceError("This screenshot could not be opened");
    }
  }
  const encoded = image?.toString("base64") || null;
  const page = feedbackPagePath(data.page_path);
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${"feedback:" + user.id},0))`,
    );
    const [existing] = await rows<{ id: string; matches: boolean }>(
      sql`SELECT id, (message=${data.message} AND category=${data.category} AND page_path=${page} AND screenshot IS NOT DISTINCT FROM decode(${encoded},'base64')) AS matches FROM hirelix_product_feedback WHERE user_id=${user.id} AND request_key=${data.request_key}::uuid`,
      tx,
    );
    if (existing) {
      if (!existing.matches)
        throw new WorkspaceError(
          "This request was already used for different feedback",
          409,
        );
      return { id: existing.id };
    }
    const [{ count }] = await rows<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM hirelix_product_feedback WHERE user_id=${user.id} AND created_at>now()-interval '24 hours'`,
      tx,
    );
    if (count >= 10)
      throw new WorkspaceError(
        "You have sent 10 reports today. Please contact support@hirelix.online for more help.",
        429,
      );
    const [saved] = await rows<{ id: string }>(
      sql`INSERT INTO hirelix_product_feedback(user_id,request_key,email,category,message,page_path,app_version,screenshot) VALUES(${user.id},${data.request_key}::uuid,${user.email},${data.category},${data.message},${page},${process.env.VERCEL_GIT_COMMIT_SHA || process.env.APP_VERSION || "local"},decode(${encoded},'base64')) RETURNING id`,
      tx,
    );
    return saved;
  });
}
export async function listFeedback(
  token: string | undefined,
  before?: string | null,
  report?: string | null,
) {
  await requireAdmin(token);
  const selected = report ? feedbackUpdate.shape.id.parse(report) : null;
  const cursor = before ? feedbackUpdate.shape.id.parse(before) : null;
  return rows<ProductFeedback>(
    sql`SELECT id,email,category,message,page_path,app_version,status,created_at,screenshot IS NOT NULL AS has_screenshot,notification_status,notification_attempts FROM hirelix_product_feedback WHERE (${selected}::uuid IS NULL OR id=${selected}::uuid) AND (${cursor}::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM hirelix_product_feedback WHERE id=${cursor}::uuid)) ORDER BY created_at DESC,id DESC LIMIT 50`,
  );
}
export async function updateFeedback(
  token: string | undefined,
  input: unknown,
) {
  await requireAdmin(token);
  const data = feedbackUpdate.parse(input);
  const [item] = await rows(
    sql`UPDATE hirelix_product_feedback SET status=${data.status},updated_at=now() WHERE id=${data.id}::uuid RETURNING id`,
  );
  if (!item) throw new WorkspaceError("Feedback not found", 404);
  return item;
}
// The durable row is the notification queue. A failed email never loses feedback.
export async function notifyProductFeedback() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  await db.execute(
    sql`UPDATE hirelix_product_feedback SET notification_status='failed' WHERE notification_status IN ('pending','sending') AND notification_attempts>0 AND (created_at<now()-interval '23 hours' OR notification_attempts>=5 AND notification_next_at<=now())`,
  );
  const [item] = await rows<ProductFeedback>(
    sql`WITH claim AS (SELECT id FROM hirelix_product_feedback WHERE notification_status IN ('pending','sending') AND notification_next_at<=now() AND notification_attempts<5 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE hirelix_product_feedback f SET notification_status='sending',notification_attempts=notification_attempts+1,notification_next_at=now()+interval '10 minutes' FROM claim WHERE f.id=claim.id RETURNING f.id,f.email,f.category,f.message,f.page_path,f.app_version,f.notification_attempts`,
  );
  if (!item) return;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `product-feedback/${item.id}`,
      },
      body: JSON.stringify({
        from:
          process.env.SEARCH_NOTIFICATIONS_FROM_EMAIL ||
          "Hirelix <notifications@hirelix.online>",
        to: ["support@hirelix.online"],
        reply_to: item.email,
        subject: `[Hirelix feedback] ${item.category} · ${item.id.slice(0, 8)}`,
        text: `From: ${item.email}\nCategory: ${item.category}\nPage: ${item.page_path}\nVersion: ${item.app_version}\n\n${item.message}\n\nView and manage feedback (including any screenshot): ${(process.env.APP_BASE_URL || "https://hirelix.online").replace(/\/$/, "")}/admin/feedback?report=${item.id}\nReply to this email to contact the user.`,
      }),
    });
    if (!response.ok) throw new Error("Notification provider rejected request");
    const result = (await response.json()) as { id?: string };
    if (!result.id) throw new Error("Notification receipt missing");
    await db.execute(
      sql`UPDATE hirelix_product_feedback SET notification_status='sent',notification_id=${result.id},updated_at=now() WHERE id=${item.id}::uuid`,
    );
  } catch {
    await db.execute(
      sql`UPDATE hirelix_product_feedback SET notification_status=${item.notification_attempts >= 5 ? "failed" : "pending"},notification_next_at=now()+interval '5 minutes',updated_at=now() WHERE id=${item.id}::uuid`,
    );
    logger.warn(
      { feedback_id: item.id },
      "Feedback saved; notification will retry or needs attention",
    );
  }
}
