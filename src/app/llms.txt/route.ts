import { AGENT_PLAN } from "@/lib/agent-plan";
import { publicPages, SITE_DESCRIPTION, SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";
export function GET() {
  // A convenience summary of public facts, not a search indexing protocol.
  const content = `# Hirelix

> ${SITE_DESCRIPTION}

Hirelix is operated by YieldMirror. It serves independent headhunters and consultants at boutique search firms. As a long-term AI assistant, the personal agent works with saved candidate profiles, CVs, notes, role requirements, conversations, and explicit preferences. Recruiters can update or forget saved preferences. It does not promise unlimited recall or independent recruiting decisions.

Hirelix works with the user's own candidate pool. It does not provide paid external candidate sourcing or a talent database. Client drafts require review. Optional Gmail sending requires a connected account with sending permission and an explicit send action.

Personal Agent: USD ${AGENT_PLAN.monthlyCents / 100}/month or USD ${AGENT_PLAN.annualCents / 100}/year, plus applicable tax. Both include ${AGENT_PLAN.monthlyCredits} AI credits per calendar month (UTC), without rollover. Trial: ${AGENT_PLAN.trialDays} days and ${AGENT_PLAN.trialCredits} credits, no card required, no automatic conversion to paid. Credits measure service usage, not a fixed number of tasks.

## Public sources

${publicPages.map((page) => `- [${page.label}](${SITE_URL}${page.path === "/" ? "" : page.path}): ${page.description}`).join("\n")}

## Contact

- Support: support@hirelix.online
- Private workspace, API routes, invitations, and candidate recommendation links are not public reference sources.
`;
  return new Response(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
