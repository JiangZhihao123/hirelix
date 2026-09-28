import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
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
  verification: {
    google: "4o3NyYXO-oCyTIei_hlKZfz87B49ELEuTPkvz-uFzQo",
  },
  title: "Hirelix | Your Personal AI Agent for Headhunting",
  description:
    "Work with your candidates, manage ongoing client roles, and prepare submissions with a personal AI agent that keeps your work in context.",
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
    title: "Hirelix | Your Personal AI Agent for Headhunting",
    description:
      "Work with your candidates, manage ongoing client roles, and prepare submissions with a personal AI agent that keeps your work in context.",
    type: "website",
    url: "https://hirelix.online",
    siteName: "Hirelix",
    images: [
      {
        url: "https://hirelix.online/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Hirelix — your personal AI agent for headhunting",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hirelix | Your Personal AI Agent for Headhunting",
    description:
      "Work with your candidates, manage ongoing client roles, and prepare submissions with a personal AI agent that keeps your work in context.",
    images: ["https://hirelix.online/opengraph-image"],
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
            if (!window.location.pathname.startsWith('/ops/')) {
              gtag('js', new Date());
              gtag('config', 'G-17R1B6K2BK');
              gtag('config', 'AW-16927084361');
            }
          `}
        </Script>
        <AuthProvider>
          <LanguageProvider>
            <GrowthTracker />
            {children}
          </LanguageProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
