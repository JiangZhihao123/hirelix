import type { Metadata } from "next";
import { cookies } from "next/headers";
import { adminCookieName, readAdminSession } from "@/lib/admin-auth";
import { AdminClient } from "./AdminClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "管理员 | Hirelix",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function AdminPage() {
  const session = await readAdminSession((await cookies()).get(adminCookieName())?.value);
  return <AdminClient initialUsername={session?.username || ""} />;
}
