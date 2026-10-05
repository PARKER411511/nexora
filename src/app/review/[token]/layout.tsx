import Link from "next/link";

export default function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="site-header">
        <Link className="brand" href="/">
          <span className="brand-mark">✳</span> Nexora
        </Link>
        <span className="local-pill">SCOPE REVIEW</span>
      </header>
      {children}
    </>
  );
}
