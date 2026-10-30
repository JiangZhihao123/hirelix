import Link from "next/link";
import { notFound } from "next/navigation";
import { recruitingGuides } from "@/lib/recruiting-guides";
import { breadcrumbSchema, jsonLd, publicMetadata, SITE_URL } from "@/lib/seo";

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
        dateModified: guide.updatedOn,
        inLanguage: "en",
        mainEntityOfPage: { "@id": `${url}#webpage` },
        author: { "@id": `${SITE_URL}/#organization` },
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: guide.title,
        description: guide.description,
        inLanguage: "en",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        mainEntity: { "@id": `${url}#article` },
        breadcrumb: { "@id": `${url}#breadcrumb` },
      },
      {
        "@id": `${url}#breadcrumb`,
        ...breadcrumbSchema([
          { name: "Hirelix", path: "/" },
          { name: "Recruiting guides", path: "/guides" },
          { name: guide.title, path: `/guides/${slug}` },
        ]),
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
        <Link href="/">Hirelix</Link> / <Link href="/guides">Recruiting guides</Link>
        {" / "}<span aria-current="page">{guide.title}</span>
      </nav>
      <p className="ha-eyebrow">PRACTICAL GUIDES FOR INDEPENDENT HEADHUNTERS</p>
      <h1>{guide.title}</h1>
      <p className="hr-intro">{guide.summary}</p>
      <p className="hr-byline">
        By <Link href="/contact">Hirelix</Link> · Updated{" "}
        <time dateTime={guide.updatedOn}>{guide.updatedOn}</time>
      </p>
      <section className="hr-callout" aria-labelledby="key-points">
        <h2 id="key-points">Key points</h2>
        <ul>{guide.takeaways.map((point) => <li key={point}>{point}</li>)}</ul>
      </section>
      <nav className="hr-toc" aria-label="In this guide">
        <p>In this guide</p>
        <ol>
          {guide.sections.map((section, index) => (
            <li key={section.title}><a href={`#section-${index + 1}`}>{section.title}</a></li>
          ))}
          <li><a href="#example-request">A request you can adapt</a></li>
        </ol>
      </nav>
      {guide.sections.map((section, index) => (
        <section id={`section-${index + 1}`} key={section.title}>
          <h2>{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
      <section id="example-request" className="hr-callout">
        <h2>A request you can adapt</h2>
        <p>Replace the placeholders with your own role, people and authorized materials.</p>
        <blockquote className="hr-prompt">{guide.examplePrompt}</blockquote>
        <p>
          This is an illustrative instruction, not a customer result or a guarantee of a particular answer.
          Check the evidence and saved results before using them. Read the{" "}
          <Link href="/product">product scope</Link> and{" "}
          <Link href="/privacy">Privacy Policy</Link> before providing candidate material.
        </p>
      </section>
      <section className="hr-related">
        <h2>Continue with your assistant</h2>
        <ul>
          <li>
            <Link href="/product">
              How Hirelix builds on your work over time
            </Link>
          </li>
          {guide.relatedSlugs.map((relatedSlug) => {
            const item = recruitingGuides.find((entry) => entry.slug === relatedSlug)!;
            return (
              <li key={item.slug}>
                <Link href={`/guides/${item.slug}`}>{item.title}</Link>
              </li>
            );
          })}
          <li><Link href="/guides">Browse all recruiting guides and templates</Link></li>
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
