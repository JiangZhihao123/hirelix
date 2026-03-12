import Image from "next/image";
import {
  FileText,
  Search,
  Mail,
  ArrowRight,
  Zap,
  Database,
  Brain,
  MousePointerClick,
  CheckCircle2,
  Copy,
  Star,
  Download,
  Filter,
} from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="landing-dark min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-white/[0.06] bg-[#050510]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Hirelix" width={28} height={28} />
            <span className="text-xl font-bold tracking-tight text-white">Hirelix</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#how-it-works" className="hidden text-sm text-gray-400 transition-colors hover:text-white sm:block">
              How It Works
            </a>
            <a href="#product" className="hidden text-sm text-gray-400 transition-colors hover:text-white sm:block">
              Product
            </a>
            <Link
              href="/app"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-blue-500"
            >
              Try It Free
            </Link>
          </div>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════
          HERO — One sentence. One button. One demo.
          ═══════════════════════════════════════════════ */}
      <section className="relative overflow-hidden pt-28 pb-16 sm:pt-40 sm:pb-24">
        <div className="hero-grid pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute top-20 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-blue-600/[0.07] blur-[120px]" />
        <div className="pointer-events-none absolute top-40 left-1/4 h-[300px] w-[300px] rounded-full bg-purple-600/[0.05] blur-[100px] animate-glow" />

        <div className="relative mx-auto max-w-5xl px-6 text-center">
          <h1 className="animate-fade-up mx-auto max-w-4xl text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-7xl">
            Paste a JD.{" "}
            <span className="text-gradient">Get candidates.</span>
          </h1>

          <p className="animate-fade-up-delay-1 mx-auto mt-6 max-w-xl text-lg leading-relaxed text-gray-400">
            AI reads your job description, finds real LinkedIn candidates, scores every match, and writes personalized outreach emails — in under 5 minutes.
          </p>

          <div className="animate-fade-up-delay-2 mt-10">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-[0_0_30px_rgba(37,99,235,0.4)]"
            >
              Start Sourcing — It&apos;s Free <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-xs text-gray-500">No credit card. No setup. Just paste and go.</p>
          </div>
        </div>

        {/* Live product demo */}
        <div className="relative mx-auto mt-14 max-w-4xl px-6 sm:mt-20 animate-fade-up-delay-3">
          <div className="glass-strong glow-blue rounded-2xl p-1">
            <div className="rounded-xl bg-[#0a0a1a] p-5 sm:p-8">
              {/* Browser chrome */}
              <div className="flex items-center gap-3 text-sm text-gray-500 mb-5">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-red-500/60" />
                  <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
                  <span className="h-3 w-3 rounded-full bg-green-500/60" />
                </div>
                <span className="text-xs">hirelix.online/app/search/results</span>
              </div>

              {/* Search header */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-white">Senior Frontend Engineer</span>
                <span className="text-xs text-gray-500">·</span>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">Done</span>
                <div className="ml-auto hidden sm:flex gap-1.5">
                  {["React", "TypeScript", "Next.js"].map((s) => (
                    <span key={s} className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">{s}</span>
                  ))}
                </div>
              </div>
              <div className="mb-4 text-[11px] text-gray-500">5 candidates found · Avg: 74% · Range: 62–88%</div>

              {/* Candidate rows */}
              <div className="space-y-2">
                {[
                  { initials: "JL", name: "James Liu", role: "Senior Frontend Engineer at Shopify", score: 88, color: "from-blue-500 to-cyan-500", matched: ["React", "TypeScript", "Next.js"] },
                  { initials: "AN", name: "Anika Nair", role: "Staff Frontend Developer at Atlassian", score: 79, color: "from-violet-500 to-purple-500", matched: ["React", "GraphQL"] },
                  { initials: "MR", name: "Marco Rossi", role: "Frontend Lead at Datadog", score: 72, color: "from-emerald-500 to-green-500", matched: ["TypeScript", "React"] },
                ].map((c) => (
                  <div key={c.name} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${c.color} text-[10px] font-bold text-white`}>
                      {c.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{c.name}</p>
                      <p className="truncate text-xs text-gray-500">{c.role}</p>
                    </div>
                    <div className="hidden items-center gap-1 sm:flex">
                      {c.matched.map((s) => (
                        <span key={s} className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[9px] text-blue-400">{s}</span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-blue-500" style={{ width: `${c.score}%` }} />
                      </div>
                      <span className="w-8 text-right text-xs font-bold text-white">{c.score}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          HOW IT WORKS — 3 steps, honest description
          ═══════════════════════════════════════════════ */}
      <section id="how-it-works" className="relative border-t border-white/[0.06] py-20 sm:py-28">
        <div className="pointer-events-none absolute right-0 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-blue-600/[0.04] blur-[100px]" />
        <div className="relative mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              How it works
            </h2>
            <p className="mt-3 text-base text-gray-400">Three steps. Under five minutes. Real candidates.</p>
          </div>

          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "1",
                icon: FileText,
                title: "Paste your job description",
                desc: "Drop in any JD — or just describe what you're looking for. The AI extracts skills, seniority, location, and experience requirements automatically.",
                accent: "from-blue-500 to-cyan-500",
              },
              {
                step: "2",
                icon: Search,
                title: "AI finds real people",
                desc: "Finds real LinkedIn profiles matching your requirements. Each candidate is scored with specific match reasons.",
                accent: "from-violet-500 to-purple-500",
              },
              {
                step: "3",
                icon: Mail,
                title: "Review and reach out",
                desc: "Get a ranked shortlist with emails and personalized outreach drafts. Edit them inline, copy, and send. Export to CSV if you prefer.",
                accent: "from-emerald-500 to-green-500",
              },
            ].map((item, idx) => (
              <div key={item.step} className="relative">
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${item.accent} text-lg font-bold text-white`}>
                  {item.step}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">{item.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">{item.desc}</p>
                {idx < 2 && (
                  <div className="absolute -right-4 top-6 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-white/[0.06] bg-[#0a0a1a] sm:flex">
                    <ArrowRight className="h-3 w-3 text-gray-600" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          PRODUCT — What you actually get
          ═══════════════════════════════════════════════ */}
      <section id="product" className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              What you get
            </h2>
            <p className="mt-3 text-base text-gray-400">No fluff. These are the actual features.</p>
          </div>

          <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Brain, title: "AI JD Parsing", desc: "Extracts skills, title, location, experience level — no manual input needed." },
              { icon: Database, title: "Real LinkedIn Profiles", desc: "Searches real LinkedIn profiles via Google. Every candidate is a real person you can reach out to." },
              { icon: Star, title: "Match Scoring", desc: "Each candidate scored 0–100% with 3–4 specific reasons explaining why they match." },
              { icon: Mail, title: "Outreach Emails", desc: "AI-written personalized emails referencing each candidate's actual background." },
              { icon: Copy, title: "Copy & Edit", desc: "Edit subject and body inline. Copy subject, body, or both with one click." },
              { icon: Download, title: "CSV Export", desc: "Download your entire shortlist as a spreadsheet. Name, email, score, skills — all included." },
              { icon: Filter, title: "Status Tracking", desc: "Mark candidates as starred, contacted, replied, or rejected. Filter and batch-update." },
              { icon: MousePointerClick, title: "Batch Actions", desc: "Select multiple candidates, change statuses in bulk. Select all with one click." },
              { icon: Zap, title: "Under 5 Minutes", desc: "From pasting a JD to having a shortlist with emails. That's the whole product." },
            ].map((f) => (
              <div key={f.title} className="glass group rounded-xl p-5 transition-all duration-200 hover:bg-white/[0.04]">
                <f.icon className="mb-3 h-5 w-5 text-blue-400" />
                <h3 className="mb-1 text-sm font-semibold text-white">{f.title}</h3>
                <p className="text-xs leading-relaxed text-gray-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          HONEST COMPARISON
          ═══════════════════════════════════════════════ */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Manual sourcing takes hours.
            </h2>
            <p className="mt-3 text-base text-gray-400">Here&apos;s what a typical search looks like with and without Hirelix.</p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <div className="glass rounded-2xl p-6">
              <p className="mb-4 text-xs font-semibold tracking-widest text-gray-500 uppercase">Without Hirelix</p>
              <div className="space-y-3 text-sm text-gray-400">
                <p>1. Open LinkedIn Recruiter, type keywords</p>
                <p>2. Scroll through 100+ profiles</p>
                <p>3. Copy names and emails to a spreadsheet</p>
                <p>4. Write outreach emails one by one</p>
                <p>5. Repeat for every role</p>
              </div>
              <div className="mt-5 rounded-lg bg-white/[0.03] px-4 py-3 text-center">
                <span className="text-2xl font-bold text-red-400">3–4 hours</span>
                <p className="text-xs text-gray-500">per role</p>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] p-6 glow-blue-sm">
              <p className="mb-4 text-xs font-semibold tracking-widest text-blue-400 uppercase">With Hirelix</p>
              <div className="space-y-3 text-sm text-gray-300">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                  <span>Paste the JD</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                  <span>Review ranked candidates</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                  <span>Copy emails and send</span>
                </div>
              </div>
              <div className="mt-5 rounded-lg bg-blue-500/10 px-4 py-3 text-center">
                <span className="text-2xl font-bold text-blue-400">&lt; 5 minutes</span>
                <p className="text-xs text-blue-300/60">same result</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════
          FINAL CTA
          ═══════════════════════════════════════════════ */}
      <section className="relative overflow-hidden border-t border-white/[0.06] py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-blue-600/[0.06] via-transparent to-transparent" />
        <div className="pointer-events-none absolute bottom-0 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-blue-600/[0.06] blur-[120px]" />
        <div className="relative mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Try it with your next open role.
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Free. No signup friction. Just paste a JD and see what comes back.
          </p>
          <div className="mt-10">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-10 py-4 text-lg font-semibold text-white transition-all hover:bg-blue-500 hover:shadow-[0_0_30px_rgba(37,99,235,0.4)]"
            >
              Start Sourcing <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Sticky mobile CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/[0.06] bg-[#050510]/95 p-4 backdrop-blur-xl sm:hidden">
        <Link
          href="/app"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white"
        >
          Start Sourcing — Free <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8 pb-20 sm:pb-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-sm text-gray-500 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Hirelix" width={20} height={20} />
            <span className="font-semibold text-white">Hirelix</span>
          </div>
          <p>AI-powered candidate sourcing from real LinkedIn profiles.</p>
        </div>
      </footer>
    </div>
  );
}
