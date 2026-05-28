import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { GrowthTracker } from "@/components/GrowthTracker";

const inter = localFont({
  src: [
    { path: "./fonts/InterVariable.woff2", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://hirelix.online"),
  title: "Hirelix — Technical Candidate Research in 15 Minutes",
  description:
    "Paste the client JD. Hirelix's AI agents research real profiles in parallel and deliver a ranked shortlist with evidence and personalized outreach drafts.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "Hirelix — Technical Candidate Research in 15 Minutes",
    description:
      "Paste the client JD. Hirelix's AI agents research real profiles in parallel and deliver a ranked shortlist with evidence and personalized outreach drafts.",
    type: "website",
    url: "https://hirelix.online",
    siteName: "Hirelix",
    images: [
      {
        url: "https://hirelix.online/og-image.png",
        width: 1200,
        height: 630,
        alt: "Hirelix — Technical candidate research in 15 minutes",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hirelix — Technical Candidate Research in 15 Minutes",
    description:
      "Paste the client JD. Hirelix's AI agents research real profiles in parallel and deliver a ranked shortlist with evidence and personalized outreach drafts.",
    images: ["https://hirelix.online/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
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
            gtag('config', 'AW-16927084361');
          `}
        </Script>
        <AuthProvider>
          <GrowthTracker />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
