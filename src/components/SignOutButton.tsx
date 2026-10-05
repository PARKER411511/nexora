"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    window.location.assign("/");
  }
  return (
    <button
      className="button-quiet sign-out-button"
      disabled={busy}
      onClick={signOut}
      type="button"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
