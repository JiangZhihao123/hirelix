import Link from "next/link";
import { notFound } from "next/navigation";
import { recruitingGuides } from "@/lib/recruiting-guides";
import { jsonLd, publicMetadata, SITE_URL } from "@/lib/seo";

export const dynamicParams = false;
export function generateStaticParams() {
  return recruitingGuides.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = recruitingGuides.find((item) => item.slug === slug);
  if (!guide) notFound();
  return publicMetadata(
    `/guides/${slug}`,
    `${guide.title} | Hirelix`,
    guide.description,
  );
}
export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = recruitingGuides.find((item) => item.slug === slug);
  if (!guide) notFound();
  const url = `${SITE_URL}/guides/${slug}`;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${url}#article`,
        headline: guide.title,
        description: guide.description,
        inLanguage: "en",
        mainEntityOfPage: url,
        author: { "@type": "Organization", name: "Hirelix", url: SITE_URL },
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Hirelix", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: guide.title, item: url },
        ],
      },
    ],
  };
  return (
    <article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}
      />
      <nav className="hr-breadcrumb" aria-label="Breadcrumb">
        <Link href="/">Hirelix</Link> / Recruiting guides
      </nav>
      <p className="ha-eyebrow">WORKING WITH YOUR LONG-TERM ASSISTANT</p>
      <h1>{guide.title}</h1>
      <p className="hr-intro">{guide.summary}</p>
      <p>By Hirelix · Product workflow guide</p>
      {guide.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      <section className="hr-related">
        <h2>Continue with your assistant</h2>
        <ul>
          <li>
            <Link href="/product">
              How Hirelix builds on your work over time
            </Link>
          </li>
          {recruitingGuides
            .filter((item) => item.slug !== slug)
            .map((item) => (
              <li key={item.slug}>
                <Link href={`/guides/${item.slug}`}>{item.title}</Link>
              </li>
            ))}
          <li>
            <Link href="/pricing">Pricing and the free trial</Link>
          </li>
        </ul>
        <Link className="ha-button" href="/app?entry=free_trial">
          Meet your assistant
        </Link>
      </section>
    </article>
  );
}
