"use client";

import Link from "next/link";
import {
  FolderKanban,
  LayoutDashboard,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { SignOutButton } from "./SignOutButton";
import { WorkspaceControls } from "./WorkspaceControls";

export function WorkspaceShell({
  children,
  isAdmin = false,
}: {
  children: React.ReactNode;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const isOverview = pathname === "/workspace";
  const isProjects =
    pathname === "/workspace/projects" ||
    pathname.startsWith("/workspace/projects/");
  const isNewBrief = pathname === "/workspace/new";
  const isProfile = pathname === "/workspace/profile";
  const isTeam = pathname.startsWith("/workspace/team");
  const isAdminPage = pathname.startsWith("/admin");
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
          <WorkspaceControls />
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
          <p className="sidebar-label sidebar-label-spaced">Account</p>
          <Link
            aria-current={isProfile ? "page" : undefined}
            className={`side-link ${isProfile ? "active" : ""}`}
            href="/workspace/profile"
          >
            <UserRound size={15} /> Profile
          </Link>
          <Link aria-current={isTeam ? "page" : undefined} className={`side-link ${isTeam ? "active" : ""}`} href="/workspace/team">
            <Users size={15} /> Team & invites
          </Link>
          {isAdmin && (
            <Link
              aria-current={isAdminPage ? "page" : undefined}
              className={`side-link ${isAdminPage ? "active" : ""}`}
              href="/admin"
            >
              <ShieldCheck size={15} /> Admin
            </Link>
          )}
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
