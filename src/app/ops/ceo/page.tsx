import type { Metadata } from "next";

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "CEO 运营总览 | Hirelix",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function CeoDashboardPage() {
  redirect("/admin");
}
