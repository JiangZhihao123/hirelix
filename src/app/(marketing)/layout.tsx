import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

const legalLinks = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/contact", label: "Contact" },
];

export default function MarketingLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[#08111f] text-slate-100">
      <header className="border-b border-white/[0.08] bg-[#07101d]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Hirelix" width={28} height={28} />
            <span className="text-xl font-bold tracking-tight text-white">Hirelix</span>
          </Link>

          <nav className="hidden items-center gap-5 text-sm text-slate-300 sm:flex">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-white">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-white/[0.08] bg-[#07101d]">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 text-sm text-slate-300/82 sm:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.svg" alt="Hirelix" width={24} height={24} />
              <span className="font-semibold text-white">Hirelix</span>
            </div>
            <p>Hirelix is operated by YieldMirror.</p>
            <p>Support: <a className="text-sky-200 hover:text-white" href="mailto:support@hirelix.online">support@hirelix.online</a></p>
            <p>Subscriptions renew automatically until canceled.</p>
            <p>Cancel anytime from billing settings or by emailing support@hirelix.online.</p>
          </div>

          <div className="grid gap-2">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-white">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
