"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
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

export function ProfileForm({ profile, email, emailConfirmedAt }: { profile: AccountProfile; email: string; emailConfirmedAt?: string | null }) {
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
  const [avatarKey, setAvatarKey] = useState(profile.avatarObjectKey ?? "");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");
  useEffect(() => {
    if (!avatarKey) { setAvatarUrl(""); return; }
    fetch("/api/account/avatar").then(async (response) => { const data = await response.json(); if (response.ok) setAvatarUrl(data.signedUrl ?? ""); }).catch(() => setAvatarUrl(""));
  }, [avatarKey]);

  function update(field: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setError("");
    setMessage("");
  }

  async function uploadAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarBusy(true); setAvatarError(""); setAvatarMessage("");
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/account/avatar", { method: "POST", body: form });
      const payload = (await response.json()) as { error?: string; avatar?: { objectKey: string } };
      if (!response.ok || !payload.avatar) throw new Error(payload.error || "Profile photo could not be saved.");
      setAvatarKey(payload.avatar.objectKey); setAvatarMessage("Profile photo saved.");
    } catch (reason) { setAvatarError(reason instanceof Error ? reason.message : "Profile photo could not be saved."); }
    finally { setAvatarBusy(false); event.target.value = ""; }
  }

  async function removeAvatar() {
    if (!avatarKey || !window.confirm("Remove your profile photo?")) return;
    setAvatarBusy(true); setAvatarError(""); setAvatarMessage("");
    try {
      const response = await fetch("/api/account/avatar", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ objectKey: avatarKey }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Profile photo could not be removed.");
      setAvatarKey(""); setAvatarMessage("Profile photo removed.");
    } catch (reason) { setAvatarError(reason instanceof Error ? reason.message : "Profile photo could not be removed."); }
    finally { setAvatarBusy(false); }
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
          {avatarUrl ? <img alt="" src={avatarUrl} /> : avatar}
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
          <h2>{emailConfirmedAt ? "Verified email" : "Email verification"}</h2>
          <p className="profile-email">{email}</p>
          <p className="profile-muted">{emailConfirmedAt ? "Your sign-in email is verified in Supabase Auth." : "Verify your email before inviting teammates or changing sensitive account settings."}</p>
          {!emailConfirmedAt && <VerificationResend email={email} />}
          <ChangeEmail currentEmail={email} />
          <Link className="button-secondary" href={`/auth/forgot-password?email=${encodeURIComponent(email)}`}>
            Reset password
          </Link>
          <div className="security-divider" />
          <h3>Profile photo</h3>
          <p className="profile-muted">JPG, PNG, or WebP up to 2 MB.</p>
          <label className="button-secondary profile-upload-button">{avatarBusy ? "Uploading…" : "Choose photo"}<input accept="image/jpeg,image/png,image/webp" disabled={avatarBusy} onChange={uploadAvatar} type="file" /></label>
          {avatarKey && <button className="button-secondary" disabled={avatarBusy} onClick={removeAvatar} type="button">Remove photo</button>}
          {avatarMessage && <small className="form-success" role="status">{avatarMessage}</small>}
          {avatarError && <small className="form-error" role="alert">{avatarError}</small>}
          <AccountDataAndSupport />
          <SecurityControls email={email} />
          <DeleteAccount />
        </aside>
      </div>
    </div>
  );
}

function AccountDataAndSupport() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim() || !body.trim()) { setError("Add a subject and message."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/support", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, body }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send support request.");
      setSubject(""); setBody(""); setMessage("Request saved to the support queue.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not send support request."); }
    finally { setBusy(false); }
  }
  return <div className="security-inline account-data-support">
    <div className="security-divider" />
    <div className="section-kicker">Account data & support</div>
    <h3>Take your data with you</h3>
    <p className="profile-muted">Download a JSON copy of your profile and saved project history whenever you need it.</p>
    <a className="button-secondary" download href="/api/account/export">Download account data</a>
    <div className="security-divider" />
    <h3>Contact support</h3>
    <p className="profile-muted">Send a private request to the Nexora support queue. No email is sent automatically.</p>
    <form className="security-form" onSubmit={submit}>
      <input aria-label="Support subject" maxLength={160} onChange={(event) => setSubject(event.target.value)} placeholder="Subject" value={subject} />
      <textarea aria-label="Support message" maxLength={4000} onChange={(event) => setBody(event.target.value)} placeholder="How can we help?" value={body} />
      <button className="button-secondary" disabled={busy} type="submit">{busy ? "Sending…" : "Send support request"}</button>
    </form>
    {message && <small className="form-success" role="status">{message}</small>}
    {error && <small className="form-error" role="alert">{error}</small>}
  </div>;
}

function VerificationResend({ email }: { email: string }) {
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function resend() {
    if (cooldown > 0) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true); setError(""); setMessage("");
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
    if (resendError) setError(resendError.message);
    else { setMessage("Verification link requested. Email delivery depends on your Supabase provider configuration."); setCooldown(60); }
    setBusy(false);
  }
  useEffect(() => { if (cooldown <= 0) return; const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, [cooldown]);
  return <div className="security-inline"><button className="button-secondary" disabled={busy || cooldown > 0} onClick={resend} type="button">{busy ? "Requesting…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification"}</button>{message && <small className="form-success">{message}</small>}{error && <small className="form-error">{error}</small>}</div>;
}

function ChangeEmail({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || email.trim().toLowerCase() === currentEmail.toLowerCase()) { setError("Enter a different email address."); return; }
    const supabase = getSupabaseBrowserClient(); if (!supabase) return;
    setBusy(true); setError(""); setMessage("");
    const result = await supabase.auth.updateUser({ email: email.trim() });
    if (result.error) setError(result.error.message); else { setMessage("Change requested. Confirm the new address using the verification link from your Auth provider."); setEmail(""); }
    setBusy(false);
  }
  return <div className="security-inline"><h3>Change sign-in email</h3><form className="security-form" onSubmit={submit}><input aria-label="New email address" autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="new@example.com" required type="email" value={email} /><button className="button-secondary" disabled={busy} type="submit">{busy ? "Requesting…" : "Request email change"}</button></form>{message && <small className="form-success" role="status">{message}</small>}{error && <small className="form-error" role="alert">{error}</small>}</div>;
}

function DeleteAccount() {
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== "DELETE MY ACCOUNT") { setError("Type DELETE MY ACCOUNT exactly to continue."); return; }
    if (!window.confirm("Request account deletion? Team ownership and stored files must be resolved first.")) return;
    setBusy(true); setError(""); setMessage("");
    try { const response = await fetch("/api/account/delete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation, reason }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Account deletion could not be requested."); if (data.status === "completed") { window.location.assign("/auth/sign-in"); return; } setMessage(data.message || "Deletion request recorded."); setConfirmation(""); } catch (reasonValue) { setError(reasonValue instanceof Error ? reasonValue.message : "Account deletion could not be requested."); } finally { setBusy(false); }
  }
  return <div className="security-inline account-delete"><div className="security-divider" /><h3>Delete account</h3><p className="profile-muted">Nexora records the request only after private files, team ownership, and memberships are safe to remove. Auth deletion is completed by the configured server operator.</p><form className="security-form" onSubmit={submit}><textarea aria-label="Deletion reason" maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Optional reason" value={reason} /><input aria-label="Deletion confirmation" onChange={(event) => setConfirmation(event.target.value)} placeholder="DELETE MY ACCOUNT" value={confirmation} /><button className="button-danger" disabled={busy} type="submit">{busy ? "Requesting…" : "Request account deletion"}</button></form>{message && <small className="form-success" role="status">{message}</small>}{error && <small className="form-error" role="alert">{error}</small>}</div>;
}

function SecurityControls({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [factorId, setFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [freshCode, setFreshCode] = useState("");
  const [freshChallengeId, setFreshChallengeId] = useState("");
  const [freshPassword, setFreshPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [mfaEnabled, setMfaEnabled] = useState(false);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      const verified = data?.totp?.find((factor) => factor.status === "verified");
      if (verified) { setFactorId(verified.id); setMfaEnabled(true); }
    });
  }, []);

  async function beginMfa() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true); setError(""); setMessage("");
    const factors = await supabase.auth.mfa.listFactors();
    const verified = factors.data?.totp?.find((factor) => factor.status === "verified");
    if (verified) { setFactorId(verified.id); setMfaEnabled(true); setMessage("TOTP MFA is enabled."); setBusy(false); return; }
    const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Nexora authenticator" });
    if (enrolled.error || !enrolled.data) setError(enrolled.error?.message || "Could not start MFA setup.");
    else { setFactorId(enrolled.data.id); setQrCode(enrolled.data.totp.qr_code); setMessage("Scan the QR code with your authenticator, then enter the six-digit code."); }
    setBusy(false);
  }

  async function verifyMfa() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !factorId || !/^\d{6}$/.test(code)) { setError("Enter the six-digit authenticator code."); return; }
    setBusy(true); setError("");
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error || !challenge.data) { setError(challenge.error?.message || "Could not challenge MFA factor."); setBusy(false); return; }
    const result = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    if (result.error) setError(result.error.message); else { setMfaEnabled(true); setQrCode(""); setCode(""); setMessage("TOTP MFA enabled for this account."); }
    setBusy(false);
  }

  async function unenrollMfa() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !factorId || !window.confirm("Remove TOTP MFA from this account?")) return;
    setBusy(true); setError("");
    const result = await supabase.auth.mfa.unenroll({ factorId });
    if (result.error) setError(result.error.message); else { setMfaEnabled(false); setFactorId(""); setMessage("TOTP MFA removed."); }
    setBusy(false);
  }

  async function verifyFreshSession() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !factorId || !/^\d{6}$/.test(freshCode)) { setError("Enter the six-digit authenticator code."); return; }
    setBusy(true); setError(""); setMessage("");
    const challenge = freshChallengeId ? { data: { id: freshChallengeId }, error: null } : await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error || !challenge.data) { setError(challenge.error?.message || "Could not start the MFA challenge."); setBusy(false); return; }
    const result = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: freshCode });
    if (result.error) setError(result.error.message); else { setFreshCode(""); setFreshChallengeId(""); setMessage("Fresh TOTP verification complete. Sensitive actions can now be retried."); }
    setBusy(false);
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    if (newPassword.length < 8 || newPassword !== confirmPassword) { setError("Use at least 8 characters and confirm the new password."); return; }
    setBusy(true); setError(""); setMessage("");
    const reauth = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (reauth.error) { setError("Current password was not accepted."); setBusy(false); return; }
    if (mfaEnabled) {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data) { setError("Password accepted. Complete a fresh TOTP challenge before changing the password."); setBusy(false); return; }
      const verified = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code: freshCode });
      if (verified.error) { setError("Password accepted, but the fresh TOTP code was not verified. Try again from this form."); setBusy(false); return; }
    }
    const updated = await supabase.auth.updateUser({ password: newPassword });
    if (updated.error) setError(updated.error.message); else { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setMessage("Password changed. Other sessions may need to sign in again."); }
    setBusy(false);
  }

  async function verifyFreshPassword() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !freshPassword) { setError("Enter your current password to verify a fresh session."); return; }
    setBusy(true); setError(""); setMessage("");
    const result = await supabase.auth.signInWithPassword({ email, password: freshPassword });
    if (result.error) setError("Password verification failed. Try your current password again.");
    else { setFreshPassword(""); setMessage("Fresh password verification complete. Retry the sensitive action now."); }
    setBusy(false);
  }

  async function signOutEverywhere() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !window.confirm("Sign out of every Nexora session?")) return;
    setBusy(true); const result = await supabase.auth.signOut({ scope: "global" });
    if (result.error) setError(result.error.message); else window.location.assign("/auth/sign-in");
    setBusy(false);
  }

  return <div className="security-controls">
    <div className="security-divider" />
    <div className="section-kicker">Security</div>
    <h3>Password</h3>
    <form className="security-form" onSubmit={changePassword}>
      <input aria-label="Current password" autoComplete="current-password" onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" required type="password" value={currentPassword} />
      {mfaEnabled && <input aria-label="Fresh TOTP code for password change" inputMode="numeric" maxLength={6} onChange={(e) => setFreshCode(e.target.value.replace(/\D/g, ""))} placeholder="Fresh six-digit TOTP code" required={mfaEnabled} value={freshCode} />}
      <input aria-label="New password" autoComplete="new-password" minLength={8} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" required type="password" value={newPassword} />
      <input aria-label="Confirm new password" autoComplete="new-password" onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" required type="password" value={confirmPassword} />
      <button className="button-secondary" disabled={busy} type="submit">Change password</button>
    </form>
    {!mfaEnabled && <div className="security-form"><label className="field"><span>Fresh password verification</span><input aria-label="Fresh password verification" autoComplete="current-password" onChange={(e) => setFreshPassword(e.target.value)} placeholder="Current password" type="password" value={freshPassword} /></label><button className="button-secondary" disabled={busy || !freshPassword} onClick={() => void verifyFreshPassword()} type="button">Verify fresh password</button><small className="field-help">Use this before account deletion or another sensitive action after your last sign-in is older than 15 minutes.</small></div>}
    <div className="security-divider" />
    <h3>Two-factor authentication</h3>
    <p className="profile-muted">Use a TOTP authenticator. The QR code and secret stay in your browser.</p>
    {qrCode && <img alt="Authenticator setup QR code" className="mfa-qr" src={qrCode} />}
    {!mfaEnabled ? <button className="button-secondary" disabled={busy} onClick={beginMfa} type="button">Set up TOTP MFA</button> : <button className="button-secondary" disabled={busy} onClick={unenrollMfa} type="button">Remove TOTP MFA</button>}
    {qrCode && <div className="security-form"><input aria-label="Authenticator code" inputMode="numeric" maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="Six-digit code" value={code} /><button className="button-primary" disabled={busy} onClick={verifyMfa} type="button">Verify authenticator</button></div>}
    {mfaEnabled && <div className="security-form"><label className="field"><span>Fresh TOTP challenge for sensitive actions</span><input aria-label="Fresh TOTP code" inputMode="numeric" maxLength={6} onChange={(e) => setFreshCode(e.target.value.replace(/\D/g, ""))} placeholder="Six-digit code" value={freshCode} /></label><button className="button-secondary" disabled={busy} onClick={verifyFreshSession} type="button">Verify fresh TOTP</button><small className="field-help">Admins also need fresh TOTP for protected admin controls. If verification expires, return here and retry.</small></div>}
    {message && <p className="form-success" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}
    <button className="button-secondary" disabled={busy} onClick={signOutEverywhere} type="button">Sign out all sessions</button>
  </div>;
}
