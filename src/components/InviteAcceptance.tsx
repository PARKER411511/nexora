"use client";

import Link from "next/link";
import { useState } from "react";

export function InviteAcceptance({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function accept() {
    if (!token) { setError("This invitation link is missing its token."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/workspace-invites/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "This invitation could not be accepted.");
      setMessage(`You joined the workspace as ${data.membership?.role ?? "a member"}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This invitation could not be accepted."); }
    finally { setBusy(false); }
  }
  return <main className="auth-main"><section className="auth-card"><div className="section-kicker">Workspace invitation</div><h1>Join your team workspace.</h1><p>Accept this invitation while signed in with the email address it was sent to. Email delivery is disabled, so the sender shared this link directly.</p>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}<div className="auth-actions"><button className="button-primary" disabled={busy || Boolean(message)} onClick={accept} type="button">{busy ? "Checking invitation…" : "Accept invitation"}</button><Link className="button-secondary" href="/workspace">Open workspace</Link></div></section></main>;
}
