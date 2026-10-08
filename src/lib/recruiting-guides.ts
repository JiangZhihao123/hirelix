export const recruitingGuides = [
  {
    slug: "candidate-rediscovery",
    title: "Candidate rediscovery starts with what you already know",
    description:
      "How a long-term recruiting assistant helps headhunters revisit saved candidates, past conversations, and new client requirements together.",
    summary:
      "Candidate rediscovery means revisiting people already in your candidate pool when a new role or changed brief makes their experience relevant again. In Hirelix, your assistant works from saved CVs, profiles, and notes so you can build on earlier conversations.",
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
    title: "Prepare candidate submissions without rebuilding the context",
    description:
      "A practical workflow for headhunters to turn saved candidate evidence and client requirements into a reviewed candidate recommendation.",
    summary:
      "A candidate submission explains why a particular person deserves a client conversation for a particular role. Hirelix helps prepare that draft from your saved candidate profiles, role brief, and source material you authorize, then keeps the work available for revision.",
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
        title: "Keep the next step connected",
        paragraphs: [
          "Copy or export the reviewed work, or use the available recommendation sharing controls. Optional Gmail delivery requires a connected account with sending permission and an explicit send action. It is not autonomous outreach.",
          "Bring the client’s response back to the assistant. Save relevant feedback and update the role when needed. The next recommendation can build on that recorded context instead of relying on you to reconstruct the earlier work.",
        ],
      },
    ],
  },
] as const;
