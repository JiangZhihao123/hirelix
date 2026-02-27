import Image from "next/image";
import {
  FileText,
  Search,
  Mail,
  Clock,
  Users,
  ArrowRight,
  CheckCircle2,
  Target,
  Zap,
  DollarSign,
  Star,
} from "lucide-react";
import { WaitlistForm } from "./waitlist-form";

const TESTIMONIALS = [
  {
    name: "Sarah K.",
    role: "Technical Recruiter, Series B Startup",
    text: "I used to spend half my day just finding candidates on LinkedIn. With Hirelix, I paste the JD and get a solid shortlist in minutes. The outreach emails actually sound human too — my response rate went up noticeably.",
    rating: 5,
  },
  {
    name: "James T.",
    role: "Engineering Manager",
    text: "We don't have a dedicated recruiter, so I was doing sourcing myself. Hirelix saved me probably 4-5 hours a week. The GitHub integration is what sold me — it actually understands what a strong engineering profile looks like.",
    rating: 5,
  },
  {
    name: "Maria L.",
    role: "Freelance Recruiter",
    text: "Tested it on a tough ML engineer search. The candidate matches were surprisingly good — found a few people I hadn't seen on other platforms. Still early but very promising.",
    rating: 4,
  },
  {
    name: "David R.",
    role: "Head of Talent, Fintech",
    text: "The personalized emails are the killer feature. My old workflow was: search, export to spreadsheet, write emails manually. Now it's one step. Not perfect yet but already way faster.",
    rating: 4,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Hirelix" width={28} height={28} />
            <span className="text-xl font-bold tracking-tight">Hirelix</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#how-it-works" className="hidden text-sm text-muted hover:text-foreground sm:block">
              How It Works
            </a>
            <a href="#testimonials" className="hidden text-sm text-muted hover:text-foreground sm:block">
              Testimonials
            </a>
            <a
              href="#waitlist"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
            >
              Request Invite
            </a>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-28 pb-16 sm:pt-36 sm:pb-24">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            Private Beta — 14 of 100 spots taken
          </div>

          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl sm:leading-[1.15]">
            From Job Description to Qualified Candidates in 5 Minutes
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            Paste a job description. Hirelix finds the best-matching candidates
            across 270M+ profiles, scores them, and writes personalized outreach
            emails — so you can focus on conversations, not searching.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href="#waitlist"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-7 py-3 text-base font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Request Early Access <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-lg border border-border px-7 py-3 text-base font-medium text-muted transition-colors hover:border-muted-light hover:text-foreground"
            >
              See How It Works
            </a>
          </div>

          <p className="mt-6 text-sm text-muted-light">
            Free during private beta &middot; Invite only &middot; No credit card
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="border-t border-border bg-surface py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              How It Works
            </h2>
            <p className="mt-3 text-base text-muted">
              Three steps. Five minutes. A shortlist ready to go.
            </p>
          </div>

          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "1",
                icon: FileText,
                title: "Paste Your JD",
                desc: "Drop in a job description or describe your ideal candidate in plain language. Hirelix extracts the requirements automatically.",
              },
              {
                step: "2",
                icon: Search,
                title: "AI Searches & Ranks",
                desc: "Searches 270M+ professional profiles, analyzes skills, experience and GitHub contributions, then ranks the best matches.",
              },
              {
                step: "3",
                icon: Mail,
                title: "Review & Reach Out",
                desc: "Get a shortlist with match scores, verified emails, and personalized outreach drafts. Tweak if needed and send.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-xl border border-border bg-background p-7"
              >
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                  {item.step}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Why Recruiters Switch to Hirelix
            </h2>
            <p className="mt-3 text-base text-muted">
              Built for people who are tired of tab-switching and copy-pasting.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Clock,
                title: "Hours to Minutes",
                desc: "What takes 3+ hours of manual searching and filtering is done in under 5 minutes. Spend that time on interviews instead.",
              },
              {
                icon: Target,
                title: "Semantic Matching",
                desc: "Goes beyond keyword matching. Understands that a 'distributed systems engineer' might also be listed as 'backend infrastructure.'",
              },
              {
                icon: Mail,
                title: "Personalized Outreach",
                desc: "Each email draft references the candidate's actual background — not a generic template. Better response rates.",
              },
              {
                icon: DollarSign,
                title: "Fraction of Agency Cost",
                desc: "Agencies charge 15-25% of annual salary. Hirelix will cost less than a team lunch when it launches.",
              },
              {
                icon: Users,
                title: "270M+ Professional Profiles",
                desc: "Same data that enterprise sourcing tools charge thousands for. We just make it accessible.",
              },
              {
                icon: Zap,
                title: "Built for Technical Roles",
                desc: "Understands tech stacks, open source contributions, and what makes a strong engineering profile.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border p-6 transition-colors hover:border-muted-light"
              >
                <feature.icon className="mb-3 h-5 w-5 text-primary" />
                <h3 className="mb-1.5 text-base font-semibold">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="border-t border-border bg-surface py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              The Old Way vs. Hirelix
            </h2>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background p-7">
              <h3 className="mb-5 text-base font-semibold text-red-600">
                Manual Sourcing
              </h3>
              {[
                "Open LinkedIn, Apollo, GitHub in separate tabs",
                "Try different keyword combos for each platform",
                "Copy-paste profiles into a spreadsheet",
                "Write outreach emails one by one",
                "3-4 hours per role, every time",
              ].map((item) => (
                <div key={item} className="mb-2.5 flex items-start gap-2.5">
                  <span className="mt-0.5 text-sm text-red-400">✕</span>
                  <span className="text-sm text-muted">{item}</span>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-primary/25 bg-primary/[0.03] p-7">
              <h3 className="mb-5 text-base font-semibold text-primary">
                With Hirelix
              </h3>
              {[
                "Paste JD once — agent handles the rest",
                "Semantic understanding of role requirements",
                "Ranked shortlist with match scores",
                "Personalized emails for each candidate",
                "Done in under 5 minutes",
              ].map((item) => (
                <div key={item} className="mb-2.5 flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="border-t border-border py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              What Early Users Are Saying
            </h2>
            <p className="mt-3 text-base text-muted">
              We&apos;re in private beta with a small group of recruiters and hiring managers.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="rounded-xl border border-border p-6"
              >
                <div className="mb-3 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < t.rating
                          ? "fill-amber-400 text-amber-400"
                          : "text-border"
                      }`}
                    />
                  ))}
                </div>
                <p className="mb-4 text-sm leading-relaxed text-foreground">
                  &ldquo;{t.text}&rdquo;
                </p>
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Beta Program */}
      <section className="border-t border-border bg-surface py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Private Beta Program
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base text-muted">
            We&apos;re testing Hirelix with a limited group of 100 users before public launch. Beta users get free access and help shape the product with their feedback.
          </p>

          <div className="mx-auto mt-10 max-w-md rounded-xl border border-border bg-background p-7">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-muted">Beta spots filled</span>
              <span className="text-sm font-bold text-primary">14 / 100</span>
            </div>
            <div className="mb-6 h-2 overflow-hidden rounded-full bg-surface-dark">
              <div className="h-full w-[14%] rounded-full bg-primary transition-all" />
            </div>
            <ul className="space-y-3 text-left text-sm">
              {[
                "Full access to all features during beta",
                "Direct line to the team for feedback & requests",
                "Lock in early-bird pricing when we launch",
                "Help shape the product roadmap",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Waitlist CTA */}
      <section id="waitlist" className="border-t border-border py-16 sm:py-24">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Request an Invite
          </h2>
          <p className="mt-3 text-base text-muted">
            Drop your email and we&apos;ll send you an invite link when a spot opens up. No spam — just one email.
          </p>

          <WaitlistForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-sm text-muted sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="Hirelix" width={20} height={20} />
            <span className="font-semibold text-foreground">Hirelix</span>
          </div>
          <p>&copy; {new Date().getFullYear()} Hirelix. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
