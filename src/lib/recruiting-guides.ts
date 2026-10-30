type RecruitingGuide = {
  slug: string;
  title: string;
  description: string;
  summary: string;
  updatedOn: string;
  takeaways: readonly string[];
  examplePrompt: string;
  relatedSlugs: readonly string[];
  sections: readonly { title: string; paragraphs: readonly string[] }[];
};

export const recruitingGuides: readonly RecruitingGuide[] = [
  {
    slug: "candidate-rediscovery",
    title: "Candidate rediscovery: reuse your existing talent pool",
    description:
      "How a long-term recruiting assistant helps headhunters revisit saved candidates, past conversations, and new client requirements together.",
    summary:
      "Candidate rediscovery means revisiting people already in your candidate pool when a new role or changed brief makes their experience relevant again. In Hirelix, your assistant works from saved CVs, profiles, and notes so you can build on earlier conversations.",
    updatedOn: "2026-10-30",
    takeaways: [
      "Use the current job description to reassess saved candidates; a previous decision belongs to its original role.",
      "Keep CV evidence and dated conversation notes together, including conflicting or missing facts.",
      "Confirm current interest and availability before presenting historical notes as current information.",
    ],
    examplePrompt:
      "Revisit my saved candidates for the attached role. Compare their experience with the current JD, cite the CVs and dated notes you use, and explain the main trade-offs. Separate historical information from current confirmation. Keep this analysis internal; do not update records or contact anyone.",
    relatedSlugs: ["candidate-jd-comparison", "candidate-import", "candidate-submissions"],
    sections: [
      {
        title: "Keep the relationship, not just the CV",
        paragraphs: [
          "A CV describes experience at a point in time. Your conversations add context: the scope someone wants, the constraints they mentioned, and the questions you still need to ask. Save the original material alongside dated notes so the next brief does not mean starting from scratch.",
          "Tell your assistant what you want recorded. Clear, authorized updates can be saved directly; ambiguous identities or conflicting facts need your input. Asking for analysis alone does not authorize changes to your candidate records.",
        ],
      },
      {
        title: "Give the assistant the current brief",
        paragraphs: [
          "Bring the client’s job description and the requirements that matter now. Ask which saved candidates are worth revisiting and why. Compare concrete experience with the role’s responsibilities and must-have requirements, rather than treating a familiar employer or matching title as proof of fit.",
          "Keep each assessment tied to its role. Someone who was unsuitable for one brief may be a good person to reconsider for another. A past rejection is not a permanent label on the candidate.",
        ],
      },
      {
        title: "Separate past evidence from current availability",
        paragraphs: [
          "A note saying someone was open to a move six months ago is historical evidence, not confirmation that they are available today. Ask the assistant to distinguish what the records support from what you still need to confirm.",
          "For example: ‘Revisit my saved candidates for this VP Product brief. Use their CVs and my notes, explain relevant team-building experience, and list any questions about current interest or location.’ This is an illustrative request, not a claim about a completed search.",
        ],
      },
      {
        title: "Bring the next conversation back",
        paragraphs: [
          "After you reconnect, save the candidate’s latest preferences and any new information. When the client changes the brief, add that feedback to the role. Your assistant can then work with the updated records on the next task.",
          "Hirelix uses the candidate pool and materials you provide. It does not supply a paid external talent database. The value accumulates through the records and context you choose to keep, with you responsible for checking the evidence and making recruiting decisions.",
        ],
      },
    ],
  },
  {
    slug: "candidate-submissions",
    title: "Candidate submissions: a practical template for headhunters",
    description:
      "A practical workflow for headhunters to turn saved candidate evidence and client requirements into a reviewed candidate recommendation.",
    summary:
      "A candidate submission explains why a particular person deserves a client conversation for a particular role. Hirelix helps prepare that draft from your saved candidate profiles, role brief, and source material you authorize, then keeps the work available for revision.",
    updatedOn: "2026-10-30",
    takeaways: [
      "Name the candidate, client and role so the recommendation answers one specific brief.",
      "Support each important claim with a source and label unanswered questions clearly.",
      "Select the client-facing material and CVs deliberately; preparing a submission does not send it.",
    ],
    examplePrompt:
      "Prepare an internal candidate submission for [candidate] and [client / role] using the selected CV and the notes I identify for this audience. Include: role-specific recommendation, relevant evidence, motivation and availability with their dates, material gaps, and questions for a client conversation. Do not invent missing facts, publish a link or send an email.",
    relatedSlugs: ["candidate-jd-comparison", "candidate-feedback", "candidate-rediscovery"],
    sections: [
      {
        title: "Start with the role and the people",
        paragraphs: [
          "Tell your assistant which client role and candidates the recommendation is for. Name the point you want the draft to explain: relevant leadership experience, a comparable business challenge, or another requirement in the brief.",
          "For example: ‘Prepare a recommendation for Priya for Northstar’s VP Product role. Explain the team-building experience in her saved CV and identify any gaps we need to discuss.’ Priya and Northstar are fictional examples.",
        ],
      },
      {
        title: "Choose the evidence the client may see",
        paragraphs: [
          "A recruiter’s private notes may contain information that does not belong in a client document. Explicitly identify any private source records you want used. Keep unsupported claims and assumptions out of the recommendation.",
          "Check the difference between a recorded fact, your assessment, and an unanswered question. A useful submission explains fit with evidence while making material gaps clear; it does not turn missing information into a confident claim.",
        ],
      },
      {
        title: "Review and refine the draft in conversation",
        paragraphs: [
          "The assistant prepares the document and shows its progress and result in the conversation. Ask for a revision when the emphasis, tone, or content needs work. You can also ask it to remember a writing preference for future work.",
          "Before sharing, verify the recipient, role, candidate details, wording, and selected CVs. Generating a recommendation does not give the assistant permission to send it.",
        ],
      },
      {
        title: "A candidate submission template you can adapt",
        paragraphs: [
          "Open with the candidate’s name, the client role, the recommendation date and a short reason for considering a conversation. Follow with the two or three requirements that matter most, the evidence for each, and the source of that evidence. Separate your interpretation from the candidate’s own statements.",
          "Then cover motivation, location, compensation expectations and availability only to the extent they have been confirmed and are appropriate to share. Use ‘not yet confirmed’ for a missing fact. An old salary expectation or a recruiter’s estimate should not become a current commitment in the client document.",
          "Close with material gaps, questions for the next conversation, and a proposed next step. List the selected attachments and check that each CV belongs to the right person. This outline is a writing aid, not a requirement to include every private field or a claim that Hirelix verifies the candidate’s statements independently.",
        ],
      },
      {
        title: "Keep the next step connected",
        paragraphs: [
          "Copy or export the reviewed work, or use the available recommendation sharing controls. Optional Gmail delivery requires a connected account with sending permission and an explicit send action. It is not autonomous outreach.",
          "Bring the client’s response back to the assistant. Save relevant feedback and update the role when needed. The next recommendation can build on that recorded context instead of relying on you to reconstruct the earlier work.",
        ],
      },
    ],
  },
  {
    slug: "candidate-feedback",
    title: "Track client feedback for each candidate and keep the role moving",
    description:
      "A practical guide for independent headhunters: record individual client feedback, preserve uncertain facts, and resume the same assignment in a new conversation.",
    summary:
      "Candidate feedback is a client's response to a particular person for a particular role. Keep it linked to both, alongside its source and date. Hirelix can use those saved records to prepare the next conversation without turning interest into a booked interview or a hold into a rejection.",
    updatedOn: "2026-10-30",
    takeaways: [
      "Record a separate response for each candidate and role, with the client’s source and date.",
      "Distinguish interest, a hold, a rejection and an agreed interview time.",
      "Bring feedback into the next conversation without treating a draft, download or send receipt as confirmed delivery.",
    ],
    examplePrompt:
      "For [client / role], record this feedback from [source and date] separately for each named candidate: [feedback]. Preserve the client’s wording, distinguish confirmed facts from open questions, and show the next step for each person. Do not schedule an interview, change another role or send anything.",
    relatedSlugs: ["candidate-submissions", "candidate-jd-comparison", "candidate-rediscovery"],
    sections: [
      {
        title: "Start with a role-specific recommendation",
        paragraphs: [
          "Bring a JD and two or three candidate CVs or a CSV list. Ask the assistant to save the materials, compare the candidates against this brief, and identify evidence gaps. Choose whom to include in the client recommendation. A strong profile for one role is not automatically a strong profile for another.",
          "Review the draft and select any CVs before sharing. A generated document, an active client link, an accepted email and a confirmed delivery are different states. A draft alone does not show that the client has received anything.",
        ],
      },
      {
        title: "Record the response for each person",
        paragraphs: [
          "Illustrative example using fictional people: a client wants an initial conversation with Eva, holds Leo until his direct-report experience is verified, and declines Nina for this role. Save three separate outcomes rather than a single note saying the client likes the shortlist.",
          "A useful instruction is: ‘For Harbor's Head of Customer Success role, record the client's feedback from today's call: Eva — interested, no time agreed; Leo — on hold pending verification of direct reports; Nina — not progressing for this role. Do not schedule or send anything.’ Include the actual date, source and wording when known; do not invent missing details.",
        ],
      },
      {
        title: "Separate evidence, judgment and the next action",
        paragraphs: [
          "Coordinating six colleagues does not establish six direct reports. If the source does not give the reporting relationship, keep it unknown and make verification the next action. Likewise, interview interest does not mean a date has been agreed; a hold does not mean the candidate was rejected.",
          "For each person, preserve what the client said, what evidence supports the assessment, what remains unknown, and what you are authorized to do next. Recruiter notes can remain private while a client recommendation contains only the material chosen for that audience.",
        ],
      },
      {
        title: "Resume the assignment in a new conversation",
        paragraphs: [
          "Name the client and role and ask: ‘Continue the Harbor Head of Customer Success assignment. Find the latest recommendation and individual feedback. Summarize the next step for each candidate; do not change records or send anything.’ The assistant can retrieve saved work rather than requiring you to paste every prior message.",
          "If more than one role or candidate matches, resolve that ambiguity before updating records. Review the retrieved sources and their dates: an old note about availability is not current confirmation. Context retrieval is useful, but it is not a guarantee that every past detail will be recalled.",
        ],
      },
      {
        title: "Use saved feedback when mailbox access is unavailable",
        paragraphs: [
          "You can paste the client's message or upload an exported email as a PDF or text file, then ask the assistant to save the relevant feedback. Gmail inbox reading is not currently available; Outlook access can be limited by account permissions or provider restrictions. Do not assume the assistant has read new mail just because an earlier message was saved.",
          "After a new conversation with the client or candidate, save what changed with its source and date. Keep prior facts intact, review the revised recommendation, and authorize any external action separately.",
        ],
      },
    ],
  },
  {
    slug: "candidate-import",
    title: "Import candidate lists and resumes into an AI workspace",
    description:
      "Bring CSV, XLSX, resumes and recruiting notes into Hirelix. Preserve sources, resolve identity conflicts, and check what was actually saved.",
    summary:
      "A useful candidate import preserves the person, the original material and the context behind the record. In Hirelix, upload your files and tell the assistant what to save. Start with a representative sample, inspect the result, and then continue with the remaining material.",
    updatedOn: "2026-10-30",
    takeaways: [
      "Bring files you are authorized to use; exporting a list does not transfer an entire ATS setup.",
      "Keep original CVs, profile links and dated notes associated with the correct person.",
      "Check saved, unresolved and failed items separately before relying on the imported records.",
    ],
    examplePrompt:
      "Save the candidate profiles, original resumes and dated notes in these files to my workspace. Preserve source filenames and existing dates. Do not infer missing contact details, merge ambiguous identities or overwrite conflicting facts. Report what was saved and what needs my decision. Keep the work internal and do not contact anyone.",
    relatedSlugs: ["candidate-rediscovery", "candidate-jd-comparison", "ai-recruiting-assistant"],
    sections: [
      {
        title: "Which candidate files can you bring?",
        paragraphs: [
          "Hirelix accepts candidate lists in CSV, TSV or XLSX format, resumes such as PDF or DOCX, and ZIP archives of candidate files. Files are limited to 50 MB each. A successful upload makes a file available to the assistant; it does not by itself mean that every row has become a saved candidate or that every document was readable.",
          "For a spreadsheet, useful columns include a name, a profile URL or existing identifier, email when known, current role and company, source, and notes. These are suggested fields, not a mandatory import schema. Keep fields you do not know empty. Preserve information in its original language rather than guessing a translation for a title or employer.",
        ],
      },
      {
        title: "Keep the evidence that makes a record useful later",
        paragraphs: [
          "A name and title are rarely enough to revisit a relationship. Keep the original CV filename, the source of a profile, the date of a conversation and the actual note. A candidate’s current interest, permission to share and possible availability are separate facts. Do not collapse them into a single ‘active’ label.",
          "If you exported from another recruiting system, bring the notes and files that the next assignment needs. An exported candidate list is not an automatic synchronization of application stages, access permissions, audit history or email accounts. Hirelix does not promise an automatic ATS connection; work from the files and records you actually provide.",
        ],
      },
      {
        title: "Start with a small sample and a clear instruction",
        paragraphs: [
          "Choose several rows that represent the real material: a complete profile, one with missing fields, and a person with more than one source document. Include a job description if you want to compare people after saving them. Explain which files are candidate records, which are notes, and whether a spreadsheet contains more than one sheet you want processed.",
          "For an illustrative example, a fictional recruiter could supply a candidate list, two CVs and a call-note document. Ask the assistant to save the profiles and attach the right original materials, while retaining unknown availability as unknown. This tests whether the imported records are usable for your work; it is not evidence of a particular import speed or guaranteed completion rate.",
        ],
      },
      {
        title: "Resolve identity conflicts without losing facts",
        paragraphs: [
          "The same name does not establish the same person. Two different email addresses may belong to one person, while two people may share a name and employer. When identity is ambiguous, inspect the underlying sources before deciding whether records should be combined. Do not treat a missing identifier as permission to guess.",
          "A newer file can also disagree with an older CV about an employer, title or date. Retain the source and its date, and decide what should become the current saved fact. Asking the assistant to analyze a discrepancy is different from authorizing it to replace a record. Give an explicit saving instruction when that is what you want.",
        ],
      },
      {
        title: "Check the saved records before scaling up",
        paragraphs: [
          "Read the assistant’s result and inspect several saved candidates. Check names, contact fields, source links, original CVs, note dates and any reported conflicts. Distinguish the number of input rows from the number of people saved: duplicate records, non-candidate rows or unresolved items can make those counts different.",
          "Next, ask a question that requires an actual imported note or CV and inspect the cited material. File availability, record persistence and later retrieval are different checks. If the assistant reports a partial result, continue from the unresolved items instead of assuming that repeating the whole import is harmless. Once the sample is satisfactory, use the same clear scope for the remaining files.",
        ],
      },
    ],
  },
  {
    slug: "candidate-jd-comparison",
    title: "How to compare candidates against a job description",
    description:
      "An evidence-based candidate comparison for headhunters: map JD requirements to CVs, explain trade-offs, and keep unknown facts separate from judgments.",
    summary:
      "A candidate-to-JD comparison evaluates each person against the same current role requirements, using concrete evidence and visible gaps. A matching title or familiar employer is a lead to investigate, not proof of fit. Hirelix can help prepare the comparison while the recruiter retains the hiring judgment.",
    updatedOn: "2026-10-30",
    takeaways: [
      "Agree on the role’s actual responsibilities and must-have evidence before interpreting candidate fit.",
      "Use the same questions for each candidate and explain meaningful trade-offs rather than relying on a single score.",
      "Keep missing evidence, outdated information and negative evidence distinct.",
    ],
    examplePrompt:
      "Compare these candidates against the attached JD and client notes. For each important requirement, identify the supporting CV passage or dated note, explain the evidence gap, and state any trade-off. Recommend whom I should speak with first and what to verify. Keep assessments specific to this role. Do not save changes or contact anyone.",
    relatedSlugs: ["candidate-rediscovery", "candidate-submissions", "candidate-feedback"],
    sections: [
      {
        title: "Translate the brief into evidence questions",
        paragraphs: [
          "Start with the job description and the client’s latest clarifications. Identify the work the person will own, the scale of responsibility, the business situation and the practical constraints. Distinguish requirements that are essential from preferences that the client is willing to trade off. If two versions of the brief disagree, resolve which one applies before drawing a confident conclusion.",
          "Turn broad requirements into questions. For example, ‘build the team’ might require evidence of hiring decisions, coaching, reporting relationships and outcomes. ‘Enterprise experience’ might mean owning long sales cycles, serving complex accounts or leading an enterprise product. The client’s intended meaning matters more than counting the phrase in a CV.",
        ],
      },
      {
        title: "Build a comparison matrix from the original sources",
        paragraphs: [
          "Use a row for each important requirement and a column for each candidate. In each cell, capture the supporting experience, the source and date, your interpretation, and the question that remains open. You can ask the assistant to produce this as a table, but inspect the original material behind claims that will affect your recommendation.",
          "Keep evidence and assessment separate. ‘The CV says she hired four product managers’ is a sourced statement. ‘That experience appears relevant to establishing this team’ is your interpretation. ‘Her impact on retention is not stated’ is an evidence gap. Combining all three into a confident label makes later review much harder.",
        ],
      },
      {
        title: "Make trade-offs explicit instead of hiding them in a score",
        paragraphs: [
          "Illustrative comparison using fictional people: Alex has led a larger team, but the materials do not establish hands-on ownership of the client’s main product challenge. Jamie has direct experience of that challenge at a smaller scale. The useful recommendation explains which risk the client would be accepting with either person and what a conversation should test.",
          "A numerical score can summarize an assessment, but it does not establish the evidence or make different responsibilities equivalent. Ask why one candidate appears stronger on a particular requirement and whether the conclusion would change if the client relaxed that requirement. Keep the assessment tied to this JD; a hold or rejection here is not a permanent judgment about the person.",
        ],
      },
      {
        title: "Treat unknown and out-of-date information accurately",
        paragraphs: [
          "Missing evidence does not automatically mean the candidate lacks the capability. It means the current material does not establish it. Conversely, a title or a well-known employer does not fill that gap. Request a specific example, scope or outcome during the next conversation rather than replacing the uncertainty with an assumption.",
          "A CV can describe past work without confirming current interest, location, compensation expectations or availability. A dated call note can be useful, but an old statement should remain historical until reconfirmed. The same distinction applies to public pages: a publication date and a job title observed on a page do not establish that the role is current today.",
        ],
      },
      {
        title: "Turn the comparison into the next useful conversation",
        paragraphs: [
          "End with a recommendation the recruiter can assess: whom to speak with first, why that conversation is worthwhile, and the questions that could change the assessment. If the evidence is insufficient to distinguish the people, say so and identify the missing material. A defensible comparison can conclude that more information is needed.",
          "In Hirelix, provide the JD, selected CVs and relevant notes in the conversation, or identify the saved role and people. Ask for an internal comparison first if no record changes are intended. After reviewing it, you can separately ask to save the assessment or prepare a client submission. Preparing the comparison does not authorize outreach or an interview commitment.",
        ],
      },
    ],
  },
  {
    slug: "public-web-candidate-research",
    title: "Public-web candidate research: sources, evidence and gaps",
    description:
      "Research potential candidates on public pages while checking identity, current facts and source quality. A practical guide for independent headhunters.",
    summary:
      "Public-web candidate research uses accessible professional information to identify people worth investigating for a role. A useful result connects a person to the brief, links the supporting sources and states what remains unverified. It is a research lead, not proof of availability, interest or permission to contact.",
    updatedOn: "2026-10-30",
    takeaways: [
      "Research against a specific role and ask for source links, dates and unresolved questions.",
      "Verify that evidence belongs to the right person before combining facts across pages.",
      "Treat inaccessible pages and incomplete public information as limits to report, not details to invent.",
    ],
    examplePrompt:
      "Research publicly available professional information for [role and requirements]. Explain why each potential person may be relevant, link the pages supporting the claims, and distinguish source statements from your assessment. Flag uncertain identity, current role, location, interest and availability. Do not invent contact details, contact anyone or change my saved records.",
    relatedSlugs: ["candidate-jd-comparison", "candidate-rediscovery", "ai-recruiting-assistant"],
    sections: [
      {
        title: "Start with the role rather than a list of names",
        paragraphs: [
          "Give the assistant the current brief, the responsibilities that matter, and the evidence you would expect to see. Explain the relevant industry context and any practical constraints. A long list of names is less useful than a smaller set of research leads whose apparent relevance can be checked against the role.",
          "Hirelix can use web search and accessible public pages when you ask it to research people. It can also work with your private candidate records, but the two source scopes are different. Specify whether you want public research, a review of your own pool, or both. Hirelix does not sell access to an external talent database or guarantee coverage of a particular network.",
        ],
      },
      {
        title: "Keep the original page behind each important claim",
        paragraphs: [
          "Useful public sources can include an employer biography, a conference speaker page, a professional portfolio or a published project. Their usefulness depends on what they actually establish. A speaker biography may describe a role at the time of an event; a project page may show a contribution without establishing responsibility for an entire team.",
          "For each important claim, retain the URL, the relevant passage or description, and the source date when available. Distinguish the date the page was checked from the date of the event or experience. A search-result snippet is a discovery aid; when the underlying page cannot be read, report that limit instead of treating the snippet as a verified quotation from the full source.",
        ],
      },
      {
        title: "Check identity before combining sources",
        paragraphs: [
          "People can share a name, work for the same company at different times, or appear on pages that mention several colleagues. Check the employer, professional history and other corroborating details before attributing a project, role or statement to someone. If identity remains uncertain, keep the records separate and say what would resolve it.",
          "An illustrative failure to avoid: a company announcement names one person as the engineering leader and quotes a different person about a launch. The quotation does not transfer the leader’s responsibilities to the person quoted. Read the surrounding text and the named subject of a claim instead of merging everything on the page into a single profile.",
        ],
      },
      {
        title: "Separate relevance from current recruiting facts",
        paragraphs: [
          "A public profile can support a hypothesis that someone has relevant experience. It rarely establishes whether they are looking for a move, what compensation they expect, or whether they want their information shared with this client. Do not infer those facts from a profile being publicly visible.",
          "Likewise, do not fabricate an email address or other contact detail from an employer’s naming pattern. Keep unknown contact information unknown. Before using research in a client submission, verify material experience claims and decide which information is appropriate for that audience. Public visibility alone is not a complete recruiting relationship.",
        ],
      },
      {
        title: "Evaluate the result and state its limits",
        paragraphs: [
          "For each lead, ask for the role-specific reason to investigate, the strongest supporting evidence, a material counterpoint or gap, and the next verification question. Prefer a clear statement that evidence is limited over a confident profile assembled from assumptions. There is no useful fixed quota when the accessible material does not support it.",
          "Some pages require sign-in, block automated reading, change or disappear. Search can also miss relevant people. Hirelix should report those limits; research is not an exhaustive search or independent verification of every statement. You retain the decision to save a lead, obtain more information, prepare a recommendation or authorize contact.",
        ],
      },
    ],
  },
  {
    slug: "ai-recruiting-assistant",
    title: "Choosing an AI recruiting assistant for independent headhunters",
    description:
      "Evaluate an AI recruiting assistant with your own CVs, a real JD and follow-up work. Understand Hirelix’s scope, pricing, controls and limits.",
    summary:
      "An AI recruiting assistant helps a recruiter work with role requirements, candidate information and client communication. For an independent headhunter, the useful test is whether it can turn your own materials into work you can check, then continue when the brief or feedback changes.",
    updatedOn: "2026-10-30",
    takeaways: [
      "Choose around the work you need done, rather than treating every AI recruiting product as the same category.",
      "Test with your own authorized material and check evidence, saved changes, revisions and external-action controls.",
      "Compare pricing, credit rules, mailbox availability, export and deletion before committing.",
    ],
    examplePrompt:
      "Using only this JD, these CVs and the notes I provide, compare the candidates and explain the evidence gaps. Keep the result internal. Then use the client’s revised requirement to update the comparison and explain what changed. Do not assume current interest, save changes or send anything without my instruction.",
    relatedSlugs: ["candidate-import", "candidate-jd-comparison", "candidate-submissions"],
    sections: [
      {
        title: "What work do you need the assistant to own?",
        paragraphs: [
          "Start with a recurring problem on your desk: interpreting a client brief, revisiting people you already know, preparing a candidate conversation, writing a recommendation or incorporating feedback. Decide what a usable result would look like and what information you are willing and authorized to supply.",
          "Hirelix is a personal AI agent for independent headhunters and consultants at boutique search firms. Its workspace holds the profiles, roles, original materials, conversations and explicit preferences you save. You can ask it to compare candidates, prepare client materials and continue saved work. It can also research accessible public information with source links and uncertainties.",
        ],
      },
      {
        title: "How does this differ from an ATS or talent database?",
        paragraphs: [
          "Treat these as different buying questions. If you need a company-wide applicant process, evaluate the ATS capabilities and integrations that process requires. If you need external database coverage, evaluate the provider’s actual coverage and access terms. If you need help working with your own recruiting context, evaluate what the assistant can retrieve, understand and do with it. Vendors can overlap, so check the specific product rather than assuming a category guarantees a feature.",
          "Hirelix is not presented as a replacement for a firm’s ATS and does not promise automatic ATS synchronization. It does not sell a talent database. A general chat tool may help you draft text, but your evaluation should also check what happens to the source records, whether work can be resumed and which actions actually reach a business system. These are acceptance questions, not a blanket claim that another product lacks those abilities.",
        ],
      },
      {
        title: "Run a test that reflects a real assignment",
        paragraphs: [
          "Use a JD and two or three CVs or candidate records you are authorized to process. Ask for an internal comparison, inspect the cited material and choose a candidate for a draft recommendation. Add a changed client requirement and check whether the revised answer uses it. Avoid judging the product from a polished demonstration alone.",
          "Then test continuity: identify the saved role in a later conversation and ask for the latest evidence and unresolved questions. Check whether the assistant found the right records, rather than merely producing plausible prose. A correct answer on one example is useful evidence for that example; it does not establish perfect recall or consistent recruiting judgment.",
        ],
      },
      {
        title: "Check control over changes and external actions",
        paragraphs: [
          "An analysis request should be distinguishable from a request to save or edit records. When you do authorize an update, inspect the saved result. Test what happens when two people have the same name or when the notes conflict. Clear questions about material ambiguity are useful; repeated permission prompts for an already authorized task add friction.",
          "In Hirelix, creating a recommendation or email draft does not send it. Connected-mailbox sending requires explicit authorization. Gmail inbox reading is not currently available; Outlook access depends on permissions and account restrictions. Public-page research also depends on what can actually be accessed. Check these boundaries against the work you need before choosing a tool.",
        ],
      },
      {
        title: "Compare total terms, not just the headline price",
        paragraphs: [
          "Review the current pricing page for the subscription amount, trial allowance, credit reset rules and cancellation terms. Understand what a credit represents: in Hirelix it measures service usage, not a fixed number of tasks or candidates. Longer or more complex work can consume more credits, so use your trial on a representative assignment.",
          "Also inspect how you can export candidate records and generated work, correct saved information and request account-wide data handling. Do not assume that a private workspace or a connected mailbox establishes a particular compliance certification. Read the published Privacy Policy and ask the operator about any requirement that is material to your practice. Hirelix is operated by YieldMirror, with support at support@hirelix.online.",
        ],
      },
    ],
  },
];
