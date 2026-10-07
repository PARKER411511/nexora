"use client";

import Link from "next/link";
import { Copy, Crown, RefreshCw, UserMinus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type { Workspace, WorkspaceRole } from "@/lib/types";
import type { WorkspaceMember } from "@/lib/supabase/repository";

type Invite = { id: string; email: string; role: string; url?: string; status: string; emailDeliveryStatus: string };

export function WorkspaceTeam() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<WorkspaceRole, "owner">>("viewer");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const current = workspaces.find((item) => item.id === workspaceId);

  async function loadWorkspaces() {
    setError("");
    const response = await fetch("/api/workspaces");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load workspaces.");
    const next = (data.workspaces ?? []) as Workspace[];
    setWorkspaces(next);
    setWorkspaceId((selected) => selected || next.find((item) => !item.personal)?.id || next[0]?.id || "");
  }
  async function loadMembers(id: string) {
    if (!id) return;
    const response = await fetch(`/api/workspaces/${id}/members`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load members.");
    setMembers(data.members ?? []);
  }
  useEffect(() => { void loadWorkspaces().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load workspaces.")); }, []);
  useEffect(() => { if (workspaceId) void loadMembers(workspaceId).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load members.")); }, [workspaceId]);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (!workspaceId || !email.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/invites`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create invitation.");
      setInvites((items) => [{ ...(data.invite ?? {}), email, role, url: data.url, status: "pending", emailDeliveryStatus: "undelivered" }, ...items]);
      setEmail(""); setMessage(data.message || "Invitation link ready to copy.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create invitation."); }
    finally { setBusy(false); }
  }
  async function updateMember(userId: string, action: { role?: string; transferOwnership?: boolean }) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, ...action }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update member.");
      await loadMembers(workspaceId); setMessage(action.transferOwnership ? "Workspace ownership transferred." : "Member role updated.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update member."); }
    finally { setBusy(false); }
  }
  async function removeMember(member: WorkspaceMember) {
    if (!window.confirm(`Remove ${member.name || member.email} from this workspace?`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: member.userId }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not remove member.");
      setMembers((items) => items.filter((item) => item.userId !== member.userId)); setMessage("Member removed.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove member."); }
    finally { setBusy(false); }
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setMessage("Link copied."); } catch { setMessage("Select the link and copy it manually."); } }

  return <div className="workspace-main"><div className="workspace-heading"><div><div className="section-kicker">Workspace / team</div><h1>People and permissions</h1><p>Invite collaborators, set roles, and keep workspace ownership explicit.</p></div><Link className="button-secondary" href="/workspace">Back to overview</Link></div>
    <section className="overview-card team-toolbar"><label className="field"><span>Workspace</span><select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}{item.personal ? " (personal)" : ""}</option>)}</select></label><button className="button-secondary" disabled={busy} onClick={() => void loadMembers(workspaceId)} type="button"><RefreshCw size={13} /> Refresh</button></section>
    {!current ? <section className="empty-state"><Users size={18} /><p>Create or accept a team workspace to manage members.</p></section> : <div className="team-grid"><section className="overview-card"><div className="overview-card-header"><div><div className="section-kicker">Members</div><h2>{members.length} people</h2></div><span className="overview-helper">Owner and admin actions require fresh verification.</span></div>{members.length ? <div className="member-list">{members.map((member) => <div className="member-row" key={member.userId}><div><strong>{member.name || member.email}</strong><span>{member.email} · {member.role}</span></div><div className="member-actions">{member.role !== "owner" && (current.role === "owner" || current.role === "admin") && <><select aria-label={`Role for ${member.email}`} disabled={busy} value={member.role} onChange={(event) => void updateMember(member.userId, { role: event.target.value })}><option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option></select><button aria-label={`Remove ${member.email}`} className="icon-button" disabled={busy} onClick={() => void removeMember(member)} type="button"><UserMinus size={14} /></button><button className="button-quiet" disabled={busy} onClick={() => { if (window.confirm(`Transfer workspace ownership to ${member.email}?`)) void updateMember(member.userId, { transferOwnership: true }); }} type="button"><Crown size={13} /> Transfer</button></>}</div></div>)}</div> : <p className="empty-history">No members found. Refresh after the workspace migration is applied.</p>}</section><section className="overview-card"><div className="section-kicker">Invite a collaborator</div><h2>Copyable invitation</h2><p className="profile-muted">Nexora does not send email. The invited account must sign in with the exact invited email before accepting.</p><form className="security-form" onSubmit={invite}><label className="field"><span>Email</span><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" required type="email" value={email} /></label><label className="field"><span>Role</span><select onChange={(event) => setRole(event.target.value as typeof role)} value={role}><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option></select></label><button className="button-primary" disabled={busy} type="submit">{busy ? "Creating…" : "Create invitation link"}</button></form>{invites.map((invite) => <div className="invite-result" key={invite.id || invite.url}><strong>{invite.email}</strong><span>Undelivered · {invite.role}</span>{invite.url && <div><code>{invite.url}</code><button className="button-quiet" onClick={() => void copy(invite.url!)} type="button"><Copy size={13} /> Copy link</button></div>}</div>)}</section></div>}
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}
  </div>;
}
