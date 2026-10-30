import {
  publicMetadata,
  SITE_URL,
  SITE_TITLE,
  SITE_DESCRIPTION,
  jsonLd,
  publicIdentity,
  applicationSchema,
} from "@/lib/seo";
import { landingFaqs } from "@/lib/landing-content";

export const metadata = publicMetadata("/", SITE_TITLE, SITE_DESCRIPTION);
const base = SITE_URL;
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    ...publicIdentity,
    applicationSchema,
    {
      "@type": "WebPage",
      "@id": `${base}/#webpage`,
      url: base,
      name: SITE_TITLE,
      description: SITE_DESCRIPTION,
      inLanguage: "en",
      isPartOf: { "@id": `${base}/#website` },
      about: { "@id": `${base}/#application` },
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
      <link rel="preload" as="image" href="/landing/video/hirelix-launch-cover.png" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      {children}
    </>
  );
}
