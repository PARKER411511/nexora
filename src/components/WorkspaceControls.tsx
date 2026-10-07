"use client";

import { Bell, Check, ChevronDown, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import type { Workspace, WorkspaceNotification } from "@/lib/types";

export function WorkspaceControls() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState("");
  const [notifications, setNotifications] = useState<WorkspaceNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState<"workspace" | "notifications" | null>(null);
  const [error, setError] = useState("");

  function selectWorkspace(id: string) {
    setSelected(id);
    window.localStorage.setItem("nexora.workspaceId", id);
    window.dispatchEvent(new CustomEvent("nexora-workspace-changed", { detail: { id } }));
    setOpen(null);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/workspaces").then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load workspaces"))),
      fetch("/api/notifications").then((response) => response.ok ? response.json() : Promise.reject(new Error("Could not load notifications"))),
    ]).then(([workspaceData, notificationData]) => {
      if (!active) return;
      const nextWorkspaces = (workspaceData.workspaces ?? []) as Workspace[];
      setWorkspaces(nextWorkspaces);
      const stored = window.localStorage.getItem("nexora.workspaceId");
      const initial = nextWorkspaces.find((workspace) => workspace.id === stored)?.id ?? nextWorkspaces[0]?.id ?? "";
      setSelected(initial);
      if (initial) window.localStorage.setItem("nexora.workspaceId", initial);
      setNotifications(notificationData.notifications ?? []);
      setUnread(Number(notificationData.unread ?? 0));
    }).catch(() => {
      if (active) setError("Workspace updates are unavailable until the latest migration is applied.");
    });
    const onWorkspaceChange = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setSelected(id);
    };
    window.addEventListener("nexora-workspace-changed", onWorkspaceChange);
    return () => { active = false; window.removeEventListener("nexora-workspace-changed", onWorkspaceChange); };
  }, []);

  async function createWorkspace() {
    const name = window.prompt("Name your team workspace");
    if (!name?.trim()) return;
    const response = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not create workspace.");
      return;
    }
    setWorkspaces((current) => [...current, data.workspace]);
    selectWorkspace(data.workspace.id);
    setOpen(null);
  }

  async function markRead(notification: WorkspaceNotification) {
    if (notification.readAt) return;
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: notification.id }),
    });
    if (!response.ok) {
      setError("That notification could not be marked read. Try again.");
      return;
    }
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item));
    setUnread((count) => Math.max(0, count - 1));
  }

  const current = workspaces.find((workspace) => workspace.id === selected) ?? workspaces[0];
  return (
    <div className="workspace-controls" aria-label="Workspace controls">
      <div className="workspace-control-menu">
        <button className="workspace-switcher" onClick={() => setOpen(open === "workspace" ? null : "workspace")} type="button" aria-expanded={open === "workspace"}>
          <span className="workspace-avatar">{current?.name.slice(0, 1).toUpperCase() ?? "N"}</span>
          <span>{current?.name ?? "Workspace"}</span>
          <ChevronDown size={13} />
        </button>
        {open === "workspace" && (
          <div className="workspace-menu" role="menu">
            {workspaces.map((workspace) => (
              <button key={workspace.id} className={workspace.id === selected ? "selected" : ""} onClick={() => selectWorkspace(workspace.id)} type="button">
                <span>{workspace.name}</span><small>{workspace.role}</small>
              </button>
            ))}
            <button className="workspace-menu-create" onClick={createWorkspace} type="button"><Plus size={13} /> New team workspace</button>
          </div>
        )}
      </div>
      <div className="workspace-control-menu">
        <button className="notification-button" onClick={() => setOpen(open === "notifications" ? null : "notifications")} type="button" aria-label={`${unread} unread notifications`} aria-expanded={open === "notifications"}>
          <Bell size={16} />{unread > 0 && <span className="notification-count">{unread > 99 ? "99+" : unread}</span>}
        </button>
        {open === "notifications" && (
          <div className="workspace-menu notification-menu" role="menu">
            <div className="notification-heading"><strong>Notifications</strong><span>{unread} unread</span></div>
            {notifications.length ? notifications.slice(0, 8).map((notification) => (
              <button key={notification.id} className={`notification-row ${notification.readAt ? "read" : ""}`} onClick={() => markRead(notification)} type="button">
                <span><strong>{String(notification.payload.title ?? notification.eventType.replaceAll("_", " "))}</strong><small>{String(notification.payload.message ?? "Workspace activity needs your attention.")}</small></span>
                {!notification.readAt && <Check size={13} aria-label="Mark read" />}
              </button>
            )) : <p className="notification-empty">No notifications yet.</p>}
          </div>
        )}
      </div>
      {error && <span className="workspace-control-error" role="status">{error}</span>}
    </div>
  );
}
