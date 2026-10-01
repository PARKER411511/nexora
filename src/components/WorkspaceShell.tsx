"use client";

import Link from "next/link";
import { FolderKanban, LayoutDashboard, Plus, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import { isDemoModeClient } from "@/lib/mode";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">✳</span> Nexora
        </Link>
        <div className="workspace-topbar-right">
          <span className="local-pill">
            {isDemoModeClient() ? "BROWSER DEMO" : "LOCAL WORKSPACE"}
          </span>
          <Link className="button-primary" href="/workspace/new">
            New project <Plus size={13} style={{ verticalAlign: "-2px" }} />
          </Link>
        </div>
      </header>
      <div className="workspace-layout">
        <aside className="sidebar">
          <p className="sidebar-label">Workspace</p>
          <Link
            className={`side-link ${pathname === "/workspace" ? "active" : ""}`}
            href="/workspace"
          >
            <LayoutDashboard size={15} /> Overview
          </Link>
          <Link
            className={`side-link ${pathname.includes("/projects") ? "active" : ""}`}
            href="/workspace"
          >
            <FolderKanban size={15} /> Projects
          </Link>
          <Link className="side-link" href="/workspace/new">
            <Sparkles size={15} /> New brief
          </Link>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
