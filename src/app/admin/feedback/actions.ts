"use server";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/admin-session";
import { updateFeedback } from "@/lib/product-feedback";
export async function changeFeedbackStatus(form: FormData) {
  const token = await requireAdminSession();
  await updateFeedback(token, {
    id: form.get("id"),
    status: form.get("status"),
  });
  revalidatePath("/admin/feedback");
}

export async function refreshFeedback() {
  await requireAdminSession();
  revalidatePath("/admin/feedback");
}
