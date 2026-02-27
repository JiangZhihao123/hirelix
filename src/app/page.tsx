import {
  Zap,
  FileText,
  Search,
  Mail,
  Clock,
  DollarSign,
  Users,
  ArrowRight,
  CheckCircle2,
  Bot,
  Target,
  Sparkles,
} from "lucide-react";
import { WaitlistForm } from "./waitlist-form";

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Bot className="h-7 w-7 text-primary-light" />
            <span className="text-xl font-bold tracking-tight">Hirelix</span>
          </div>
          <a
            href="#waitlist"
            className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-light"
          >
            Join Waitlist
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28">
        {/* 背景渐变 */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary-light">
            <Sparkles className="h-4 w-4" />
            AI-Powered Tech Recruiting Agent
          </div>

          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl sm:leading-[1.1]">
            From Job Description to{" "}
            <span className="bg-gradient-to-r from-primary-light to-purple-400 bg-clip-text text-transparent">
              Qualified Candidates
            </span>{" "}
            in 5 Minutes
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
            Paste a JD. Hirelix searches 270M+ profiles, ranks the best
            matches, and drafts personalized outreach emails — all
            automatically.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href="#waitlist"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3.5 text-base font-semibold text-white transition-all hover:bg-primary-light hover:shadow-lg hover:shadow-primary/25"
            >
              Get Early Access <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border border-border px-8 py-3.5 text-base font-medium text-muted transition-colors hover:border-primary/50 hover:text-foreground"
            >
              See How It Works
            </a>
          </div>

          {/* 社会证明小提示 */}
          <p className="mt-8 text-sm text-muted/60">
            Free during beta &middot; No credit card required
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="border-t border-border py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              How It Works
            </h2>
            <p className="mt-4 text-lg text-muted">
              Three steps. Five minutes. Done.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-3">
            {[
              {
                step: "01",
                icon: FileText,
                title: "Paste Your JD",
                desc: "Drop in a job description or tell the agent what you're looking for in natural language.",
              },
              {
                step: "02",
                icon: Search,
                title: "AI Searches & Ranks",
                desc: "Hirelix searches across 270M+ professional profiles, scores each candidate, and picks the top matches.",
              },
              {
                step: "03",
                icon: Mail,
                title: "Ready-to-Send Emails",
                desc: "Get a shortlist with verified emails and personalized outreach drafts — ready to copy, tweak, and send.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="group relative rounded-2xl border border-border bg-card p-8 transition-colors hover:border-primary/30 hover:bg-card-hover"
              >
                <div className="mb-4 text-xs font-bold tracking-widest text-primary-light">
                  STEP {item.step}
                </div>
                <item.icon className="mb-4 h-8 w-8 text-primary-light" />
                <h3 className="mb-2 text-xl font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pain Points → Features */}
      <section className="border-t border-border bg-card/50 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Why Recruiters Love Hirelix
            </h2>
            <p className="mt-4 text-lg text-muted">
              Stop doing what AI can do better and faster.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Clock,
                title: "Hours → Minutes",
                desc: "What takes 3+ hours of manual searching and filtering is done in under 5 minutes.",
              },
              {
                icon: Target,
                title: "Better Match Quality",
                desc: "AI understands your JD semantically — not just keyword matching. Finds candidates you'd miss.",
              },
              {
                icon: Mail,
                title: "Personalized Outreach",
                desc: "Each email references the candidate's actual background. No more generic templates.",
              },
              {
                icon: DollarSign,
                title: "10x Cheaper Than Agencies",
                desc: "Recruiting agencies charge 15-25% of salary. Hirelix costs less than a nice dinner.",
              },
              {
                icon: Users,
                title: "270M+ Profiles",
                desc: "Access the same data that enterprise tools use — without the enterprise price tag.",
              },
              {
                icon: Zap,
                title: "Built for Tech Hiring",
                desc: "Optimized for engineering roles. Understands tech stacks, GitHub contributions, and more.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-background p-6 transition-colors hover:border-primary/20"
              >
                <feature.icon className="mb-3 h-6 w-6 text-primary-light" />
                <h3 className="mb-1.5 text-lg font-semibold">
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
      <section className="border-t border-border py-20 sm:py-28">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              The Old Way vs. Hirelix
            </h2>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {/* Old Way */}
            <div className="rounded-2xl border border-border bg-card p-8">
              <h3 className="mb-6 text-lg font-semibold text-red-400">
                Without Hirelix
              </h3>
              {[
                "Open LinkedIn, Apollo, GitHub separately",
                "Manually search with different keywords",
                "Copy-paste profiles into spreadsheets",
                "Write generic outreach emails one by one",
                "Spend 3-4 hours per role",
              ].map((item) => (
                <div key={item} className="mb-3 flex items-start gap-3">
                  <span className="mt-0.5 text-red-400/60">✕</span>
                  <span className="text-sm text-muted">{item}</span>
                </div>
              ))}
            </div>

            {/* Hirelix */}
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-8">
              <h3 className="mb-6 text-lg font-semibold text-primary-light">
                With Hirelix
              </h3>
              {[
                "Paste JD once, agent handles everything",
                "AI understands role requirements semantically",
                "Get ranked shortlist with match scores",
                "Personalized emails referencing each profile",
                "Done in under 5 minutes",
              ].map((item) => (
                <div key={item} className="mb-3 flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-light" />
                  <span className="text-sm text-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Preview */}
      <section className="border-t border-border bg-card/50 py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple Pricing
          </h2>
          <p className="mt-4 text-lg text-muted">
            Free during beta. Plans starting at $49/mo after launch.
          </p>

          <div className="mx-auto mt-12 max-w-md rounded-2xl border border-primary/30 bg-background p-8">
            <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary-light">
              EARLY ACCESS
            </div>
            <div className="mt-4 text-5xl font-extrabold">
              $0
              <span className="text-lg font-normal text-muted">/mo</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              Free while in beta. Lock in early-bird pricing later.
            </p>
            <ul className="mt-6 space-y-3 text-left text-sm">
              {[
                "Unlimited JD searches",
                "Top 10 candidate shortlists",
                "Verified email addresses",
                "Personalized outreach drafts",
                "GitHub profile analysis",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-primary-light" />
                  {item}
                </li>
              ))}
            </ul>
            <a
              href="#waitlist"
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-base font-semibold text-white transition-colors hover:bg-primary-light"
            >
              Join the Waitlist <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Waitlist CTA */}
      <section
        id="waitlist"
        className="border-t border-border py-20 sm:py-28"
      >
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Be the First to Try Hirelix
          </h2>
          <p className="mt-4 text-lg text-muted">
            Join the waitlist and get early access when we launch. No spam, ever.
          </p>

          <WaitlistForm />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-sm text-muted sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary-light" />
            <span className="font-semibold text-foreground">Hirelix</span>
          </div>
          <p>&copy; {new Date().getFullYear()} Hirelix. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
