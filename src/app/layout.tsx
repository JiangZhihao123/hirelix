import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const inter = localFont({
  src: [
    { path: "./fonts/InterVariable.woff2", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
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
      <body className={`${inter.variable} antialiased`}>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-17R1B6K2BK"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-17R1B6K2BK');
          `}
        </Script>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
