import Link from "next/link";
import { SignOutButton } from "@/components/SignOutButton";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-shell">
      <header className="workspace-topbar">
        <Link className="brand" href="/admin">
          <span aria-hidden="true" className="brand-mark">✳</span> Nexora / Admin
        </Link>
        <div className="workspace-topbar-right">
          <Link className="button-secondary" href="/workspace">Back to workspace</Link>
          <SignOutButton />
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
