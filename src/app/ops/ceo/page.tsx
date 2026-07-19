import type { Metadata } from "next";

import { CeoDashboardAccessClient } from "./CeoDashboardAccessClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "CEO 运营总览 | Hirelix",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function CeoDashboardPage() {
  return <CeoDashboardAccessClient />;
}
