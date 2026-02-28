import Image from "next/image";
import {
  FileText,
  Search,
  Mail,
  Clock,
  Users,
  CheckCircle2,
  Target,
  Zap,
  DollarSign,
  Star,
  ArrowRight,
  Sparkles,
  BarChart3,
  Globe,
} from "lucide-react";
import { WaitlistForm } from "./waitlist-form";
import Link from "next/link";

const TESTIMONIALS = [
  {
    name: "Sarah K.",
    role: "Technical Recruiter, Series B Startup",
    text: "I used to spend half my day just finding candidates on LinkedIn. With Hirelix, I paste the JD and get a solid shortlist in minutes. The outreach emails actually sound human too.",
    rating: 5,
  },
  {
    name: "James T.",
    role: "Engineering Manager",
    text: "We don't have a dedicated recruiter, so I was doing sourcing myself. Hirelix saved me probably 4-5 hours a week. It actually understands what a strong engineering profile looks like.",
    rating: 5,
  },
  {
    name: "Maria L.",
    role: "Freelance Recruiter",
    text: "Tested it on a tough ML engineer search. The candidate matches were surprisingly good — found a few people I hadn't seen on other platforms.",
    rating: 4,
  },
  {
    name: "David R.",
    role: "Head of Talent, Fintech",
    text: "The personalized emails are the killer feature. My old workflow was: search, export to spreadsheet, write emails manually. Now it's one step.",
    rating: 4,
  },
];

const STATS = [
  { value: "270M+", label: "Professional Profiles" },
  { value: "5 min", label: "Average Time to Shortlist" },
  { value: "3x", label: "Better Response Rates" },
  { value: "85%", label: "Time Saved vs Manual" },
];

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
            <a href="#testimonials" className="hidden text-sm text-gray-400 transition-colors hover:text-white sm:block">
              Reviews
            </a>
            <Link
              href="/app"
              className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              Sign In
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-28 pb-20 sm:pt-40 sm:pb-32">
        {/* Background effects */}
        <div className="hero-grid pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute top-20 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-blue-600/[0.07] blur-[120px]" />
        <div className="pointer-events-none absolute top-40 left-1/4 h-[300px] w-[300px] rounded-full bg-purple-600/[0.05] blur-[100px] animate-glow" />
        <div className="pointer-events-none absolute top-60 right-1/4 h-[250px] w-[250px] rounded-full bg-cyan-500/[0.04] blur-[80px] animate-glow" />

        <div className="relative mx-auto max-w-5xl px-6 text-center">
          <div className="animate-fade-up mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-1.5 text-sm font-medium text-blue-400">
            <Sparkles className="h-3.5 w-3.5" />
            Private Beta — Limited spots remaining
          </div>

          <h1 className="animate-fade-up-delay-1 mx-auto max-w-4xl text-5xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-7xl">
            From JD to{" "}
            <span className="text-gradient">Qualified Candidates</span>
            {" "}in 5 Minutes
          </h1>

          <p className="animate-fade-up-delay-2 mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-400 sm:text-xl">
            Paste a job description. Our AI searches 270M+ profiles, ranks the
            best matches, and writes personalized outreach emails — automatically.
          </p>

          <div className="animate-fade-up-delay-3 mt-10">
            <WaitlistForm />
          </div>

          <p className="animate-fade-up-delay-3 mt-5 text-sm text-gray-500">
            Free during beta &middot; No credit card required &middot;{" "}
            <a href="#how-it-works" className="text-gray-400 underline underline-offset-4 transition-colors hover:text-white">
              See how it works
            </a>
          </p>
        </div>

        {/* Floating demo card */}
        <div className="relative mx-auto mt-16 max-w-3xl px-6 sm:mt-20">
          <div className="glass-strong glow-blue rounded-2xl p-1 animate-fade-in">
            <div className="rounded-xl bg-[#0a0a1a] p-6 sm:p-8">
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-red-500/60" />
                  <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
                  <span className="h-3 w-3 rounded-full bg-green-500/60" />
                </div>
                <span>Hirelix — Search Results</span>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  { name: "Alex Chen", role: "Senior Frontend Engineer at Stripe", score: 95, color: "bg-emerald-500" },
                  { name: "Sarah Kim", role: "Staff Engineer at Vercel", score: 92, color: "bg-emerald-500" },
                  { name: "Marcus Johnson", role: "Frontend Lead at Notion", score: 88, color: "bg-blue-500" },
                ].map((c) => (
                  <div key={c.name} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-white">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.role}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className={`h-full rounded-full ${c.color}`} style={{ width: `${c.score}%` }} />
                      </div>
                      <span className="text-xs font-bold text-white">{c.score}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y border-white/[0.06] bg-white/[0.02]">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="px-6 py-8 text-center sm:py-10">
              <p className="text-3xl font-bold text-white sm:text-4xl">{s.value}</p>
              <p className="mt-1 text-xs text-gray-500 sm:text-sm">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="relative py-20 sm:py-28">
        <div className="pointer-events-none absolute right-0 top-1/2 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-blue-600/[0.04] blur-[100px]" />
        <div className="relative mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="mb-3 text-sm font-semibold tracking-widest text-blue-400 uppercase">How It Works</p>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Three steps. Five minutes. Done.
            </h2>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-3">
            {[
              {
                step: "01",
                icon: FileText,
                title: "Paste Your JD",
                desc: "Drop in a job description or describe your ideal candidate. Our AI extracts every requirement — skills, seniority, location, culture fit.",
              },
              {
                step: "02",
                icon: Search,
                title: "AI Searches & Ranks",
                desc: "Searches 270M+ professional profiles. Analyzes skills, experience, GitHub contributions. Returns a ranked shortlist with match scores.",
              },
              {
                step: "03",
                icon: Mail,
                title: "Review & Reach Out",
                desc: "Get verified emails and personalized outreach drafts for every candidate. Edit, copy, send. Your pipeline is ready.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="group glass rounded-2xl p-7 transition-all duration-300 hover:border-blue-500/20 hover:bg-white/[0.04]"
              >
                <div className="mb-5 flex items-center gap-3">
                  <span className="text-3xl font-black text-white/10">{item.step}</span>
                  <item.icon className="h-5 w-5 text-blue-400 transition-transform duration-300 group-hover:scale-110" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">{item.title}</h3>
                <p className="text-sm leading-relaxed text-gray-400">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="mb-3 text-sm font-semibold tracking-widest text-purple-400 uppercase">Features</p>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Why recruiters switch to Hirelix
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base text-gray-400">
              Built for people who are tired of tab-switching and copy-pasting.
            </p>
          </div>

          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Clock,
                title: "Hours → Minutes",
                desc: "What takes 3+ hours of manual searching and filtering is done in under 5 minutes.",
                accent: "text-blue-400",
              },
              {
                icon: Target,
                title: "Semantic Matching",
                desc: "Goes beyond keywords. Understands that 'distributed systems engineer' might be listed as 'backend infrastructure.'",
                accent: "text-emerald-400",
              },
              {
                icon: Mail,
                title: "Personalized Outreach",
                desc: "Each email references the candidate's actual background — not a generic template. Better response rates.",
                accent: "text-violet-400",
              },
              {
                icon: DollarSign,
                title: "Fraction of Agency Cost",
                desc: "Agencies charge 15-25% of salary. Hirelix costs less than a team lunch.",
                accent: "text-amber-400",
              },
              {
                icon: Globe,
                title: "270M+ Profiles",
                desc: "Same data enterprise tools charge thousands for. LinkedIn, GitHub, and more — all in one search.",
                accent: "text-cyan-400",
              },
              {
                icon: Zap,
                title: "Built for Tech Roles",
                desc: "Understands tech stacks, open source contributions, and what makes a strong engineering profile.",
                accent: "text-rose-400",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="glass group rounded-2xl p-6 transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04]"
              >
                <feature.icon className={`mb-4 h-5 w-5 ${feature.accent} transition-transform duration-300 group-hover:scale-110`} />
                <h3 className="mb-2 text-base font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-gray-400">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center">
            <p className="mb-3 text-sm font-semibold tracking-widest text-cyan-400 uppercase">Comparison</p>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              The old way vs. Hirelix
            </h2>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            <div className="glass rounded-2xl p-7">
              <h3 className="mb-5 text-base font-semibold text-red-400">
                Manual Sourcing
              </h3>
              {[
                "Open LinkedIn, Apollo, GitHub in separate tabs",
                "Try different keyword combos for each",
                "Copy-paste profiles into a spreadsheet",
                "Write outreach emails one by one",
                "3-4 hours per role, every time",
              ].map((item) => (
                <div key={item} className="mb-3 flex items-start gap-3">
                  <span className="mt-0.5 text-sm text-red-400/60">✕</span>
                  <span className="text-sm text-gray-400">{item}</span>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.05] p-7 glow-blue-sm">
              <h3 className="mb-5 text-base font-semibold text-blue-400">
                With Hirelix
              </h3>
              {[
                "Paste JD once — agent handles everything",
                "Semantic understanding of requirements",
                "Ranked shortlist with match scores",
                "Personalized emails for each candidate",
                "Done in under 5 minutes",
              ].map((item) => (
                <div key={item} className="mb-3 flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                  <span className="text-sm text-gray-200">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="mb-3 text-sm font-semibold tracking-widest text-amber-400 uppercase">Testimonials</p>
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              What early users say
            </h2>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="glass group rounded-2xl p-6 transition-all duration-300 hover:border-white/10"
              >
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < t.rating
                          ? "fill-amber-400 text-amber-400"
                          : "text-white/10"
                      }`}
                    />
                  ))}
                </div>
                <p className="mb-4 text-sm leading-relaxed text-gray-300">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div>
                  <p className="text-sm font-medium text-white">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Beta Program */}
      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="mb-3 text-sm font-semibold tracking-widest text-green-400 uppercase">Beta Program</p>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Join the private beta
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-gray-400">
            We&apos;re testing with a limited group before public launch. Beta users get free access and help shape the product.
          </p>

          <div className="glass mx-auto mt-10 max-w-md rounded-2xl p-7">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-400">Beta spots filled</span>
              <span className="text-sm font-bold text-blue-400">14 / 100</span>
            </div>
            <div className="mb-6 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full w-[14%] rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all" />
            </div>
            <ul className="space-y-3 text-left text-sm">
              {[
                "Full access to all features during beta",
                "Direct line to the team for feedback",
                "Lock in early-bird pricing at launch",
                "Help shape the product roadmap",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                  <span className="text-gray-300">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="waitlist" className="relative overflow-hidden border-t border-white/[0.06] py-20 sm:py-28">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-blue-600/[0.04] to-transparent" />
        <div className="relative mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Ready to stop sourcing manually?
          </h2>
          <p className="mt-4 text-base text-gray-400">
            Drop your email. We&apos;ll send an invite when a spot opens up.
          </p>

          <div className="mt-8">
            <WaitlistForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-sm text-gray-500 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Hirelix" width={20} height={20} />
            <span className="font-semibold text-white">Hirelix</span>
          </div>
          <p>&copy; {new Date().getFullYear()} Hirelix. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
