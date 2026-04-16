export const sampleJd = `Senior Software Engineer

We are hiring a Senior Software Engineer to build product and platform systems for a fast-growing B2B SaaS company.

Requirements:
- 5+ years of software engineering experience
- Strong experience building backend services, APIs, and production systems
- Comfortable working across cloud infrastructure, data flows, and product collaboration
- Experience shipping reliable features end-to-end in fast-moving teams
- Bonus: distributed systems, observability, or developer tooling experience

Nice to have:
- Experience working in startups
- Familiarity with AWS, PostgreSQL, and event-driven architectures`;

export const candidateRows = [
  {
    initials: "JL",
    name: "James Liu",
    role: "Senior Software Engineer at Shopify",
    location: "New York City Metropolitan Area",
    fitLabel: "Strong fit",
    actionLabel: "Ready to reach out",
    score: 88,
    matched: ["APIs", "Distributed Systems", "AWS"],
    constraintChecks: [
      { label: "Backend depth", verdict: "Strong" },
      { label: "Product pace", verdict: "Strong" },
      { label: "Cloud systems", verdict: "Strong" },
      { label: "Startup signal", verdict: "Moderate" },
    ],
    matchReasons: [
      "Built merchant-facing APIs and backend platform systems at Shopify, directly matching the JD's API and production-systems requirement.",
      "Shows real distributed-systems ownership in a fast-moving product org, which maps well to the role's end-to-end shipping expectation.",
      "AWS and reliability-heavy platform work make him unusually credible for a shortlist-first outbound pass.",
    ],
    riskReasons: [
      "No public signal yet on willingness to move into a smaller team environment.",
    ],
    recentExperience: [
      "Senior Software Engineer, Shopify: built internal platform APIs used by multiple product teams.",
      "Software Engineer, Shopify: owned reliability improvements for high-volume backend services.",
    ],
    email: "james.liu@shopify-example.com",
    linkedinUrl: "https://www.linkedin.com/in/james-liu-platform",
    linkedinDraft:
      "Hi James, your platform work at Shopify looks unusually close to what this team needs. You have built APIs and platform systems at real scale, which is exactly why I wanted to reach out. Open to a quick conversation?",
    emailDraft:
      "Hi James, I came across your work building APIs and platform systems at Shopify and thought it was one of the closest fits I have seen for this backend role. The team needs someone who is comfortable with production systems, cloud infrastructure, and shipping reliably across product and platform. If you are open to it, I would love to share a little more context.",
    emailSubject: "James, quick question about your Shopify platform work",
  },
  {
    initials: "AN",
    name: "Anika Nair",
    role: "Staff Software Engineer at Atlassian",
    location: "San Francisco Bay Area",
    fitLabel: "Viable fit",
    actionLabel: "Needs founder check",
    score: 79,
    matched: ["Platform", "PostgreSQL"],
    constraintChecks: [
      { label: "Backend depth", verdict: "Strong" },
      { label: "Cross-functional", verdict: "Strong" },
      { label: "Seniority", verdict: "High" },
      { label: "Stage fit", verdict: "Needs review" },
    ],
    matchReasons: [
      "Led platform work that spans product systems, data storage, and reliability, which lines up with the JD's backend-plus-product shape.",
      "PostgreSQL and platform ownership suggest strong judgment, especially for teams that need someone to stabilize systems quickly.",
      "A good candidate when the role values technical range more than narrow title matching.",
    ],
    riskReasons: [
      "Staff-level profile may be over-scoped for a role that still looks hands-on and execution heavy.",
      "Larger-company background raises a real question about startup pace and ambiguity tolerance.",
    ],
    recentExperience: [
      "Staff Software Engineer, Atlassian: led platform initiatives across shared backend services.",
      "Senior Engineer, Atlassian: worked on PostgreSQL-backed systems and cross-team infrastructure projects.",
    ],
    email: "anika.nair@atlassian-example.com",
    linkedinUrl: "https://www.linkedin.com/in/anika-nair-platform",
    linkedinDraft:
      "Hi Anika, your platform engineering work at Atlassian stood out right away. This role needs someone who can move across product systems, backend reliability, and data-heavy infrastructure without losing execution speed.",
    emailDraft:
      "Hi Anika, I saw your background leading platform work at Atlassian and thought the overlap here was strong. The team is hiring for someone who can work across backend systems, platform reliability, and product-facing execution, and your profile looked unusually relevant. If you are open, I can send a few details and let you decide whether it is worth exploring.",
    emailSubject: "Anika, your Atlassian platform background looks highly relevant",
  },
  {
    initials: "MR",
    name: "Marco Rossi",
    role: "Senior Backend Engineer at Datadog",
    location: "Austin, Texas",
    fitLabel: "Risky fit",
    actionLabel: "Hold for now",
    score: 72,
    matched: ["TypeScript", "Cloud Infrastructure"],
    constraintChecks: [
      { label: "Backend depth", verdict: "Strong" },
      { label: "Observability", verdict: "Strong" },
      { label: "Location", verdict: "Unknown" },
      { label: "Product fit", verdict: "Moderate" },
    ],
    matchReasons: [
      "Datadog backend and observability work makes him believable for production-systems ownership from day one.",
      "TypeScript service experience gives him a practical path into the stack described in the JD.",
      "Worth keeping in the pool because the technical floor is real even if overall fit is not as clean.",
    ],
    riskReasons: [
      "Location signal is outside the target market shown in the sample role.",
      "Observability-heavy background may translate less well if the team needs broader product system ownership.",
    ],
    recentExperience: [
      "Senior Backend Engineer, Datadog: shipped backend services for observability workflows.",
      "Backend Engineer, growth-stage SaaS team: maintained TypeScript services and cloud infrastructure.",
    ],
    email: "marco.rossi@datadog-example.com",
    linkedinUrl: "https://www.linkedin.com/in/marco-rossi-backend",
    linkedinDraft:
      "Hi Marco, your backend and cloud infrastructure work at Datadog looks very aligned with this role. They need someone strong in production systems, reliable services, and API-heavy backend work, so I wanted to reach out directly.",
    emailDraft:
      "Hi Marco, your mix of backend, cloud infrastructure, and production systems experience at Datadog caught my attention because it maps closely to what this team is hiring for. The role is hands-on, API-heavy, and needs someone comfortable with reliability and scale. Happy to send more context if it sounds potentially relevant.",
    emailSubject: "Marco, quick question about your Datadog backend work",
  },
];

export const heroSearchStats = [
  { label: "Profiles scanned", value: "2,500+" },
  { label: "Deep review", value: "250+" },
  { label: "Outreach drafts", value: "Ready to send" },
];

export const outreachChannels = [
  {
    label: "LinkedIn InMail",
    eyebrow: "Send via LinkedIn",
    cta: "Send LinkedIn InMail",
  },
  {
    label: "Email Outreach",
    eyebrow: "Send via email",
    cta: "Send Email Outreach",
  },
];

export const billingFaqs = [
  {
    title: "Do subscriptions renew automatically?",
    body: "Yes. Pro Monthly and Pro Annual renew automatically until you cancel.",
  },
  {
    title: "How do I cancel?",
    body: "You can cancel from billing settings or by emailing support@hirelix.online. Unless required by law, cancellation takes effect at the end of the current billing period.",
  },
  {
    title: "How do refunds work?",
    body: "Purchases made through Paddle are refundable within 14 days of the transaction date. For subscriptions, this applies within 14 days of the initial purchase or the most recent renewal.",
  },
  {
    title: "Do I need a card to start?",
    body: "No. The Free plan gives you 1 high-conviction shortlist per month before you upgrade.",
  },
];

export const legalLinks = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/refund-policy", label: "Refund Policy" },
  { href: "/contact", label: "Contact" },
];
