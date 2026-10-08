import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import "../(landing)/landing.css";
import "./resources.css";

export default function ResourcesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="ha-landing hr-site">
      <a className="ha-skip" href="#main">
        Skip to content
      </a>
      <header className="ha-header">
        <nav className="ha-nav ha-wrap" aria-label="Main navigation">
          <Link className="ha-logo" href="/" aria-label="Hirelix home">
            <BrandMark small />
            Hirelix
          </Link>
          <div className="hr-nav">
            <Link href="/product">Your assistant</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/guides/candidate-rediscovery">Guides</Link>
          </div>
          <Link
            className="ha-button ha-button-small"
            href="/app?entry=free_trial"
          >
            Get started
          </Link>
        </nav>
      </header>
      <main id="main" className="hr-main">
        {children}
      </main>
      <footer className="ha-footer ha-wrap">
        <Link className="ha-logo" href="/">
          Hirelix
        </Link>
        <span>Your personal AI agent for headhunting.</span>
        <div>
          <Link href="/product">Product</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/refund-policy">Refunds</Link>
        </div>
        <small>Hirelix is operated by YieldMirror.</small>
      </footer>
    </div>
  );
}
