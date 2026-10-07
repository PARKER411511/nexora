"use client";

import Link from "next/link";
import { CheckCircle2, UserRound, Users, WandSparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

export function WorkspaceOnboarding() {
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => setDismissed(window.localStorage.getItem("nexora-onboarding-dismissed") === "1"), []);
  if (dismissed) return null;
  function dismiss() { window.localStorage.setItem("nexora-onboarding-dismissed", "1"); setDismissed(true); }
  return <section className="overview-card onboarding-card"><div className="overview-card-header"><div><div className="section-kicker">First visit</div><h2>Set up your workspace</h2></div><button aria-label="Dismiss onboarding" className="icon-button" onClick={dismiss} type="button"><X size={14} /></button></div><p className="profile-muted">Create a first brief, confirm your account details, and invite a collaborator when you are ready.</p><div className="onboarding-steps"><Link href="/workspace/new"><WandSparkles size={15} /><span><strong>Create a first brief</strong><small>Use the sample brief or paste a real one.</small></span></Link><Link href="/workspace/profile"><UserRound size={15} /><span><strong>Complete your profile</strong><small>Add a verified email, photo, and security factor.</small></span></Link><Link href="/workspace/team"><Users size={15} /><span><strong>Invite your team</strong><small>Copy a persistent invite link with a role.</small></span></Link></div><div className="onboarding-foot"><CheckCircle2 size={13} /> You can revisit these steps from Profile and Team.</div></section>;
}
