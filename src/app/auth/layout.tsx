import Link from "next/link";
import { ArrowUpRight, Check, FileText, FolderKanban } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <aside className="auth-aside" aria-label="About Nexora">
          <div className="auth-aside-art" aria-hidden="true" />
          <div className="auth-aside-topbar">
            <Link className="brand auth-aside-brand" href="/">
              <span className="brand-mark" aria-hidden="true">✳</span>
              Nexora
            </Link>
            <Link className="auth-back-link" href="/">
              Back to site
              <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.8} />
            </Link>
          </div>
          <div className="auth-aside-copy">
            <div className="section-kicker">A private project room</div>
            <h2 id="auth-aside-title">Keep the work clear.</h2>
            <p>Bring the brief, scope, and review decisions into one calm place.</p>
            <div className="auth-workspace-preview" aria-label="Example Nexora workspace preview">
              <div className="auth-preview-topline">
                <span><FolderKanban aria-hidden="true" size={13} /> Product launch</span>
                <span className="auth-preview-badge">Example</span>
              </div>
              <div className="auth-preview-row">
                <span className="auth-preview-icon"><FileText aria-hidden="true" size={13} /></span>
                <span><strong>Brief</strong><small>Audience, outcome, constraints</small></span>
                <Check aria-hidden="true" className="auth-preview-check" size={14} />
              </div>
              <div className="auth-preview-row">
                <span className="auth-preview-icon auth-preview-icon-red"><span aria-hidden="true">02</span></span>
                <span><strong>Scope</strong><small>Decisions ready for review</small></span>
                <span className="auth-preview-state">In focus</span>
              </div>
              <div className="auth-preview-note">A small view of the work in progress.</div>
            </div>
          </div>
          <div className="auth-aside-footer"><span aria-hidden="true">✳</span> You choose who can review your work.</div>
        </aside>
        <section className="auth-content">
          <div className="auth-mobile-topbar">
            <Link className="brand auth-brand" href="/">
              <span className="brand-mark" aria-hidden="true">✳</span>
              Nexora
            </Link>
            <Link className="auth-mobile-back" href="/">
              Back to site
              <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.8} />
            </Link>
          </div>
          {children}
        </section>
      </div>
    </main>
  );
}
