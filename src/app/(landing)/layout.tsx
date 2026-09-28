import { landingFaqs } from "@/lib/landing-content";

const base = "https://hirelix.online";
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${base}/#organization`, name: "Hirelix", url: base, logo: `${base}/logo-512.png`, email: "support@hirelix.online" },
    { "@type": "WebSite", "@id": `${base}/#website`, name: "Hirelix", url: base, inLanguage: "en", publisher: { "@id": `${base}/#organization` } },
    { "@type": "SoftwareApplication", "@id": `${base}/#application`, name: "Hirelix", url: base, applicationCategory: "BusinessApplication", operatingSystem: "Web", description: "A personal AI agent for headhunters to work with saved candidates, ongoing client roles, and client submissions.", featureList: ["Search your saved candidate records", "Review updates to role requirements", "Prepare candidate submission drafts", "Import CSV, PDF and DOCX candidate materials", "Export candidate records"], provider: { "@id": `${base}/#organization` } },
    { "@type": "FAQPage", "@id": `${base}/#questions`, mainEntity: landingFaqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
  ],
};
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\u003c") }} />{children}</>;
}
