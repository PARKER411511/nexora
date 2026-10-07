"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { safeNextPath } from "@/lib/supabase/auth";

type AuthMode = "signin" | "signup" | "forgot" | "reset";

function readableAuthError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : "";
  if (/invalid login credentials/i.test(message))
    return "That email and password combination was not recognized.";
  if (/email not confirmed/i.test(message))
    return "Confirm your email before signing in, then try again.";
  if (/user already registered/i.test(message))
    return "An account with this email already exists. Try signing in instead.";
  if (/rate limit|too many requests/i.test(message))
    return "Too many attempts. Wait a moment and try again.";
  if (/session|expired|invalid/i.test(message) && message.length < 180)
    return "This link has expired or is no longer valid. Request a fresh link and try again.";
  return message || "Authentication failed. Try again.";
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <span className="password-control">
        <input
          autoComplete={autoComplete}
          id={id}
          minLength={minLength}
          onChange={(event) => onChange(event.target.value)}
          required
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="password-toggle"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </span>
    </div>
  );
}

export function AuthForm({
  mode,
  next,
  initialError,
  initialEmail = "",
}: {
  mode: AuthMode;
  next?: string;
  initialError?: string;
  initialEmail?: string;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState("");
  const [mfaChallengeId, setMfaChallengeId] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const safeNext = safeNextPath(next);

  function resetFeedback() {
    setError("");
    setMessage("");
    setCanResend(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    if (mode === "signup" && password !== passwordConfirm) {
      setError("Passwords do not match.");
      return;
    }
    if (mode === "reset" && password !== passwordConfirm) {
      setError("Passwords do not match.");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Cloud storage is not configured yet. Follow the setup guide first.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        const factors = await supabase.auth.mfa.listFactors();
        const factor = factors.data?.totp?.find((item) => item.status === "verified");
        if (factor) {
          const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
          if (challenge.error || !challenge.data) throw challenge.error ?? new Error("Could not start MFA challenge.");
          setMfaFactorId(factor.id);
          setMfaChallengeId(challenge.data.id);
          setMessage("Enter the code from your authenticator to finish signing in.");
          return;
        }
        window.location.assign(safeNext);
      } else if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) window.location.assign(safeNext);
        else {
          setMessage("Check your email to confirm your account, then sign in.");
          setCanResend(true);
        }
      } else if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`,
          },
        );
        if (resetError) throw resetError;
        setMessage("If an account uses that email, a password reset link is on its way.");
      } else {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setPassword("");
        setPasswordConfirm("");
        setMessage("Password updated. You can continue to your workspace.");
      }
    } catch (reason) {
      setError(readableAuthError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function verifyMfa(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !mfaFactorId || !mfaChallengeId) return;
    setBusy(true); setError("");
    try {
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: mfaFactorId, challengeId: mfaChallengeId, code: mfaCode });
      if (verifyError) throw verifyError;
      window.location.assign(safeNext);
    } catch (reason) {
      setError(readableAuthError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !email.trim()) return;
    setError("");
    setMessage("");
    setResendBusy(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
        },
      });
      if (resendError) throw resendError;
      setMessage("If the account is pending confirmation, a new link is on its way.");
    } catch (reason) {
      setError(readableAuthError(reason));
    } finally {
      setResendBusy(false);
    }
  }

  const title =
    mode === "signin"
      ? "Sign in to your workspace"
      : mode === "signup"
        ? "Create your private workspace"
        : mode === "forgot"
          ? "Reset your password"
          : "Choose a new password";
  const submitLabel =
    mode === "signin"
      ? "Sign in"
      : mode === "signup"
        ? "Create account"
        : mode === "forgot"
          ? "Send reset link"
          : "Update password";

  const intro =
    mode === "signin"
      ? "Pick up where you left off. Your briefs and review decisions are waiting."
      : mode === "signup"
        ? "Create one private home for the context behind your best work."
        : mode === "forgot"
          ? "Enter your account email and we’ll send a fresh recovery link if it matches a Nexora account."
          : "Choose a strong password to secure your Nexora workspace."

  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <div className="section-kicker">Nexora / private workspace</div>
        <h1>{title}</h1>
        <p className="auth-intro">{intro}</p>
      </div>
      <form className="auth-form" onSubmit={submit}>
        {mode === "signup" && (
          <label className="field" htmlFor="full-name">
            <span>Your name</span>
            <input
              autoComplete="name"
              id="full-name"
              maxLength={120}
              onChange={(event) => setFullName(event.target.value)}
              required
              value={fullName}
            />
          </label>
        )}
        {mode !== "reset" && (
          <label className="field" htmlFor="auth-email">
            <span>Email</span>
            <input
              autoComplete="email"
              id="auth-email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
        )}
        {mode !== "forgot" && (
          <PasswordField
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            id="auth-password"
            label="Password"
            minLength={mode === "signin" ? undefined : 8}
            onChange={setPassword}
            value={password}
          />
        )}
        {mode === "signup" && (
          <p className="field-hint auth-password-hint">Use at least 8 characters. A passphrase is easiest to remember.</p>
        )}
        {(mode === "signup" || mode === "reset") && (
          <PasswordField
            autoComplete="new-password"
            id="auth-password-confirm"
            label="Confirm password"
            minLength={8}
            onChange={setPasswordConfirm}
            value={passwordConfirm}
          />
        )}
        {error && (
          <p className="form-error auth-feedback" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="form-success auth-feedback" role="status">
            {message}
          </p>
        )}
        <button className="button-primary auth-submit" disabled={busy} type="submit">
          {busy ? "Working…" : submitLabel}
        </button>
        {mode === "signup" && canResend && (
          <button
            className="button-secondary"
            disabled={resendBusy}
            onClick={resendConfirmation}
            type="button"
          >
            {resendBusy ? "Sending…" : "Send confirmation again"}
          </button>
        )}
      </form>
      {mode === "signin" && mfaChallengeId && (
        <form className="auth-form mfa-challenge" onSubmit={verifyMfa}>
          <div className="field"><label htmlFor="mfa-code">Authenticator code</label><input autoComplete="one-time-code" id="mfa-code" inputMode="numeric" maxLength={6} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))} pattern="[0-9]{6}" required value={mfaCode} /></div>
          <button className="button-primary auth-submit" disabled={busy} type="submit">{busy ? "Verifying…" : "Verify and continue"}</button>
        </form>
      )}
      <div className="auth-links">
        {mode === "signin" && (
          <>
            <Link href={`/auth/sign-up?next=${encodeURIComponent(safeNext)}`}>
              Create an account
            </Link>
            <Link href="/auth/forgot-password">Forgot password?</Link>
          </>
        )}
        {mode === "signup" && (
          <Link href={`/auth/sign-in?next=${encodeURIComponent(safeNext)}`}>
            Already have an account? Sign in
          </Link>
        )}
        {mode === "forgot" && <Link href="/auth/sign-in">Back to sign in</Link>}
        {mode === "reset" && <Link href="/workspace">Continue to workspace</Link>}
      </div>
    </div>
  );
}
