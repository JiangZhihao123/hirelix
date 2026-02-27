import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hirelix — From JD to Candidates in 5 Minutes",
  description:
    "AI-powered recruiting agent that turns your job description into a shortlist of qualified candidates with personalized outreach emails. Stop spending hours on sourcing.",
  openGraph: {
    title: "Hirelix — From JD to Candidates in 5 Minutes",
    description:
      "AI-powered recruiting agent that turns your job description into a shortlist of qualified candidates with personalized outreach emails.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Hirelix — From JD to Candidates in 5 Minutes",
    description:
      "AI-powered recruiting agent that turns your job description into a shortlist of qualified candidates with personalized outreach emails.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
