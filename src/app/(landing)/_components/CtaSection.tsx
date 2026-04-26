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
      <section className="relative overflow-hidden border-t border-slate-200 py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-sky-100 via-white to-[#f8fbff]" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-[360px] w-[560px] -translate-x-1/2 rounded-full bg-sky-200/60 blur-[120px]" />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Ready when you are
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Bring your next open role.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            See the workflow first. Run the real search once you&apos;re ready to sign in — no credit card required.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4">
            <a
              href="#hero-form"
              className="hidden items-center gap-2 rounded-xl bg-amber-400 px-8 py-4 text-base font-semibold text-slate-950 transition-all hover:-translate-y-0.5 hover:bg-amber-300 hover:shadow-[0_18px_50px_rgba(251,191,36,0.42)] sm:inline-flex"
            >
              {desktopFooterCtaLabel} <ArrowRight className="h-4 w-4" />
            </a>
            <button
              type="button"
              onClick={onTrySample}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-8 py-4 text-base font-semibold text-slate-950 transition-all hover:-translate-y-0.5 hover:bg-amber-300 hover:shadow-[0_18px_50px_rgba(251,191,36,0.42)] sm:hidden"
            >
              Try a Sample Search <ArrowRight className="h-4 w-4" />
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
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
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
            <p>Built for technical recruiters and headhunters.</p>
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
