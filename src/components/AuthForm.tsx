"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { safeNextPath } from "@/lib/supabase/auth";

type AuthMode = "signin" | "signup" | "forgot" | "reset";

export function AuthForm({ mode, next, initialError }: { mode: AuthMode; next?: string; initialError?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [busy, setBusy] = useState(false);
  const safeNext = safeNextPath(next);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError(
        "Cloud storage is not configured yet. Follow the setup guide first.",
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        window.location.assign(safeNext);
      } else if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) window.location.assign(safeNext);
        else
          setMessage("Check your email to confirm your account, then sign in.");
      } else if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          email,
          {
            redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/auth/reset-password")}`,
          },
        );
        if (resetError) throw resetError;
        setMessage("Check your email for a password reset link.");
      } else {
        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });
        if (updateError) throw updateError;
        setMessage("Password updated. You can continue to your workspace.");
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Authentication failed.",
      );
    } finally {
      setBusy(false);
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

  return (
    <div className="auth-card">
      <div className="section-kicker">Nexora / private workspace</div>
      <h1>{title}</h1>
      <p className="auth-intro">
        Your briefs, review snapshots, and decisions belong to your account.
      </p>
      <form className="auth-form" onSubmit={submit}>
        {mode !== "reset" && (
          <label className="field">
            Email
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
        )}
        {mode !== "forgot" && (
          <label className="field">
            Password
            <input
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="form-success" role="status">
            {message}
          </p>
        )}
        <button
          className="button-primary auth-submit"
          disabled={busy}
          type="submit"
        >
          {busy ? "Working…" : submitLabel}
        </button>
      </form>
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
        {mode === "forgot" && (
          <Link href={`/auth/sign-in?next=${encodeURIComponent(safeNext)}`}>
            Back to sign in
          </Link>
        )}
        {mode === "reset" && (
          <Link href="/workspace">Continue to workspace</Link>
        )}
      </div>
    </div>
  );
}
