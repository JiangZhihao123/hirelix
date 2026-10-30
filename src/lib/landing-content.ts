import { AGENT_PLAN } from "./agent-plan";

export const LANDING_TITLE = `Hirelix | Your AI Recruiting Assistant — $${AGENT_PLAN.monthlyCents / 100}/month`;
export const LANDING_DESCRIPTION = `An AI recruiting assistant for independent headhunters. Delegate recruiting admin, prepare client work, and get time back for $${AGENT_PLAN.monthlyCents / 100}/month. Try it free for ${AGENT_PLAN.trialDays} days.`;

// General administrative support is a salary reference, not a quote for a
// recruiting assistant or a claim that the AI replaces every human duty.
export const assistantSalaryBenchmark = {
  annualUsd: 47540,
  period: "May 2025",
  sourceUrl: "https://www.bls.gov/ooh/office-and-administrative-support/secretaries-and-administrative-assistants.htm#tab-5",
};

export const firstAssignmentPrompt = "Organize the resumes and call notes I attach, save the candidate records, and use the client brief to draft a progress update. Flag missing information and anything that needs my decision. Keep the work internal.";

export const mailboxAvailability =
  "Connected-mailbox sending requires your explicit authorization. Gmail inbox reading is not currently available. Outlook access depends on granted permissions and the provider’s account restrictions. You can also paste an email or upload it as a PDF or text file for analysis.";

export const landingFaqs = [
  [
    "What is Hirelix?",
    `Hirelix is your AI recruiting assistant for $${AGENT_PLAN.monthlyCents / 100}/month. It takes on the preparation and admin around your recruiting work, so you can spend more time with clients and candidates. Delegate work in a conversation, give it the relevant materials, and come back to results you can use and refine.`,
  ],
  [
    "What work can I hand over to my assistant?",
    "Ask Hirelix to organize resumes and call notes into candidate records, prepare questions for a candidate conversation, compare people against a client brief, or draft recommendations, progress updates and follow-up emails. Your saved records and explicit preferences provide context for later work. You decide what is shared or sent.",
  ],
  [
    "How does Hirelix compare with hiring an assistant?",
    "Hirelix gives an independent recruiter help with digital preparation, records and written client work at a monthly software price. A human assistant can also handle phone calls, live coordination and other duties outside Hirelix’s scope. The salary comparison is a U.S. administrative-support benchmark, not a recruiting-assistant quote or a promise of equivalent staffing capacity. Try delegating work you would otherwise do yourself and judge the time it gives back.",
  ],
  [
    "Can Hirelix help me find people on the public web?",
    "Yes. Ask your assistant to research publicly available information for a role. It can explain potential relevance with source links and unresolved questions. Public information may be incomplete, out of date or inaccessible. Hirelix also works with your own saved candidate pool; it does not sell access to a talent database.",
  ],
  [
    "How much does Hirelix cost?",
    `${AGENT_PLAN.name} costs $${AGENT_PLAN.monthlyCents / 100} per month or $${AGENT_PLAN.annualCents / 100} per year in USD, plus applicable tax. Both plans include ${AGENT_PLAN.monthlyCredits.toLocaleString("en-US")} AI credits each monthly subscription period, without rollover. Monthly credits reset after successful renewal; annual credits reset each month on the subscription anniversary, using the last day for shorter months. The ${AGENT_PLAN.trialDays}-day trial includes ${AGENT_PLAN.trialCredits} credits and does not require a card or automatically convert to a paid plan.`,
  ],
  [
    "Who is Hirelix for?",
    "Hirelix is built for independent headhunters and consultants at boutique search firms who manage their own candidate relationships, client roles, and submissions.",
  ],
  [
    "Can I bring my existing candidates?",
    "Yes. Upload candidate lists in CSV, TSV or XLSX format, resumes, or a ZIP of candidate files. Existing lists can give your assistant useful context from the start. Files are limited to 50 MB each. Processing depends on the files and their contents; your assistant reports what was saved and what remains unresolved. Tell the assistant what you want to save. It can organize clearly authorized imports and ask you to resolve ambiguous identities or conflicting information.",
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
    "Hirelix can prepare recommendations and emails for review. Creating a draft does not send it. A connected mailbox and your explicit send authorization are required; provider acceptance does not guarantee delivery to the recipient.",
  ],
  ["Can Hirelix read my Gmail or Outlook inbox?", mailboxAvailability],
  [
    "How do I start with one role and several candidates?",
    "Upload a job description and candidate resumes or a CSV list. Ask Hirelix to save them, compare the candidates against the role, and prepare a recommendation for the people you select. Review the evidence and unresolved questions before sharing. Record client feedback separately for each person, then continue the assignment in the same or a new conversation.",
  ],
  [
    "Is Hirelix an ATS or a candidate database?",
    "Hirelix is a conversational personal AI agent for a headhunter’s work, with private candidate records and research using publicly available information. It keeps the profiles, roles, documents and conversations you save. It is not presented as a replacement for a firm’s ATS, and no automatic ATS synchronization is promised.",
  ],
  [
    "Can I export or delete candidate information?",
    "You can export a candidate’s saved profile and records, and delete candidate profiles from your workspace. Read our Privacy Policy for details on how information is handled.",
  ],
];
