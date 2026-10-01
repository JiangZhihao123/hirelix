"use client";

import { useState, useSyncExternalStore, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowUp,
  Check,
  Plus,
  Paperclip,
  FileText,
  Users,
  BriefcaseBusiness,
  MessageSquare,
  PanelLeft,
  ShieldCheck,
  Download,
  ChevronDown,
} from "lucide-react";
import {
  buildAttributionQuery,
  getAnalyticsContextFromBrowser,
  trackEvent,
  ANALYTICS_EVENTS,
} from "@/lib/analytics";
import { LandingAnalytics } from "./_components/LandingAnalytics";
import "./landing.css";
import { BrandMark as AgentMark } from "@/components/BrandMark";
import { AGENT_PLAN } from "@/lib/agent-plan";
import { landingFaqs as faqs } from "@/lib/landing-content";

const scenarios = [
  {
    label: "Find the right people",
    title: "Start with the people you already know.",
    description:
      "Ask about the candidates in your own pool. Bring their experience, your past conversations, and the role requirements into the same view.",
    prompt:
      "Who in my candidates should I revisit for Northstar’s VP Product role?",
    answer:
      "Priya is worth another conversation. Your notes mention the team-building experience Northstar is looking for.",
    result: "Priya Shah",
    subtitle: "Product leader · In your candidates",
    note: "Built a product team from 4 to 18. Location was the concern in your last conversation; this role offers hybrid working.",
    footnote: "Confirm her current interest and location preferences.",
    source: "Your call notes · Saved CV",
    kind: "person",
  },
  {
    label: "Keep a role moving",
    title: "Pick up where the conversation left off.",
    description:
      "Bring in a client message or a call note. Prepare an update to the role requirements, with the original brief and feedback kept in view.",
    prompt:
      "Northstar now cares more about team building than exact industry experience. Update the brief.",
    answer:
      "I’ve prepared a change to the role brief for you to review. The original JD will be kept.",
    result: "Northstar · VP Product",
    subtitle: "Proposed change · Awaiting your review",
    note: "Prioritize evidence of hiring and developing a product team. Consider adjacent industries when the leadership experience is relevant.",
    footnote: "Review the proposal before saving it to the role.",
    source: "Client feedback · Original role brief",
    kind: "role",
  },
  {
    label: "Prepare client work",
    title: "Turn your assessment into a client draft.",
    description:
      "Prepare a candidate submission around the role, choose the supporting CVs, and refine the draft before you share it with your client.",
    prompt:
      "Draft a recommendation for Priya for Northstar. Focus on her team-building experience.",
    answer:
      "Here’s a client email draft based on the role and your saved records. Please review the details before sharing.",
    result: "Candidate introduction: Priya Shah",
    subtitle: "Client email · Draft",
    note: "Hi Alex, I’d like to introduce Priya for the VP Product role. Her experience building a product team from 4 to 18 is particularly relevant to Northstar’s next stage.",
    footnote: "Edit, copy, or export your draft. You decide when to share.",
    source: "Role requirements · Candidate records",
    kind: "draft",
  },
];


// Keep server-rendered buttons inactive until their handlers are attached.
const subscribeToHydration = () => () => {};

export default function Home() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const router = useRouter();
  const [active, setActive] = useState(0);
  const scene = scenarios[active];

  function enter(source: string, signIn = false, plan?: string) {
    const context = getAnalyticsContextFromBrowser({
      entry_mode: signIn ? "signin" : "free_trial",
      page_variant: "personal-agent",
      intent_path: "signin",
    });
    const query = buildAttributionQuery({
      intentPath: "signin",
      pageVariant: "personal-agent",
      trafficSource: context.traffic_source,
      utmCampaign: context.utm_campaign,
      utmSource: context.utm_source,
      utmMedium: context.utm_medium,
      utmContent: context.utm_content,
      utmTerm: context.utm_term,
      gclid: context.gclid,
      entryMode: signIn ? "signin" : "free_trial",
    });
    trackEvent(ANALYTICS_EVENTS.personalAgentCtaClick, {
      ...context,
      cta_location: source,
      cta_label: signIn ? "Sign in" : "Get started",
    });
    void window.__hirelixGrowthTrack?.("personal_agent_cta_click", {
      cta_location: source,
      destination: "/app",
    });
    if (plan) query.set("plan", plan);
    if (!signIn) query.set("entry", "free_trial");
    router.push(`/app?${query.toString()}`);
  }

  function selectScenario(index: number) {
    setActive(index);
    void window.__hirelixGrowthTrack?.("sample_view", {
      sample_type: "personal_agent",
      scenario: scenarios[index].kind,
    });
  }

  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % scenarios.length;
    else if (event.key === "ArrowLeft")
      next = (index + scenarios.length - 1) % scenarios.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = scenarios.length - 1;
    else return;
    event.preventDefault();
    selectScenario(next);
    document.getElementById(`scenario-tab-${next}`)?.focus();
  }

  return (
    <div className="ha-landing">
      <LandingAnalytics />
      <a className="ha-skip" href="#main">
        Skip to content
      </a>
      <header className="ha-header">
        <nav className="ha-nav ha-wrap" aria-label="Main navigation">
          <Link
            className="ha-logo"
            href="/"
            aria-label="Hirelix home"
            onClick={() => window.scrollTo({ top: 0, behavior: "instant" })}
          >
            <AgentMark small />
            Hirelix
          </Link>
          <div className="ha-nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#your-work">Your workspace</a>
            <a href="#pricing">Pricing</a>
            <a href="#questions">FAQs</a>
          </div>
          <div className="ha-nav-actions">
            <button
              disabled={!hydrated}
              className="ha-signin"
              onClick={() => enter("nav_signin", true)}
            >
              Sign in
            </button>
            <button
              disabled={!hydrated}
              className="ha-button ha-button-small"
              data-testid="nav-primary-cta"
              onClick={() => enter("nav")}
            >
              Get started <ArrowUpRight size={15} />
            </button>
          </div>
        </nav>
      </header>
      <main id="main">
        <section className="ha-hero ha-wrap" data-growth-section="hero">
          <div className="ha-hero-copy">
            <p className="ha-eyebrow">
              <span className="ha-status-dot" /> BUILT AROUND YOUR WORK
            </p>
            <h1>
              Your personal AI agent
              <br className="ha-desktop-break" /> for <span>headhunting.</span>
            </h1>
            <p className="ha-lead">
              Your candidates. Your client roles. Your next move.
              <br className="ha-desktop-break" /> Work with an agent that keeps
              it all in context.
            </p>
            <div className="ha-hero-actions">
              <button
                disabled={!hydrated}
                className="ha-button"
                data-testid="hero-primary-cta"
                onClick={() => enter("hero")}
              >
                Meet your agent <ArrowUpRight size={18} />
              </button>
              <a className="ha-text-link" href="#how-it-works">
                See it at work <ArrowRight size={16} />
              </a>
            </div>
            <p className="ha-hero-caption">
              Bring your experience. Build on it every day.
            </p>
          </div>
          <div className="ha-preview" aria-label="Illustrative agent workspace">
            <div className="ha-preview-top">
              <span>
                <AgentMark small /> My assistant
              </span>
              <span className="ha-example-label">
                PRODUCT WALKTHROUGH · FICTIONAL EXAMPLE
              </span>
              <PanelLeft size={16} />
            </div>
            <div className="ha-preview-body">
              <aside
                className="ha-preview-sidebar"
                aria-label="Example workspace context"
              >
                <p className="ha-mini-label">YOUR WORKSPACE</p>
                <div className="ha-sidebar-item ha-selected">
                  <MessageSquare size={15} /> My assistant
                </div>
                <div className="ha-sidebar-item">
                  <Users size={15} /> Candidates
                </div>
                <div className="ha-sidebar-item">
                  <BriefcaseBusiness size={15} /> Roles
                </div>
                <div className="ha-sidebar-item">
                  <FileText size={15} /> Submissions
                </div>
                <div className="ha-sidebar-rule" />
                <p className="ha-mini-label">IN CONTEXT</p>
                <div className="ha-context-card">
                  <span className="ha-context-icon">N</span>
                  <div>
                    Northstar<span>VP Product</span>
                  </div>
                </div>
                <div className="ha-context-card">
                  <span className="ha-avatar">PS</span>
                  <div>
                    Priya Shah<span>Candidate</span>
                  </div>
                </div>
                <div className="ha-sidebar-bottom">
                  <span className="ha-tiny-dot" /> Your work, connected.
                </div>
              </aside>
              <div className="ha-preview-chat">
                <div className="ha-chat-context">
                  <BriefcaseBusiness size={13} /> Northstar · VP Product{" "}
                  <ChevronDown size={12} />
                </div>
                <div className="ha-user-message">
                  Who in my candidates should I revisit for Northstar’s VP
                  Product role?
                </div>
                <div className="ha-agent-response">
                  <AgentMark small />
                  <div>
                    <p>
                      Start with Priya. Your previous conversations point to the
                      team-building experience Northstar needs.
                    </p>
                    <div className="ha-person-card">
                      <div className="ha-person-heading">
                        <span className="ha-avatar">PS</span>
                        <div>
                          <strong>Priya Shah</strong>
                          <span>Product leader · In your candidates</span>
                        </div>
                        <ArrowUpRight size={16} />
                      </div>
                      <p>
                        Built a product team from 4 to 18. Your last call
                        focused on her interest in a broader leadership role.
                      </p>
                      <div className="ha-source">
                        <FileText size={12} /> Your call notes <span>·</span>{" "}
                        Saved CV
                      </div>
                    </div>
                    <p className="ha-response-note">
                      Her current interest still needs confirming.
                    </p>
                  </div>
                </div>
                <div className="ha-example-composer">
                  <span>Ask about your people or your work…</span>
                  <div>
                    <Paperclip size={16} />
                    <span className="ha-send">
                      <ArrowUp size={15} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="ha-audience">
            <span>MADE FOR THE WAY YOU WORK</span>
            <p>
              Independent headhunters <span>·</span> Boutique search consultants{" "}
              <span>·</span> Your own recruiting desk
            </p>
          </div>
        </section>

        <section
          id="how-it-works"
          className="ha-section ha-work-section"
          data-growth-section="how-it-works"
        >
          <div className="ha-wrap">
            <div className="ha-section-heading">
              <p className="ha-eyebrow">AN AGENT FOR YOUR EVERYDAY WORK</p>
              <h2>What’s on your desk?</h2>
              <p>
                A new brief. A familiar candidate. A client waiting for an
                update.
                <br /> Bring it to your agent and keep the work moving.
              </p>
            </div>
            <div
              className="ha-tabs"
              role="tablist"
              aria-label="Explore agent workflows"
            >
              {scenarios.map((item, index) => (
                <button
                  disabled={!hydrated}
                  key={item.kind}
                  id={`scenario-tab-${index}`}
                  role="tab"
                  aria-selected={active === index}
                  aria-controls="scenario-panel"
                  tabIndex={active === index ? 0 : -1}
                  onKeyDown={(event) => tabKey(event, index)}
                  onClick={() => selectScenario(index)}
                >
                  <span>0{index + 1}</span>
                  {item.label}
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
            <div
              id="scenario-panel"
              role="tabpanel"
              aria-labelledby={`scenario-tab-${active}`}
              className="ha-scenario"
              tabIndex={0}
            >
              <div className="ha-scenario-copy">
                <span className="ha-step">
                  0{active + 1} / YOUR AGENT AT WORK
                </span>
                <h3>{scene.title}</h3>
                <p>{scene.description}</p>
                <div className="ha-work-note">
                  <Check size={16} />
                  <span>Grounded in the records you save.</span>
                </div>
              </div>
              <div className="ha-scenario-demo" key={scene.kind}>
                <p className="ha-mini-label">ILLUSTRATIVE EXAMPLE</p>
                <div className="ha-user-message">{scene.prompt}</div>
                <div className="ha-demo-answer">
                  <AgentMark small />
                  <p>{scene.answer}</p>
                </div>
                <div className="ha-result">
                  <span className="ha-result-type">{scene.subtitle}</span>
                  <h4>{scene.result}</h4>
                  <p>{scene.note}</p>
                  <div className="ha-source">
                    <FileText size={12} />
                    {scene.source}
                  </div>
                </div>
                <p className="ha-demo-footnote">{scene.footnote}</p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="your-work"
          className="ha-section ha-memory-section"
          data-growth-section="your-work"
        >
          <div className="ha-wrap ha-memory-grid">
            <div className="ha-memory-copy">
              <p className="ha-eyebrow">YOUR WORK, OVER TIME</p>
              <h2>
                Ten years of relationships.
                <br />
                <span>Ready for what’s next.</span>
              </h2>
              <p>
                Your candidate pool has a history. Bring in the CVs, lists, and
                notes you’ve collected, then keep adding to them as you work.
              </p>
              <p>
                When the next role comes in, your agent can work with those
                saved records. The conversation starts with what you already
                know.
              </p>
              <a className="ha-text-link" href="#get-started">
                Bring your work to Hirelix <ArrowRight size={16} />
              </a>
            </div>
            <div className="ha-history">
              <div className="ha-history-heading">
                <span className="ha-avatar">PS</span>
                <div>
                  <strong>Priya Shah</strong>
                  <span>A relationship beyond a single role</span>
                </div>
              </div>
              <div className="ha-timeline">
                <div>
                  <span className="ha-timeline-dot" />
                  <p className="ha-mini-label">THE FIRST CONVERSATION</p>
                  <h4>More than a CV.</h4>
                  <p>
                    Save her experience alongside your call notes and
                    observations.
                  </p>
                  <span className="ha-record-chip">
                    <FileText size={12} /> CV + conversation notes
                  </span>
                </div>
                <div>
                  <span className="ha-timeline-dot" />
                  <p className="ha-mini-label">AS THINGS CHANGE</p>
                  <h4>Keep the relationship up to date.</h4>
                  <p>
                    Add a new conversation. Keep the earlier context and its
                    source.
                  </p>
                  <span className="ha-record-chip">
                    <MessageSquare size={12} /> A new note, with its history
                  </span>
                </div>
                <div>
                  <span className="ha-timeline-dot ha-timeline-active" />
                  <p className="ha-mini-label">THE NEXT OPPORTUNITY</p>
                  <h4>A new role. A familiar person.</h4>
                  <p>
                    Revisit her experience against the new brief, with past
                    conversations at hand.
                  </p>
                  <span className="ha-record-chip">
                    <BriefcaseBusiness size={12} /> Northstar · VP Product
                  </span>
                </div>
              </div>
              <p className="ha-example-disclaimer">
                Illustrative timeline. Candidate and company are fictional.
              </p>
            </div>
          </div>
        </section>

        <section
          className="ha-control ha-section"
          data-growth-section="control"
        >
          <div className="ha-wrap">
            <div className="ha-section-heading">
              <p className="ha-eyebrow">YOUR AGENT. YOUR CALL.</p>
              <h2>
                Help with the work.
                <br />
                Control over the decisions.
              </h2>
            </div>
            <div className="ha-control-grid">
              <article>
                <ShieldCheck />
                <h3>Review before saving.</h3>
                <p>
                  Your agent proposes changes to records and role requirements.
                  You review them before they are applied.
                </p>
              </article>
              <article>
                <FileText />
                <h3>Choose what clients see.</h3>
                <p>
                  Review the recommendation, edit the wording, and choose the
                  CVs. Client drafts are yours to share.
                </p>
              </article>
              <article>
                <Download />
                <h3>Keep hold of your records.</h3>
                <p>
                  Export candidate profiles and records, or delete a candidate
                  from your workspace.
                </p>
                <Link href="/privacy">
                  Read our privacy policy <ArrowUpRight size={13} />
                </Link>
              </article>
            </div>
          </div>
        </section>

        <section id="pricing" className="ha-pricing ha-section">
          <p className="ha-eyebrow">ONE PERSONAL AGENT</p>
          <h2>Start with your work.<br />Stay for what you build.</h2>
          <p>Try it for {AGENT_PLAN.trialDays} days with {AGENT_PLAN.trialCredits} AI credits. No card required.</p>
          <div className="ha-pricing-options">
            {([{ code: "agent_monthly", amount: AGENT_PLAN.monthlyCents / 100, cadence: "month", note: "Billed monthly" }, { code: "agent_annual", amount: AGENT_PLAN.annualCents / 100, cadence: "year", note: "Save $98 a year" }]).map(plan => <article key={plan.code}>
              <h3>Personal Agent</h3><p className="ha-price"><strong>${plan.amount}</strong> / {plan.cadence}</p><p>{plan.note}</p>
              <ul><li>{AGENT_PLAN.monthlyCredits} AI credits each calendar month</li><li>Your candidates, roles, and conversation history</li><li>CV and CSV imports, client drafts, and exports</li></ul>
              <button className="ha-button ha-button-primary" disabled={!hydrated} onClick={() => enter("pricing", false, plan.code)}>Start free trial <ArrowUpRight size={18} /></button>
            </article>)}
          </div>
          <p className="ha-pricing-terms">USD, plus applicable tax. Subscribe when you’re ready; your trial does not automatically become a paid plan. Subscriptions renew until canceled. AI work uses credits based on the services consumed. Longer or more complex work may use more credits. Only completed work is charged. System retries, automatic indexing and follow-on imports are included. Paid credits reset monthly (UTC), with no rollover. Your saved work stays available when AI access ends. <Link href="/refund-policy">Refund policy</Link>.</p>
        </section>

        <section
          id="questions"
          className="ha-section ha-faq-section"
          data-growth-section="questions"
        >
          <div className="ha-wrap ha-faq-grid">
            <div>
              <p className="ha-eyebrow">A FEW THINGS TO KNOW</p>
              <h2>
                Before you <br />
                settle in.
              </h2>
              <Link className="ha-text-link" href="/contact">
                Talk to us <ArrowUpRight size={15} />
              </Link>
            </div>
            <div className="ha-faqs">
              {faqs.map(([question, answer]) => (
                <details key={question}>
                  <summary>
                    {question}
                    <Plus size={18} />
                  </summary>
                  <p>
                    {answer}
                    {question ===
                      "Can I export or delete candidate information?" && (
                      <>
                        {" "}
                        <Link href="/privacy">
                          Privacy Policy <ArrowUpRight size={12} />
                        </Link>
                      </>
                    )}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section
          id="get-started"
          className="ha-final-section"
          data-growth-section="get-started"
        >
          <div className="ha-wrap ha-final">
            <AgentMark />
            <p className="ha-eyebrow">MAKE IT YOURS</p>
            <h2>
              Your next role.
              <br />
              Your own AI agent.
            </h2>
            <p>
              Start with a candidate, a client brief, or a question.
              <br />
              Keep building from there.
            </p>
            <button
              disabled={!hydrated}
              className="ha-button ha-button-light"
              onClick={() => enter("footer")}
            >
              Meet your agent <ArrowUpRight size={18} />
            </button>
          </div>
        </section>
      </main>
      <footer className="ha-footer ha-wrap">
        <Link
          className="ha-logo"
          href="/"
          aria-label="Hirelix home"
          onClick={() => window.scrollTo({ top: 0, behavior: "instant" })}
        >
          <AgentMark small />
          Hirelix
        </Link>
        <span>Your personal AI agent for headhunting.</span>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
        </div>
        <small>© {new Date().getFullYear()} Hirelix</small>
      </footer>
    </div>
  );
}
