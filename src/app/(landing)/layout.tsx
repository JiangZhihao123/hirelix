import {
  publicMetadata,
  SITE_URL,
  SITE_TITLE,
  SITE_DESCRIPTION,
  jsonLd,
} from "@/lib/seo";
import { AGENT_PLAN } from "@/lib/agent-plan";
import { landingFaqs } from "@/lib/landing-content";

export const metadata = publicMetadata("/", SITE_TITLE, SITE_DESCRIPTION);
const base = SITE_URL;
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${base}/#organization`,
      name: "Hirelix",
      parentOrganization: { "@type": "Organization", name: "YieldMirror" },
      url: base,
      logo: `${base}/logo-512.png`,
      email: "support@hirelix.online",
    },
    {
      "@type": "WebSite",
      "@id": `${base}/#website`,
      name: "Hirelix",
      url: base,
      inLanguage: "en",
      publisher: { "@id": `${base}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${base}/#application`,
      name: "Hirelix",
      url: base,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: SITE_DESCRIPTION,
      featureList: [
        "Search your saved candidate records",
        "Review updates to role requirements",
        "Prepare candidate submission drafts",
        "Import CSV, PDF and DOCX candidate materials",
        "Export candidate records",
      ],
      offers: [
        {
          "@type": "Offer",
          name: "Personal Agent monthly",
          price: AGENT_PLAN.monthlyCents / 100,
          priceCurrency: AGENT_PLAN.currency,
          url: `${base}/pricing`,
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: AGENT_PLAN.monthlyCents / 100,
            priceCurrency: AGENT_PLAN.currency,
            unitText: "MONTH",
          },
        },
        {
          "@type": "Offer",
          name: "Personal Agent annual",
          price: AGENT_PLAN.annualCents / 100,
          priceCurrency: AGENT_PLAN.currency,
          url: `${base}/pricing`,
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: AGENT_PLAN.annualCents / 100,
            priceCurrency: AGENT_PLAN.currency,
            unitText: "YEAR",
          },
        },
      ],
      provider: { "@id": `${base}/#organization` },
    },
    {
      "@type": "FAQPage",
      "@id": `${base}/#questions`,
      mainEntity: landingFaqs.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    },
  ],
};
export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      {children}
    </>
  );
}
