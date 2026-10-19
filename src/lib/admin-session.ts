import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCookieName, readAdminSession } from "./admin-auth";
export async function requireAdminSession() {
  const token = (await cookies()).get(adminCookieName())?.value;
  if (!(await readAdminSession(token))) redirect("/admin");
  return token;
}
