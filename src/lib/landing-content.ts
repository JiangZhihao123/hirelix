import { AGENT_PLAN } from "./agent-plan";

export const landingFaqs = [
  [
    "What is Hirelix?",
    "Hirelix is a personal AI agent for headhunters, designed to work with you over time. It builds on the candidate records, CVs, notes, client briefs, and preferences you save, helping you continue your work from one conversation and role to the next.",
  ],
  [
    "Does Hirelix find new candidates from external databases?",
    "No. Hirelix works with your own saved candidate pool and the materials you bring. It does not offer paid external candidate sourcing or sell access to a talent database.",
  ],
  [
    "How much does Hirelix cost?",
    `Personal Agent costs $${AGENT_PLAN.monthlyCents / 100} per month or $${AGENT_PLAN.annualCents / 100} per year in USD, plus applicable tax. Both plans include ${AGENT_PLAN.monthlyCredits.toLocaleString("en-US")} AI credits each calendar month. The ${AGENT_PLAN.trialDays}-day trial includes ${AGENT_PLAN.trialCredits} credits and does not require a card or automatically convert to a paid plan.`,
  ],
  [
    "Who is Hirelix for?",
    "Hirelix is built for independent headhunters and consultants at boutique search firms who manage their own candidate relationships, client roles, and submissions.",
  ],
  [
    "Can I bring my existing candidates?",
    "Yes. Upload candidate lists in CSV format or CVs in PDF and DOCX. Tell the assistant what you want to save. It can organize clearly authorized imports and ask you to resolve ambiguous identities or conflicting information.",
  ],
  [
    "Can my assistant remember how I like to work?",
    "You can ask Hirelix to remember an explicit preference, such as the tone of your client recommendations. Review, update, or ask it to forget saved preferences. It uses saved context for relevant work; it does not promise unlimited recall of every detail.",
  ],
  [
    "What carries over between roles?",
    "Saved candidate profiles, original materials, and your recorded conversations remain available for future work. Each role keeps its own requirements and candidate assessments, so a decision for one role does not become a judgment for every role.",
  ],
  [
    "Will the agent contact candidates or clients for me?",
    "Hirelix prepares drafts for you to review, edit, copy, or export. It does not autonomously contact people. Optional Gmail sending requires a connected account with sending permission and your explicit send action.",
  ],
  [
    "Can I export or delete candidate information?",
    "You can export a candidate’s saved profile and records, and delete candidate profiles from your workspace. Read our Privacy Policy for details on how information is handled.",
  ],
];

