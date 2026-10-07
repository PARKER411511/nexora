"use client";

import { Copy, Link2, RefreshCw, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";

type Invitation = { id: string; email: string; status: string; dueAt?: string | null; emailDeliveryStatus: string; createdAt: string };

export function ReviewSharingPanel({ projectId, reviewToken, initialInvitedOnly = false }: { projectId: string; reviewToken?: string; initialInvitedOnly?: boolean }) {
  const [invitedOnly, setInvitedOnly] = useState(initialInvitedOnly);
  const [email, setEmail] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [snapshotRevoked, setSnapshotRevoked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function refresh() {
    const response = await fetch(`/api/projects/${projectId}/review-access`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load reviewer access.");
    setInvitations(data.invitations ?? []);
  }
  useEffect(() => { if (reviewToken) void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load reviewer access.")); }, [projectId, reviewToken]);
  async function setAccess(next: boolean) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/review-access`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "access", invitedOnly: next }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not update review access.");
      setInvitedOnly(next); setMessage(next ? "Only invited, confirmed accounts can open this review." : "Anyone with the signed-in review link can open it.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update review access."); }
    finally { setBusy(false); }
  }
  async function invite(event: React.FormEvent) {
    event.preventDefault(); if (!reviewToken || !email.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/review-access`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ snapshotToken: reviewToken, email, dueAt: dueAt || null }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not invite reviewer.");
      setEmail(""); setDueAt(""); await refresh(); setMessage(data.message || "Invitation saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not invite reviewer."); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    if (!window.confirm("Revoke this reviewer invitation? Existing responses remain in history.")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/review-access`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "revoke", inviteId: id }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not revoke invitation.");
      await refresh(); setMessage("Invitation revoked.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not revoke invitation."); }
    finally { setBusy(false); }
  }
  async function revokeSnapshot() {
    if (!reviewToken || !window.confirm("Revoke this review link? The approval and response history stays preserved, but the link will never work again.")) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/review-access`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "revokeSnapshot", snapshotToken: reviewToken }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not revoke review link.");
      setSnapshotRevoked(true); setMessage("Review link revoked. Historical responses remain available to the project owner.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not revoke review link."); }
    finally { setBusy(false); }
  }
  async function copyLink() { if (!reviewToken) return; try { await navigator.clipboard.writeText(`${window.location.origin}/review/${reviewToken}`); setMessage("Review link copied."); } catch { setMessage("Select the link and copy it manually."); } }
  return <section className="share-panel card"><div className="change-panel-heading"><div><div className="section-kicker">Review access</div><h2>Share with the right people</h2></div><button aria-label="Refresh invitations" className="icon-button" disabled={busy || !reviewToken || snapshotRevoked} onClick={() => void refresh()} type="button"><RefreshCw size={14} /></button></div>{reviewToken && !snapshotRevoked ? <><div className="share-mode"><label><input checked={!invitedOnly} disabled={busy} onChange={() => void setAccess(false)} type="radio" /> Signed-in link</label><label><input checked={invitedOnly} disabled={busy} onChange={() => void setAccess(true)} type="radio" /> Invited accounts only</label></div><div className="share-actions"><button className="button-secondary" disabled={busy} onClick={() => void copyLink()} type="button"><Copy size={13} /> Copy review link</button><button className="button-danger" disabled={busy} onClick={() => void revokeSnapshot()} type="button"><X size={13} /> Revoke link</button></div><form className="invite-review-form" onSubmit={invite}><input aria-label="Reviewer email" onChange={(event) => setEmail(event.target.value)} placeholder="reviewer@example.com" required type="email" value={email} /><input aria-label="Review due date" onChange={(event) => setDueAt(event.target.value)} type="datetime-local" value={dueAt} /><button className="button-primary" disabled={busy} type="submit"><UserPlus size={13} /> Invite reviewer</button></form>{invitations.length ? <div className="invitation-list">{invitations.map((invite) => <div className="invitation-row" key={invite.id}><div><strong>{invite.email}</strong><span>{invite.status} · {invite.emailDeliveryStatus}{invite.dueAt ? ` · due ${new Date(invite.dueAt).toLocaleString()}` : ""}</span></div>{invite.status !== "revoked" && <button aria-label={`Revoke ${invite.email}`} className="icon-button" disabled={busy} onClick={() => void revoke(invite.id)} type="button"><X size={14} /></button>}</div>)}</div> : <p className="empty-history">No reviewer invitations yet.</p>}</> : <p className="empty-history">{snapshotRevoked ? "This review link has been revoked; history remains available in the project." : "Share this project first to create an immutable review snapshot."}</p>}{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}</section>;
}
