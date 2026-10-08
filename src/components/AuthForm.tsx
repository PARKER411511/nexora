"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
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
  placeholder,
  disabled,
  describedBy,
  invalid,
  labelAction,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
  placeholder: string;
  disabled: boolean;
  describedBy?: string;
  invalid?: boolean;
  labelAction?: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <div className="auth-field-label">
        <label htmlFor={id}>{label}</label>
        {labelAction}
      </div>
      <span className="password-control">
        <input
          autoComplete={autoComplete}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          id={id}
          minLength={minLength}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="password-toggle"
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
          title={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          type="button"
        >
          {visible ? <EyeOff aria-hidden="true" size={17} strokeWidth={1.8} /> : <Eye aria-hidden="true" size={17} strokeWidth={1.8} />}
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
  const passwordMatches = passwordConfirm.length > 0 && password === passwordConfirm;
  const passwordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;

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
      ? "Welcome back"
      : mode === "signup"
        ? "Create your account"
        : mode === "forgot"
          ? "Reset your password"
          : "Set a new password";
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
      ? "Sign in to continue to your Nexora workspace."
      : mode === "signup"
        ? "Get started with your Nexora workspace."
        : mode === "forgot"
          ? "Enter your email to receive a password reset link."
          : "Set a new password for your Nexora account.";
  const passwordHintId = mode === "signup" || mode === "reset" ? "auth-password-hint" : undefined;
  const confirmDescribedBy = [
    passwordHintId,
    passwordConfirm.length > 0 ? "auth-password-match" : undefined,
  ]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div className="auth-card">
      <div className="auth-card-header">
        <div className="auth-emblem" aria-hidden="true">
          <LockKeyhole size={20} strokeWidth={1.7} />
        </div>
        <h1 id="auth-form-title">{title}</h1>
        <p className="auth-intro">{intro}</p>
        {(mode === "signin" || mode === "signup") && (
          <p className="auth-switch">
            {mode === "signin" ? (
              <>
                New to Nexora?{" "}
                <Link href={`/auth/sign-up?next=${encodeURIComponent(safeNext)}`}>
                  Create an account
                </Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link href={`/auth/sign-in?next=${encodeURIComponent(safeNext)}`}>
                  Sign in
                </Link>
              </>
            )}
          </p>
        )}
      </div>
      <form aria-busy={busy} aria-labelledby="auth-form-title" className="auth-form" onSubmit={submit}>
        {mode === "signup" && (
          <div className="field">
            <label htmlFor="full-name">Your name</label>
            <input
              autoComplete="name"
              disabled={busy}
              id="full-name"
              maxLength={120}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Jane Doe"
              required
              value={fullName}
            />
          </div>
        )}
        {mode !== "reset" && (
          <div className="field">
            <label htmlFor="auth-email">Email address</label>
            <input
              autoComplete="email"
              disabled={busy}
              id="auth-email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              required
              type="email"
              value={email}
            />
          </div>
        )}
        {mode !== "forgot" && (
          <PasswordField
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            describedBy={passwordHintId}
            disabled={busy}
            id="auth-password"
            label="Password"
            labelAction={mode === "signin" ? (
              <Link className="auth-recovery-link" href={`/auth/forgot-password?email=${encodeURIComponent(email.trim())}`}>
                Forgot password?
              </Link>
            ) : undefined}
            minLength={mode === "signin" ? undefined : 8}
            onChange={setPassword}
            placeholder={mode === "signin" ? "Enter your password" : "At least 8 characters"}
            value={password}
          />
        )}
        {(mode === "signup" || mode === "reset") && (
          <p className="field-hint auth-password-hint" id="auth-password-hint">Use at least 8 characters.</p>
        )}
        {(mode === "signup" || mode === "reset") && (
          <PasswordField
            autoComplete="new-password"
            disabled={busy}
            id="auth-password-confirm"
            label="Confirm password"
            minLength={8}
            onChange={setPasswordConfirm}
            placeholder="Repeat your password"
            value={passwordConfirm}
            describedBy={confirmDescribedBy}
            invalid={passwordMismatch}
          />
        )}
        {(mode === "signup" || mode === "reset") && passwordConfirm.length > 0 && (
          <p className={`auth-password-match ${passwordMatches ? "is-match" : "is-mismatch"}`} id="auth-password-match" aria-live="polite">
            {passwordMatches ? "Passwords match." : "Passwords do not match yet."}
          </p>
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
          {!busy && <ArrowRight aria-hidden="true" size={16} strokeWidth={1.8} />}
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
        <form aria-busy={busy} className="auth-form mfa-challenge" onSubmit={verifyMfa}>
          <div className="mfa-intro">
            <h2>Check your authenticator</h2>
            <p>Enter the 6-digit code from your authenticator app to finish signing in.</p>
          </div>
          <div className="field"><label htmlFor="mfa-code">Authenticator code</label><input autoComplete="one-time-code" disabled={busy} id="mfa-code" inputMode="numeric" maxLength={6} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))} pattern="[0-9]{6}" placeholder="123456" required value={mfaCode} /></div>
          <button className="button-primary auth-submit" disabled={busy} type="submit">{busy ? "Verifying…" : "Verify and continue"}</button>
        </form>
      )}
      {(mode === "forgot" || mode === "reset") && (
        <div className="auth-links">
          {mode === "forgot" && <Link href="/auth/sign-in">Back to sign in</Link>}
          {mode === "reset" && <Link href="/workspace">Continue to workspace</Link>}
        </div>
      )}
    </div>
  );
}
