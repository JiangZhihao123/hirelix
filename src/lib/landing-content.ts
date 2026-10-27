import { AGENT_PLAN } from "./agent-plan";

export const firstAssignmentPrompt = "Save the role and candidate profiles I attach, compare them against the client brief, and recommend whom I should speak with first. Explain the key trade-offs and what I still need to confirm. Keep the work internal.";

export const mailboxAvailability =
  "Connected-mailbox sending requires your explicit authorization. Gmail inbox reading is not currently available. Outlook access depends on granted permissions and the provider’s account restrictions. You can also paste an email or upload it as a PDF or text file for analysis.";

export const landingFaqs = [
  [
    "What is Hirelix?",
    "Hirelix is a personal AI agent for headhunters, designed to work with you over time. It builds on the candidate records, resumes, notes, client briefs, and preferences you save, helping you continue your work from one conversation and role to the next.",
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
