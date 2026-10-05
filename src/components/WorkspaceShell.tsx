"use client";

import Link from "next/link";
import { FolderKanban, LayoutDashboard, Plus, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOverview = pathname === "/workspace";
  const isProjects =
    pathname === "/workspace/projects" ||
    pathname.startsWith("/workspace/projects/");
  const isNewBrief = pathname === "/workspace/new";
  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">✳</span> Nexora
        </Link>
        <div className="workspace-topbar-right">
          <span className="local-pill">
            PRIVATE WORKSPACE
          </span>
          <SignOutButton />
          <Link className="button-primary" href="/workspace/new">
            New project <Plus size={13} style={{ verticalAlign: "-2px" }} />
          </Link>
        </div>
      </header>
      <div className="workspace-layout">
        <aside className="sidebar">
          <p className="sidebar-label">Workspace</p>
          <Link
            aria-current={isOverview ? "page" : undefined}
            className={`side-link ${isOverview ? "active" : ""}`}
            href="/workspace"
          >
            <LayoutDashboard size={15} /> Overview
          </Link>
          <Link
            aria-current={isProjects ? "page" : undefined}
            className={`side-link ${isProjects ? "active" : ""}`}
            href="/workspace/projects"
          >
            <FolderKanban size={15} /> Projects
          </Link>
          <Link
            aria-current={isNewBrief ? "page" : undefined}
            className={`side-link ${isNewBrief ? "active" : ""}`}
            href="/workspace/new"
          >
            <Sparkles size={15} /> New brief
          </Link>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
