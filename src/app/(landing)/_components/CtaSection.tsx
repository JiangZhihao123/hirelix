import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { legalLinks } from "./data";

export function CtaSection({
  onTrySample,
  onSignIn,
  desktopFooterCtaLabel,
}: {
  onTrySample: () => void;
  onSignIn: () => void;
  desktopFooterCtaLabel: string;
}) {
  return (
    <>
      <section className="relative overflow-hidden border-t border-slate-200 bg-[#fbfaf7] py-24 sm:py-32">
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Ready when you are
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Start with the role already on your desk.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            Paste a JD, review the shortlist, and edit the outreach before anything gets sent.
            No credit card required to start.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4">
            <a
              href="#hero-form"
              className="hidden items-center gap-2 rounded-lg bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-[0_18px_42px_rgba(37,99,235,0.24)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 sm:inline-flex"
            >
              {desktopFooterCtaLabel} <ArrowRight className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={onTrySample}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-[0_18px_42px_rgba(37,99,235,0.24)] transition-all hover:-translate-y-0.5 hover:bg-blue-700 sm:hidden"
            >
              Try a sample search <ArrowRight className="h-4 w-4" />
            </button>
            <p className="text-sm text-slate-600">
              Already have an account?{" "}
              <button
                type="button"
                onClick={onSignIn}
                className="font-medium text-sky-700 hover:underline"
              >
                Sign in
              </button>
            </p>
          </div>

          {/* Reassurance row */}
          <div className="mx-auto mt-10 flex max-w-2xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              No credit card to start
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
              Real LinkedIn profiles
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Drafts ready in minutes
            </span>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 text-sm text-slate-600 sm:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <Image src="/logo.svg" alt="Hirelix" width={20} height={20} />
              <span className="font-semibold text-slate-950">Hirelix</span>
            </div>
            <p>AI-powered candidate sourcing from real LinkedIn profiles.</p>
            <p>Hirelix is operated by YieldMirror.</p>
            <p>Built for recruiters, search firms, and hiring teams.</p>
            <p>Support: <a className="text-sky-700 hover:text-sky-900" href="mailto:support@hirelix.online">support@hirelix.online</a></p>
            <p>Subscriptions renew automatically until canceled.</p>
            <p>Cancel anytime from billing settings or by emailing support@hirelix.online.</p>
          </div>

          <div className="grid gap-2 sm:justify-self-end sm:text-right">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-slate-950">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </>
  );
}
