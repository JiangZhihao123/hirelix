"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import "./landing.css";
import { BrandMark as AgentMark } from "@/components/BrandMark";
import { AGENT_PLAN } from "@/lib/agent-plan";
import { landingFaqs as faqs } from "@/lib/landing-content";

// Keep server-rendered buttons inactive until their handlers are attached.
const subscribeToHydration = () => () => {};

export default function Home() {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const router = useRouter();
  const film = useRef<HTMLVideoElement>(null);
  const [filmStarted, setFilmStarted] = useState(false);
  const [filmError, setFilmError] = useState(false);

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
            <p className="ha-eyebrow">WITH YOU FOR THE LONG TERM</p>
            <h1>
              Your Personal Agent.
              <br />
              <span>Built for headhunters.</span>
            </h1>
            <p className="ha-lead">
              Work with your candidates, client briefs, and conversation notes —
              <br className="ha-desktop-break" /> and pick up where you left
              off.
            </p>
            <div className="ha-hero-actions">
              <button
                disabled={!hydrated}
                className="ha-button"
                data-testid="hero-primary-cta"
                onClick={() => enter("hero")}
              >
                Start free trial <ArrowUpRight size={18} />
              </button>
              <button
                disabled={!hydrated}
                className="ha-text-link ha-watch"
                onClick={playFilm}
              >
                <Play size={15} /> Watch the 31-second story
              </button>
            </div>
            <p className="ha-hero-caption">
              {AGENT_PLAN.trialDays} days · {AGENT_PLAN.trialCredits} AI credits
              · No card required
            </p>
          </div>
          <figure className="ha-film" id="story">
            <div className="ha-film-player">
              <video
                ref={film}
                poster="/landing/video/hirelix-headhunters-v3.3.jpg"
                src="/landing/video/hirelix-headhunters-v3.3.mp4"
                preload="none"
                playsInline
                controls={filmStarted}
                tabIndex={0}
                aria-label="Hirelix: a Personal Agent built for headhunters"
                aria-describedby="film-description"
                onPlay={() => setFilmStarted(true)}
                onError={() => setFilmError(true)}
              />
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
                  Watch the story <small>0:31 · Sound on</small>
                </button>
              )}
            </div>
            {filmError && (
              <p role="alert">
                The video could not play.{" "}
                <a href="/landing/video/hirelix-headhunters-v3.3.mp4">
                  Open the video directly
                </a>
                , or read the story below.
              </p>
            )}
            <figcaption>
              <span>
                A relationship. A new role. The context that connects them.
              </span>
              <span>Illustrative story · Fictional people &amp; client</span>
            </figcaption>
            <details className="ha-film-transcript">
              <summary>Read the story</summary>
              <p id="film-description">
                In September, a headhunter saves notes about Mira Chen: she
                built a product team from 6 to 28 and may consider a move in
                November. Six weeks later, a new Head of Product brief arrives.
                The agent brings Mira back into view using those saved notes,
                then helps prepare a recommendation, a selected resume, and
                questions for the next conversation. Her current availability
                still needs confirming. Your Personal Agent. Built for
                headhunters. With you for the long term.
              </p>
            </details>
          </figure>
          <p className="ha-audience">
            For independent headhunters and boutique search consultants.
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
                  <h4>Why this role</h4>
                  <p>
                    Northstar needs someone who can develop its product team as
                    the business grows. Mira’s B2B software background and
                    team-building experience make her relevant to that brief.
                  </p>
                  <h4>Evidence and limits</h4>
                  <p>
                    In the September conversation, Mira described growing the
                    team from 6 to 28. That is a useful starting point, but it
                    does not by itself establish her impact on retention,
                    product quality, or business results. Those outcomes need
                    checking.
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
                      <p className="ha-mini-label">FICTIONAL RESUME EXCERPT</p>
                      <h4>Mira Chen · Product leader</h4>
                      <p>
                        B2B software product leadership. Experience building a
                        product organization and developing its team.
                      </p>
                      <p>
                        This shortened sample illustrates where a selected
                        resume appears. In a shared recommendation, clients can
                        download the original resume you include.
                      </p>
                    </div>
                  </details>
                  <h4>Feedback on Mira</h4>
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
                One role.
                <br />
                Two or three resumes.
                <br />
                <span>Start there.</span>
              </h2>
              <p>
                No need to organize your entire candidate pool first. Bring a
                real piece of work and see how your agent helps.
              </p>
              <button
                className="ha-button"
                disabled={!hydrated}
                onClick={() => enter("first_assignment")}
              >
                Start free trial <ArrowUpRight size={18} />
              </button>
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
                  <FileText size={16} /> 2–3 resumes
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
                <button
                  className="ha-button ha-button-primary"
                  disabled={!hydrated}
                  onClick={() => enter("pricing", false, plan.code)}
                >
                  Start free trial <ArrowUpRight size={18} />
                </button>
              </article>
            ))}
          </div>
          <p className="ha-pricing-terms">
            USD, plus applicable tax. Subscribe when you’re ready; your trial
            does not automatically become a paid plan. Subscriptions renew until
            canceled. AI work uses credits based on the services consumed.
            Longer or more complex work may use more credits. Only completed
            work is charged. System retries, automatic indexing and follow-on
            imports are included. Monthly credits reset after a successful
            renewal. Annual plans receive a new allowance each month on the
            subscription anniversary. Shorter months use their last day, and
            unused credits do not roll over. Your saved work stays available
            when AI access ends.{" "}
            <Link href="/refund-policy">Refund policy</Link>.
          </p>
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
            <button
              disabled={!hydrated}
              className="ha-button ha-button-light"
              onClick={() => enter("footer")}
            >
              Start free trial <ArrowUpRight size={18} />
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
          <Link href="/product">Product</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/guides/candidate-rediscovery">Guides</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
        </div>
        <small>© {new Date().getFullYear()} Hirelix</small>
      </footer>
    </div>
  );
}
