import { z } from "zod";
export const feedbackInput = z.object({
  request_key: z.string().uuid(),
  category: z.enum(["problem", "suggestion", "other"]).default("other"),
  message: z.string().trim().min(1).max(5000),
  page_path: z
    .string()
    .max(200)
    .regex(/^\/app(?:\/[a-z0-9/-]*)?$/i),
});
export const feedbackUpdate = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "in_progress", "replied"]),
});
export type ProductFeedback = {
  id: string;
  email: string;
  category: string;
  message: string;
  page_path: string;
  app_version: string;
  status: "new" | "in_progress" | "replied";
  created_at: string;
  has_screenshot: boolean;
  notification_status: string;
  notification_attempts: number;
};
// Only the route is collected, never query parameters, names or document IDs.
export function feedbackPagePath(path: string) {
  return path
    .split(/[?#]/)[0]
    .replace(
      /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,
      "item",
    );
}
