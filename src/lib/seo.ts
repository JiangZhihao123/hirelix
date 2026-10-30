import type { Metadata } from "next";
import { AGENT_PLAN } from "./agent-plan";
import { recruitingGuides } from "./recruiting-guides";
import { LANDING_TITLE, LANDING_DESCRIPTION } from "./landing-content";

export const SITE_URL = "https://hirelix.online";
export const SITE_TITLE = LANDING_TITLE;
export const SITE_DESCRIPTION = LANDING_DESCRIPTION;

export const publicPages: readonly {
  path: string;
  label: string;
  description: string;
  lastModified?: string;
}[] = [
  { path: "/", label: "Hirelix", description: SITE_DESCRIPTION },
  {
    path: "/product",
    label: "AI recruiting assistant for independent headhunters",
    description:
      "Delegate recruiting preparation, records and written client work to your AI assistant.",
  },
  {
    path: "/pricing",
    label: "Pricing",
    description:
      "Hirelix Pro subscription pricing, free trial, and AI credits.",
  },
  {
    path: "/guides",
    label: "Recruiting guides and templates",
    description:
      "Practical guides for independent headhunters: candidate imports, JD comparisons, rediscovery, submissions, feedback, and public-web research.",
  },
  ...recruitingGuides.map((guide) => ({
    path: `/guides/${guide.slug}`,
    label: guide.title,
    description: guide.description,
    lastModified: guide.updatedOn,
  })),
  {
    path: "/contact",
    label: "Contact",
    description: "Contact YieldMirror, the operator of Hirelix.",
  },
  {
    path: "/privacy",
    label: "Privacy Policy",
    description: "How Hirelix handles information and data requests.",
  },
  {
    path: "/terms",
    label: "Terms of Service",
    description: "Terms for using Hirelix.",
  },
  {
    path: "/refund-policy",
    label: "Refund Policy",
    description: "Refund and cancellation information.",
  },
];

// Stable entity IDs let public pages identify the same product and publisher.
export const publicIdentity = [
  {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "Hirelix",
    parentOrganization: { "@type": "Organization", name: "YieldMirror" },
    url: SITE_URL,
    logo: `${SITE_URL}/logo-512.png`,
    email: "support@hirelix.online",
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "support@hirelix.online",
      url: `${SITE_URL}/contact`,
    },
  },
  {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: "Hirelix",
    url: SITE_URL,
    inLanguage: "en",
    publisher: { "@id": `${SITE_URL}/#organization` },
  },
];

export const applicationSchema = {
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/#application`,
  name: "Hirelix",
  url: SITE_URL,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: SITE_DESCRIPTION,
  featureList: [
    "Search your saved candidate records",
    "Compare candidate evidence with a job description",
    "Research public information with source links and uncertainties",
    "Prepare client recommendations with selected resumes",
    "Keep client feedback separate for each candidate and role",
    "Continue saved assignments across conversations",
    "Import candidate lists, resumes and related files",
    "Export candidate records and recommendations",
  ],
  offers: [
    { period: "MONTH", name: "monthly", cents: AGENT_PLAN.monthlyCents },
    { period: "YEAR", name: "annual", cents: AGENT_PLAN.annualCents },
  ].map(({ period, name, cents }) => ({
    "@type": "Offer",
    name: `${AGENT_PLAN.name} ${name}`,
    price: cents / 100,
    priceCurrency: AGENT_PLAN.currency,
    url: `${SITE_URL}/pricing`,
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: cents / 100,
      priceCurrency: AGENT_PLAN.currency,
      unitText: period,
    },
  })),
  provider: { "@id": `${SITE_URL}/#organization` },
};

export function breadcrumbSchema(items: readonly { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map(({ name, path }, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: `${SITE_URL}${path === "/" ? "" : path}`,
    })),
  };
}

export function publicMetadata(
  path: string,
  title: string,
  description: string,
): Metadata {
  return {
    title,
    description,
    robots: { index: true, follow: true, "max-image-preview": "large" },
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${path === "/" ? "" : path}`,
      type: "website",
      siteName: "Hirelix",
      locale: "en_US",
      images: [
        {
          url: `${SITE_URL}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: "Hirelix — your AI recruiting assistant",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${SITE_URL}/opengraph-image`],
    },
  };
}

export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
