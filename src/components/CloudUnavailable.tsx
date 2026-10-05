import Link from "next/link";

export function CloudUnavailable({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={compact ? "cloud-unavailable compact" : "cloud-unavailable"}
    >
      <div className="section-kicker">Private workspace setup</div>
      <h1>Workspace setup is in progress.</h1>
      <p>
        The private workspace is temporarily unavailable while its account and
        storage services are being connected. Please try again soon.
      </p>
      <div className="auth-actions">
        <Link className="button-primary" href="/">
          Back to Nexora
        </Link>
        <Link className="button-secondary" href="/how-it-works">
          Read how it works
        </Link>
      </div>
    </div>
  );
}
