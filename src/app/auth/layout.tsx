import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <aside className="auth-aside" aria-labelledby="auth-aside-title">
          <div className="auth-aside-art" aria-hidden="true" />
          <div className="auth-aside-topbar">
            <Link className="brand auth-aside-brand" href="/">
              <span className="brand-mark" aria-hidden="true">✳</span>
              Nexora
            </Link>
            <Link className="auth-back-link" href="/">
              Back to website
              <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.8} />
            </Link>
          </div>
          <div className="auth-aside-copy">
            <div className="section-kicker">Private project workspace</div>
            <h2 id="auth-aside-title">Make space for clear work.</h2>
            <p>Bring the brief, scope, and review decisions into one calm place.</p>
          </div>
        </aside>
        <section className="auth-content">
          <div className="auth-mobile-topbar">
            <Link className="brand auth-brand" href="/">
              <span className="brand-mark" aria-hidden="true">✳</span>
              Nexora
            </Link>
            <Link className="auth-mobile-back" href="/">
              Back to website
              <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.8} />
            </Link>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
