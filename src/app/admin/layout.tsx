import type { Metadata } from "next";
import "./admin.css";
export const metadata: Metadata = {
  title: "Hirelix 管理后台",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
