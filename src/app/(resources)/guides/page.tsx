import Link from "next/link";
import { recruitingGuides } from "@/lib/recruiting-guides";
import { breadcrumbSchema, jsonLd, publicMetadata, SITE_URL } from "@/lib/seo";

const title = "Recruiting Guides & Templates for Independent Headhunters";
const description = "Practical recruiting guides: import candidates, compare CVs with a JD, rediscover your talent pool, prepare submissions, and track client feedback.";

export const metadata = publicMetadata("/guides", `${title} | Hirelix`, description);

export default function GuidesPage() {
  const url = `${SITE_URL}/guides`;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "CollectionPage",
            "@id": `${url}#webpage`,
            url,
            name: title,
            description,
            inLanguage: "en",
            isPartOf: { "@id": `${SITE_URL}/#website` },
            publisher: { "@id": `${SITE_URL}/#organization` },
            mainEntity: {
              "@type": "ItemList",
              itemListElement: recruitingGuides.map((guide, index) => ({
                "@type": "ListItem",
                position: index + 1,
                name: guide.title,
                url: `${url}/${guide.slug}`,
              })),
            },
            breadcrumb: breadcrumbSchema([
              { name: "Hirelix", path: "/" },
              { name: "Recruiting guides", path: "/guides" },
            ]),
          },
        ],
      }) }} />
      <nav className="hr-breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Hirelix</Link> / <span aria-current="page">Recruiting guides</span>
      </nav>
      <p className="ha-eyebrow">FOR THE WORK ON YOUR RECRUITING DESK</p>
      <h1>Recruiting guides and templates for independent headhunters.</h1>
      <p className="hr-intro">
        Put your candidate records, client briefs and conversations to work.
        These guides explain the method, the evidence to check, and a request
        you can adapt for your assistant. Start with the task you have today.
      </p>
      <div className="hr-guide-grid">
        {recruitingGuides.map((guide) => (
          <article className="hr-guide-card" key={guide.slug}>
            <h2><Link href={`/guides/${guide.slug}`}>{guide.title}</Link></h2>
            <p>{guide.description}</p>
            <small>Updated <time dateTime={guide.updatedOn}>{guide.updatedOn}</time></small>
          </article>
        ))}
      </div>
      <section className="hr-related">
        <h2>Try one assignment with your own materials</h2>
        <p>
          Bring a JD and a few candidate CVs you are authorized to use. Ask for
          an internal comparison, inspect the evidence, and continue from there.
          Hirelix is a personal AI agent for headhunters, operated by YieldMirror.
        </p>
        <p>
          <Link href="/product">See the product and its current limits</Link>{" · "}
          <Link href="/pricing">Pricing and the free trial</Link>{" · "}
          <Link href="/contact">Contact Hirelix</Link>
        </p>
        <Link className="ha-button" href="/app?entry=free_trial">Meet your assistant</Link>
      </section>
    </>
  );
}
