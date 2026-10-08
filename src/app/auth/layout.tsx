import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <Link className="brand auth-brand" href="/">
          <span className="brand-mark" aria-hidden="true">✳</span>
          Nexora
        </Link>
        <Link className="auth-back-link" href="/">
          Back to website
          <ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.8} />
        </Link>
      </header>
      <section className="auth-content">{children}</section>
    </main>
  );
}
