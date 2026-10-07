import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <aside className="auth-aside" aria-label="About Nexora">
          <div className="auth-aside-art" role="img" aria-label="A red light cutting through a dark project room" />
          <Link className="brand auth-aside-brand" href="/">
            <span className="brand-mark" aria-hidden="true">✳</span>
            Nexora
          </Link>
          <div className="auth-aside-copy">
            <div className="section-kicker">Private project room</div>
            <h2>Clear scope. Confident next steps.</h2>
            <p>Keep the brief, scope, and review decisions in one calm place built for independent teams.</p>
            <div className="auth-aside-steps" aria-label="Nexora workflow">
              <span><b>01</b> Brief</span>
              <span><b>02</b> Scope</span>
              <span><b>03</b> Review</span>
            </div>
          </div>
          <div className="auth-aside-footer">You choose who can review your work.</div>
        </aside>
        <section className="auth-content">
          <Link className="brand auth-brand" href="/">
            <span className="brand-mark" aria-hidden="true">✳</span>
            Nexora
          </Link>
          {children}
        </section>
      </div>
    </main>
  );
}
