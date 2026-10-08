import type { Metadata } from "next";

export const SITE_URL = "https://hirelix.online";
export const SITE_TITLE = "Hirelix | Your Personal AI Agent for Headhunting";
export const SITE_DESCRIPTION =
  "Your personal AI agent for headhunting. Build on saved candidates, client briefs, conversations, and preferences, from one role to the next.";

export const publicPages = [
  { path: "/", label: "Hirelix", description: SITE_DESCRIPTION },
  {
    path: "/product",
    label: "Personal AI agent for headhunters",
    description:
      "How Hirelix works with your candidates, client briefs, and recruiting records.",
  },
  {
    path: "/pricing",
    label: "Pricing",
    description:
      "Personal Agent subscription pricing, free trial, and AI credits.",
  },
  {
    path: "/guides/candidate-rediscovery",
    label: "Candidate rediscovery",
    description:
      "Revisit candidates in your own database against a new client brief.",
  },
  {
    path: "/guides/candidate-submissions",
    label: "Candidate submissions",
    description:
      "Prepare a client-ready recommendation from saved candidate evidence.",
  },
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
] as const;

export function publicMetadata(
  path: string,
  title: string,
  description: string,
): Metadata {
  return {
    title,
    description,
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
          alt: "Hirelix — your personal AI agent for headhunting",
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
