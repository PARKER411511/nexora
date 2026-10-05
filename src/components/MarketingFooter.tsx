import Link from "next/link";

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="site-footer">
        <div>
          <Link className="brand" href="/">
            <span aria-hidden="true" className="brand-mark">
              ✳
            </span>
            Nexora
          </Link>
          <p className="footer-note">
            A brief-to-scope workspace for independent web teams.
          </p>
        </div>
        <div className="footer-col">
          <h4>Explore</h4>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/about">About Nexora</Link>
        </div>
        <div className="footer-col">
          <h4>Workspace</h4>
          <Link href="/workspace">Overview</Link>
          <Link href="/workspace/new">New project</Link>
          <Link href="/workspace">Open workspace</Link>
        </div>
        <div className="footer-col">
          <h4>Principles</h4>
          <Link href="/#faq">FAQ</Link>
          <Link href="/about#privacy">Privacy by default</Link>
          <Link href="/about#changes">Clear change handling</Link>
        </div>
      </div>
      <div className="copyright">
        <span>© 2026 Nexora. Clear by design.</span>
        <span>Built for focused project conversations</span>
      </div>
    </footer>
  );
}
