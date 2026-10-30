import { mailboxAvailability } from "@/lib/landing-content";
import { AGENT_PLAN } from "@/lib/agent-plan";
import { publicPages, SITE_DESCRIPTION, SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";
export function GET() {
  // A convenience summary of public facts, not a search indexing protocol.
  const content = `# Hirelix

> ${SITE_DESCRIPTION}

Hirelix is operated by YieldMirror. It serves independent headhunters and consultants at boutique search firms. As a long-term AI assistant, the personal agent works with saved candidate profiles, CVs, notes, role requirements, conversations, and explicit preferences. Recruiters can update or forget saved preferences. It does not promise unlimited recall or independent recruiting decisions.

Hirelix works with the user's own candidate pool and can research publicly available information when asked, preserving source links and uncertainties. Public evidence can be incomplete or inaccessible. It does not sell talent-database access. Client drafts require review. ${mailboxAvailability} Provider acceptance of a send is not confirmation of recipient delivery.

${AGENT_PLAN.name}: USD ${AGENT_PLAN.monthlyCents / 100}/month or USD ${AGENT_PLAN.annualCents / 100}/year, plus applicable tax. Both include ${AGENT_PLAN.monthlyCredits} AI credits per monthly subscription period, without rollover. Monthly credits reset after successful renewal. Annual credits reset on each monthly subscription anniversary; shorter months use the last day. Trial: ${AGENT_PLAN.trialDays} days and ${AGENT_PLAN.trialCredits} credits, no card required, no automatic conversion to paid. Credits measure service usage, not a fixed number of tasks.

## Public sources

${publicPages.map((page) => `- [${page.label}](${SITE_URL}${page.path === "/" ? "" : page.path}): ${page.description}`).join("\n")}

## Reading and attribution

The linked public HTML pages are the primary references. Recruiting guides contain practical methods and clearly illustrative requests, not customer case studies, independently verified candidate facts or hiring guarantees. Check the current pricing and product pages for terms and availability. A public profile does not establish current interest, availability or permission to contact.

This file is a convenience index, not a crawler protocol, ranking signal or guarantee of inclusion in AI answers.

## Contact

- Support: support@hirelix.online
- Private workspace, API routes, invitations, and candidate recommendation links are not public reference sources.
`;
  return new Response(content, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
