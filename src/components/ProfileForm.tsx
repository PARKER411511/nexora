"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AccountProfile } from "@/lib/types";

function initials(name: string, email: string) {
  const source = name.trim() || email.split("@")[0] || "N";
  const parts = source.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function ProfileForm({ profile, email }: { profile: AccountProfile; email: string }) {
  const [draft, setDraft] = useState({
    fullName: profile.fullName,
    company: profile.company,
    roleTitle: profile.roleTitle,
    website: profile.website,
    bio: profile.bio,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const avatar = useMemo(() => initials(draft.fullName, email), [draft.fullName, email]);

  function update(field: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError("");
    setMessage("");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/account/profile", {
        body: JSON.stringify(draft),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      });
      const payload = (await response.json()) as { error?: string; profile?: AccountProfile };
      if (!response.ok) throw new Error(payload.error || "Profile could not be saved.");
      if (payload.profile) {
        setDraft({
          fullName: payload.profile.fullName,
          company: payload.profile.company,
          roleTitle: payload.profile.roleTitle,
          website: payload.profile.website,
          bio: payload.profile.bio,
        });
      }
      setMessage("Profile saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Profile could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace-main">
      <div className="workspace-heading">
        <div>
          <div className="section-kicker">Account / profile</div>
          <h1>Your profile</h1>
          <p>Update the details saved with your Nexora account.</p>
        </div>
        <div className="profile-avatar profile-avatar-large" aria-label={`Profile initials ${avatar}`}>
          {avatar}
        </div>
      </div>
      <div className="profile-layout">
        <section className="overview-card">
          <div className="overview-card-header">
            <div>
              <div className="section-kicker">Account details</div>
              <h2>Profile information</h2>
            </div>
            <span className="overview-helper">Updates save to your Nexora account.</span>
          </div>
          <form className="profile-form" onSubmit={save}>
            <div className="profile-form-grid">
              <label className="field">
                <span>Full name</span>
                <input maxLength={120} onChange={(event) => update("fullName", event.target.value)} value={draft.fullName} />
              </label>
              <label className="field">
                <span>Company</span>
                <input maxLength={120} onChange={(event) => update("company", event.target.value)} value={draft.company} />
              </label>
              <label className="field">
                <span>Role or title</span>
                <input maxLength={120} onChange={(event) => update("roleTitle", event.target.value)} value={draft.roleTitle} />
              </label>
              <label className="field">
                <span>Website</span>
                <input
                  autoComplete="url"
                  maxLength={300}
                  onChange={(event) => update("website", event.target.value)}
                  placeholder="https://example.com"
                  type="url"
                  value={draft.website}
                />
              </label>
            </div>
            <label className="field">
              <span>Short bio</span>
              <textarea maxLength={2000} onChange={(event) => update("bio", event.target.value)} value={draft.bio} />
              <small className="field-hint">Up to 2,000 characters.</small>
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            {message && <p className="form-success" role="status">{message}</p>}
            <div className="profile-actions">
              <button className="button-primary" disabled={busy} type="submit">
                {busy ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>
        </section>
        <aside className="profile-security overview-card">
          <div className="section-kicker">Account security</div>
          <h2>Verified email</h2>
          <p className="profile-email">{email}</p>
          <p className="profile-muted">Your sign-in email comes from Supabase Auth and cannot be edited here.</p>
          <Link className="button-secondary" href={`/auth/forgot-password?email=${encodeURIComponent(email)}`}>
            Reset password
          </Link>
        </aside>
      </div>
    </div>
  );
}
