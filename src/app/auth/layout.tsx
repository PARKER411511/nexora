import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <Link className="brand auth-brand" href="/">
        <span className="brand-mark" aria-hidden="true">
          ✳
        </span>{" "}
        Nexora
      </Link>
      {children}
    </main>
  );
}
