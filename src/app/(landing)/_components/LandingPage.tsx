"use client";

import { useRef, useState, useSyncExternalStore, type MouseEvent } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Play,
  Plus,
  FileText,
  ShieldCheck,
  Download,
  MessageSquare,
} from "lucide-react";
import {
  buildAttributionQuery,
  getAnalyticsContextFromBrowser,
  trackEvent,
  ANALYTICS_EVENTS,
} from "@/lib/analytics";
import "../landing.css";
import { BrandMark as AgentMark } from "@/components/BrandMark";
import { AGENT_PLAN } from "@/lib/agent-plan";
import { landingFaqs as faqs, firstAssignmentPrompt } from "@/lib/landing-content";

// Video controls need their client handlers; navigation links work without them.
const subscribeToHydration = () => () => {};

export default function LandingPage({ attributionQuery }: { attributionQuery: string }) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const film = useRef<HTMLVideoElement>(null);
  const [filmStarted, setFilmStarted] = useState(false);
  const [filmError, setFilmError] = useState(false);

  function entryHref(signIn = false, plan?: string, prompt?: string) {
    const query = new URLSearchParams(attributionQuery);
    query.set("intent_path", "signin");
    query.set("page_variant", "personal-agent");
    query.set("entry", signIn ? "signin" : "free_trial");
    if (plan) query.set("plan", plan);
    const assignment = prompt;
    if (assignment) query.set("prompt", assignment);
    return `/app?${query.toString()}`;
  }

  function enter(event: MouseEvent<HTMLAnchorElement>, source: string, signIn = false, plan?: string, prompt?: string) {
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
      cta_label: event.currentTarget.innerText.trim(),
    });
    void window.__hirelixGrowthTrack?.("personal_agent_cta_click", {
      cta_location: source,
      destination: "/app",
    });
    if (plan) query.set("plan", plan);
    const assignment = prompt;
    if (assignment) query.set("prompt", assignment);
    if (!signIn) query.set("entry", "free_trial");
    // Keep native navigation, including modified clicks and new tabs. If the
    // analytics enhancement fails, the server-rendered href still works.
    event.currentTarget.href = `/app?${query.toString()}`;
  }

  async function playFilm() {
    const video = film.current;
    if (!video) return;
    setFilmError(false);
    video.scrollIntoView({ block: "center", behavior: "instant" });
    try {
      await video.play();
      setFilmStarted(true);
      video.focus();
    } catch {
      setFilmError(true);
    }
  }

  return (
    <div className="ha-landing">
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
            <a href="#how-it-works">The work you get</a>
            <a href="#first-assignment">Try it with your work</a>
            <a href="#pricing">Pricing</a>
            <a href="#questions">FAQs</a>
          </div>
          <div className="ha-nav-actions">
            <a
              href={entryHref(true)}
              className="ha-signin"
              onClick={(event) => enter(event, "nav_signin", true)}
            >
              Sign in
            </a>
            <a
              href={entryHref()}
              className="ha-button ha-button-small"
              data-testid="nav-primary-cta"
              onClick={(event) => enter(event, "nav")}
            >
              Start free trial <ArrowUpRight size={15} />
            </a>
          </div>
        </nav>
      </header>
      <main id="main">
        <section className="ha-hero ha-wrap" data-growth-section="hero">
          <div className="ha-hero-copy">
            <p className="ha-eyebrow">HIRELIX — YOUR AI RECRUITING PARTNER</p>
            <h1>
              5 minutes to your first shortlist.
              <span>100 jobs later, it still knows how you work.</span>
            </h1>
            <p className="ha-lead">
              Drop in a JD. Your AI partner finds candidates, reviews resumes,
              and prepares client submissions — remembering your client
              preferences, notes, and past searches along the way.
            </p>
            <div className="ha-hero-actions">
              <a
                href={entryHref()}
                className="ha-button"
                data-testid="hero-primary-cta"
                onClick={(event) => enter(event, "hero")}
              >
                Find Your First Candidates <ArrowUpRight size={18} />
              </a>
              <button
                disabled={!hydrated}
                className="ha-text-link ha-watch"
                onClick={playFilm}
              >
                <Play size={15} /> Watch the 35-second story
              </button>
            </div>
            <p className="ha-hero-caption">
              {AGENT_PLAN.trialDays} days · {AGENT_PLAN.trialCredits} AI credits · No card required
            </p>
          </div>
          <figure className="ha-film" id="story">
            <div className="ha-film-player">
              <video
                ref={film}
                poster="/landing/video/hirelix-launch-cover.png"
                preload="none"
                playsInline
                controls={filmStarted}
                tabIndex={0}
                aria-label="Hirelix: your AI recruiting partner"
                aria-describedby="film-description"
                onPlay={() => setFilmStarted(true)}
                onError={() => setFilmError(true)}
              >
                <source src="/landing/video/hirelix-launch-web.mp4" type="video/mp4" />
                {/* Source load failures fire on <source>; the last one failing means none could play. */}
                <source
                  src="/landing/video/hirelix-launch-web.webm"
                  type="video/webm"
                  onError={() => setFilmError(true)}
                />
              </video>
              {!filmStarted && (
                <button
                  disabled={!hydrated}
                  className="ha-film-play"
                  onClick={playFilm}
                  aria-label="Play the Hirelix story with sound"
                >
                  <span>
                    <Play size={20} fill="currentColor" />
                  </span>{" "}
                  Watch the story <small>0:35 · Sound on</small>
                </button>
              )}
            </div>
            {filmError && (
              <p role="alert">
                The video could not play.{" "}
                <a href="/landing/video/hirelix-launch-web.mp4">
                  Open the video directly
                </a>
                , or read the story below.
              </p>
            )}
            <figcaption>
              <span>
                One JD. A shortlist. A partner who remembers your client.
              </span>
              <span>Illustrative story · Fictional people &amp; client</span>
            </figcaption>
            <details className="ha-film-transcript">
              <summary>Read the story</summary>
              <p id="film-description">
                A headhunter hands Hirelix one JD: a Senior Backend Engineer
                role at Halden Pay. The agent researches public sources and
                returns four sample candidates, each linked to the sources
                behind the match. The headhunter asks it to prioritize payments
                experience; it re-checks the sources and moves Priya Nair and
                Sofia Lindqvist up. Later, a new Staff Platform Engineer role
                arrives from the same client. The agent uses the client’s earlier
                preferences, saved call notes, and past feedback to prepare a
                recommendation for Priya, with availability still to confirm.
                Find candidates faster. Keep the partner who knows your work.
              </p>
            </details>
          </figure>
          <p className="ha-audience">
            For independent headhunters and boutique search consultants across the US and Canada.
          </p>
        </section>

        <section
          id="how-it-works"
          className="ha-section ha-delivery"
          data-growth-section="how-it-works"
        >
          <div className="ha-wrap ha-delivery-grid">
            <div className="ha-delivery-copy">
              <p className="ha-eyebrow">FROM CONTEXT TO CLIENT WORK</p>
              <h2>A recommendation you can put in front of a client.</h2>
              <p>
                The reasoning, the selected resumes, and the questions still
                worth asking. Prepared around the role, using the materials you
                bring.
              </p>
              <ul className="ha-delivery-points">
                <li>
                  <span>01</span>
                  <div>
                    <strong>The case for each person</strong>
                    <p>
                      Relevant experience, supporting evidence, and clear
                      trade-offs.
                    </p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <strong>The materials together</strong>
                    <p>
                      A recommendation page and the resumes you choose to
                      include.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <strong>A way to keep moving</strong>
                    <p>
                      Open questions and client feedback tied to each candidate.
                    </p>
                  </div>
                </li>
              </ul>
              <p className="ha-delivery-note">
                Edit the work. Share a link or export the materials. You decide
                what goes to your client.
              </p>
            </div>
            <article
              className="ha-sample"
              aria-label="Illustrative client recommendation"
            >
              <div className="ha-sample-top">
                <AgentMark small />
                <span>CLIENT RECOMMENDATION</span>
                <span>EXAMPLE</span>
              </div>
              <p className="ha-mini-label">NORTHSTAR · HEAD OF PRODUCT</p>
              <h3>A team builder for your next stage.</h3>
              <div className="ha-sample-person">
                <span className="ha-avatar">MC</span>
                <div>
                  <strong>Mira Chen</strong>
                  <span>Product leader · B2B software</span>
                </div>
              </div>
              <p>
                Mira is worth a conversation for Northstar’s Head of Product
                role. Her experience growing a product team speaks directly to
                your need for a leader who can build the organization.
              </p>
              <blockquote>
                Built the product team from 6 to 28.
                <cite>Source: September conversation notes</cite>
              </blockquote>
              <p className="ha-sample-caution">
                To confirm: current interest, availability, and the scope of her
                leadership.
              </p>
              <details
                className="ha-sample-details"
                onToggle={(event) => {
                  if (event.currentTarget.open)
                    void window.__hirelixGrowthTrack?.("sample_view", {
                      sample_type: "client_recommendation",
                    });
                }}
              >
                <summary>
                  Read the complete example <Plus size={17} />
                </summary>
                <div className="ha-sample-expanded">
                  <p className="ha-sample-caution">
                    Complete fictional example. The brief, resume, notes, and
                    feedback below were written to illustrate the work; they are
                    not a live Agent result.
                  </p>
                  <h4>The client brief</h4>
                  <p>
                    Northstar is a growth-stage B2B software company hiring a
                    hands-on Head of Product. The brief calls for someone who
                    can develop product managers, establish clearer priorities,
                    and work with enterprise customers.
                  </p>
                  <h4>Why revisit Mira now</h4>
                  <p>
                    In September, Mira said she would consider a move in
                    November. That timing made an immediate approach premature.
                    A November brief now gives the recruiter a reason to
                    reconnect, using the earlier conversation rather than
                    starting again. It does not establish that she is currently
                    available.
                  </p>
                  <h4>Why this role</h4>
                  <p>
                    Northstar needs someone who can develop its product team as
                    the business grows. Mira’s B2B software background and
                    team-building experience make her relevant to that brief.
                  </p>
                  <p>
                    Her resume describes managing product managers and
                    introducing planning and coaching routines. Combined with
                    the team-growth discussion, this supports exploring
                    Northstar’s team-building requirement. Enterprise-customer
                    exposure is relevant, but the materials do not establish the
                    scale of accounts she personally owned.
                  </p>
                  <h4>Evidence and limits</h4>
                  <p>
                    In the September conversation, Mira described growing the
                    team from 6 to 28. That is a useful starting point, but it
                    does not by itself establish her impact on retention,
                    product quality, or business results. Those outcomes need
                    checking.
                  </p>
                  <h4>Recommended next step</h4>
                  <p>
                    Reconnect with Mira to confirm her interest, then explore a
                    client conversation if the scope fits. Position her as a
                    team-building candidate worth investigating, with enterprise
                    depth and business outcomes still to verify.
                  </p>
                  <h4>Questions for the next conversation</h4>
                  <ul>
                    <li>
                      Which hiring and team-development decisions did she own?
                    </li>
                    <li>
                      What changed in the team’s delivery and business results
                      as it grew?
                    </li>
                    <li>
                      Is she still open to a move, and does Northstar’s scope
                      fit what she wants next?
                    </li>
                  </ul>
                  <details className="ha-resume">
                    <summary>
                      <FileText size={16} /> Selected resume · Mira Chen{" "}
                      <Plus size={15} />
                    </summary>
                    <div>
                      <p className="ha-mini-label">FICTIONAL SAMPLE RESUME</p>
                      <h4>Mira Chen</h4>
                      <p>
                        Product leader · B2B software · San Francisco Bay Area
                      </p>
                      <h4>Profile</h4>
                      <p>
                        Product leader with experience developing product
                        managers, organizing cross-functional planning, and
                        translating customer needs into priorities for B2B
                        software teams.
                      </p>
                      <h4>Professional experience</h4>
                      <p>
                        <strong>
                          Harborlane Software · Director of Product
                        </strong>
                        <br />
                        2020–present · B2B workflow software
                      </p>
                      <ul>
                        <li>
                          Lead product managers working with engineering and
                          design on workflow and reporting products.
                        </li>
                        <li>
                          Introduced regular product reviews, manager coaching,
                          and a shared quarterly planning process as the
                          organization grew.
                        </li>
                        <li>
                          Partner with sales and customer success on enterprise
                          discovery, separating individual account requests from
                          broader product needs.
                        </li>
                      </ul>
                      <p>
                        <strong>Westbridge Cloud · Product Manager</strong>
                        <br />
                        2015–2020 · Business collaboration software
                      </p>
                      <ul>
                        <li>
                          Owned discovery and delivery for team collaboration
                          features, working with engineering and design.
                        </li>
                        <li>
                          Conducted customer interviews and used support themes
                          and product usage to inform roadmap decisions.
                        </li>
                        <li>
                          Coordinated launches with customer success and
                          documented product decisions for internal teams.
                        </li>
                      </ul>
                      <h4>Education</h4>
                      <p>BS, Information Systems · 2014</p>
                      <h4>Areas of experience</h4>
                      <p>
                        Product strategy · Team development · Customer discovery
                        · Roadmap planning · Cross-functional leadership
                      </p>
                      <p className="ha-sample-caution">
                        All details in this sample are fictional. The “6 to 28”
                        figure and November timing come from the separate
                        September conversation notes, not this resume. Neither
                        has been independently verified.
                      </p>
                    </div>
                  </details>
                  <h4>Feedback on Mira</h4>
                  <blockquote>
                    “The team-building experience is relevant. Before we meet,
                    could you clarify her direct responsibility for enterprise
                    customers?”
                    <cite>Illustrative client feedback · Mira / Northstar</cite>
                  </blockquote>
                  <p>
                    <strong>Follow-up:</strong> Ask Mira for a specific
                    enterprise-customer example and her role in the decision.
                    Keep that answer attached to this role’s assessment; the
                    client’s interest is not an interview booking.
                  </p>
                  <p>
                    Clients can respond to each candidate separately on a shared
                    recommendation. Feedback is private to the recruiter; an
                    interview request does not book an interview.
                  </p>
                  <p className="ha-sample-caution">
                    This public example does not collect or send feedback.
                  </p>
                  <Link
                    className="ha-text-link"
                    href="/guides/candidate-feedback"
                  >
                    How client feedback works <ArrowRight size={14} />
                  </Link>
                </div>
              </details>
              <p className="ha-sample-disclaimer">
                Illustrative content, not a live client submission.
                <br />
                Mira and Northstar are fictional.
              </p>
            </article>
          </div>
        </section>

        <section
          id="first-assignment"
          className="ha-section ha-first"
          data-growth-section="get-started"
        >
          <div className="ha-wrap ha-first-grid">
            <div>
              <p className="ha-eyebrow">YOUR FIRST ASSIGNMENT</p>
              <h2>
                A real role.
                <br />
                The people you know.
                <br />
                <span>Start there.</span>
              </h2>
              <p>
                Bring a search you are working on. Start with one resume if
                that is what you have; add other candidates or notes as you go.
              </p>
              <a
                href={entryHref(false, undefined, firstAssignmentPrompt)}
                data-testid="first-assignment-cta"
                className="ha-button"
                onClick={(event) => enter(event, "first_assignment", false, undefined, firstAssignmentPrompt)}
              >
                Start free trial <ArrowUpRight size={18} />
              </a>
              <p className="ha-hero-caption">
                {AGENT_PLAN.trialDays} days · {AGENT_PLAN.trialCredits} AI
                credits · No card required
              </p>
            </div>
            <div className="ha-assignment">
              <p className="ha-mini-label">BRING YOUR OWN MATERIALS</p>
              <div className="ha-attachments">
                <span>
                  <FileText size={16} /> Role brief
                </span>
                <span>
                  <FileText size={16} /> Candidate resumes
                </span>
              </div>
              <blockquote>
                “Compare these candidates against this role. Explain who I
                should put forward and what I still need to confirm.”
              </blockquote>
              <div className="ha-assignment-result">
                <AgentMark small />
                <p>
                  Start with an evidence-based comparison. Then ask your agent
                  to prepare a recommendation for the people you choose.
                </p>
              </div>
              <Link
                href="/guides/candidate-submissions"
                className="ha-text-link"
              >
                How recommendations work <ArrowRight size={15} />
              </Link>
            </div>
          </div>
        </section>

        <section
          id="your-work"
          className="ha-section ha-continuity"
          data-growth-section="your-work"
        >
          <div className="ha-wrap ha-continuity-grid">
            <div>
              <p className="ha-eyebrow">WITH YOU BEYOND THIS ROLE</p>
              <h2>
                The next conversation
                <br />
                starts with context.
              </h2>
            </div>
            <div>
              <p>
                Your saved resumes, call notes, role requirements, and client
                feedback stay available for the next piece of work.
              </p>
              <p>
                When a new brief arrives or a client changes direction, your
                agent can use those records. You can keep working without
                starting the story over.
              </p>
            </div>
          </div>
        </section>

        <section className="ha-control" data-growth-section="control">
          <div className="ha-wrap ha-control-grid">
            <article>
              <ShieldCheck />
              <h3>You decide what gets shared.</h3>
              <p>
                Preparing a recommendation does not send it. Sending through a
                connected mailbox requires your explicit authorization.
              </p>
            </article>
            <article>
              <MessageSquare />
              <h3>Your judgment stays in the work.</h3>
              <p>
                Add context, correct a detail, or change direction. Keep the
                evidence and unanswered questions in view.
              </p>
            </article>
            <article>
              <Download />
              <h3>Your records stay yours.</h3>
              <p>
                Export saved candidate profiles and records, or delete a
                candidate from your workspace.
              </p>
              <Link href="/privacy">
                Read our privacy policy <ArrowUpRight size={13} />
              </Link>
            </article>
          </div>
        </section>

        <section id="pricing" className="ha-pricing ha-section">
          <p className="ha-eyebrow">ONE PERSONAL AGENT</p>
          <h2>
            Start with your work.
            <br />
            Stay for what you build.
          </h2>
          <p>
            Try it for {AGENT_PLAN.trialDays} days with{" "}
            {AGENT_PLAN.trialCredits} AI credits. No card required.
          </p>
          <div className="ha-pricing-options">
            {[
              {
                code: "agent_monthly",
                amount: AGENT_PLAN.monthlyCents / 100,
                cadence: "month",
                note: "Billed monthly",
              },
              {
                code: "agent_annual",
                amount: AGENT_PLAN.annualCents / 100,
                cadence: "year",
                note: "Save $98 a year",
              },
            ].map((plan) => (
              <article key={plan.code}>
                <h3>{AGENT_PLAN.name}</h3>
                <p className="ha-price">
                  <strong>${plan.amount}</strong> / {plan.cadence}
                </p>
                <p>{plan.note}</p>
                <ul>
                  <li>
                    {AGENT_PLAN.monthlyCredits} AI credits each monthly
                    subscription period
                  </li>
                  <li>Your candidates, roles, and conversation history</li>
                  <li>Resume and CSV imports, recommendations, and exports</li>
                </ul>
                <a
                  href={entryHref(false, plan.code)}
                  className="ha-button ha-button-primary"
                  onClick={(event) => enter(event, "pricing", false, plan.code)}
                >
                  Start free trial <ArrowUpRight size={18} />
                </a>
              </article>
            ))}
          </div>
          <p className="ha-pricing-summary">
            USD, plus applicable tax. Your trial does not automatically become a
            paid plan. Paid subscriptions renew until canceled.
          </p>
          <details className="ha-pricing-details">
            <summary>
              How credits and billing work <Plus size={16} />
            </summary>
            <div className="ha-pricing-terms">
              <h3>Using credits</h3>
              <p>
                AI work uses credits based on the services consumed. Longer or
                more complex work may use more credits. Only completed work is
                charged. System retries, automatic indexing and follow-on
                imports are included.
              </p>
              <h3>Monthly allowances</h3>
              <p>
                Monthly credits reset after a successful renewal. Annual plans
                receive a new allowance each month on the subscription
                anniversary. Shorter months use their last day, and unused
                credits do not roll over.
              </p>
              <h3>After your AI access ends</h3>
              <p>
                Your saved work stays available. Subscribe when you’re ready.
                See our <Link href="/refund-policy">refund policy</Link> for
                refund terms.
              </p>
            </div>
          </details>
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
              Your Personal Agent.
            </h2>
            <p>
              Built for headhunters. With you for the long term.
              <br />
              Start with the work on your desk today.
            </p>
            <a
              href={entryHref()}
              className="ha-button ha-button-light"
              onClick={(event) => enter(event, "footer")}
            >
              Start free trial <ArrowUpRight size={18} />
            </a>
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
          <Link href="/product">Product</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/guides">Guides</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
        </div>
        <small>© {new Date().getFullYear()} Hirelix</small>
      </footer>
    </div>
  );
}
