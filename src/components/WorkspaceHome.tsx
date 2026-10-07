"use client";

import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useEffect } from "react";
import type { Project, ProjectHistory, Workspace } from "@/lib/types";
import {
  buildWorkspaceOverview,
  type WorkspaceOverview,
} from "@/lib/workspace-overview";
import { WorkspaceOnboarding } from "./WorkspaceOnboarding";

const labels: Record<Project["status"], string> = {
  draft: "Draft",
  shared: "Shared",
  changes_requested: "Changes requested",
  approved: "Approved",
};

function Dashboard({
  projects,
  overview,
}: {
  projects: Project[];
  overview: WorkspaceOverview;
}) {
  const latestDraft = projects
    .filter((p) => p.status === "draft")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const latestReview = projects
    .filter((p) => p.status === "shared" || p.status === "changes_requested")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return (
    <>
      <WorkspaceOnboarding />
      <div aria-label="Project status summary" className="overview-stats">
        {[
          [
            "Total projects",
            overview.counts.total,
            "Saved to your private workspace",
          ],
          ["Drafts", overview.counts.drafts, "Still taking shape"],
          [
            "Awaiting review",
            overview.counts.awaitingReview,
            "Shared or changes requested",
          ],
          ["Approved", overview.counts.approved, "Scope locked"],
        ].map(([label, count, detail]) => (
          <div className="overview-stat" key={String(label)}>
            <span className="overview-stat-label">{label}</span>
            <strong>{count}</strong>
            <span>{detail}</span>
          </div>
        ))}
      </div>
      <section className="overview-card overview-quick-actions">
        <div className="overview-card-header">
          <div>
            <div className="section-kicker">Next step</div>
            <h2>Quick actions</h2>
          </div>
          <span className="overview-helper">
            Keep momentum on the work in front of you.
          </span>
        </div>
        <div className="overview-action-list">
          <Link className="button-primary" href="/workspace/new">
            New brief <ArrowUpRight size={13} />
          </Link>
          <Link className="button-secondary" href="/workspace/projects">
            All projects <ArrowUpRight size={13} />
          </Link>
          {latestDraft && (
            <Link
              className="button-secondary"
              href={`/workspace/projects/${latestDraft.id}`}
            >
              Resume latest draft <ArrowUpRight size={13} />
            </Link>
          )}
          {latestReview && (
            <Link
              className="button-secondary"
              href={`/workspace/projects/${latestReview.id}${latestReview.status === "changes_requested" ? "?tab=changes" : ""}`}
            >
              {latestReview.status === "changes_requested"
                ? "Review requested changes"
                : "Open shared project"}{" "}
              <ArrowUpRight size={13} />
            </Link>
          )}
        </div>
      </section>
      <div className="overview-grid">
        <section className="overview-card">
          <div className="overview-card-header">
            <div>
              <div className="section-kicker">Recent work</div>
              <h2>Recent projects</h2>
            </div>
            <Link className="text-link" href="/workspace/projects">
              View all <ArrowUpRight size={13} />
            </Link>
          </div>
          {projects.slice(0, 4).map((project) => (
            <Link
              className="overview-project-row"
              href={`/workspace/projects/${project.id}`}
              key={project.id}
            >
              <div>
                <strong>{project.title}</strong>
                <span>{project.client}</span>
              </div>
              <span className={`status status-${project.status}`}>
                {labels[project.status]}
              </span>
            </Link>
          ))}
          {!projects.length && (
            <div className="overview-empty">
              <strong>No projects yet</strong>
              <p>Start with a brief to create your first private scope.</p>
              <Link className="button-primary" href="/workspace/new">
                Create a project
              </Link>
            </div>
          )}
        </section>
        <section
          aria-label="Recent workspace activity"
          className="overview-card"
        >
          <div className="overview-card-header">
            <div>
              <div className="section-kicker">Activity</div>
              <h2>Recent activity</h2>
            </div>
          </div>
          {overview.activities.length ? (
            overview.activities.slice(0, 6).map((activity) => (
              <Link
                className="overview-activity-row"
                href={activity.href}
                key={activity.id}
              >
                <span
                  className={`activity-dot activity-dot-${activity.tone}`}
                />
                <div>
                  <strong>{activity.label}</strong>
                  <span>{activity.detail}</span>
                </div>
                <time dateTime={activity.occurredAt}>
                  {new Date(activity.occurredAt).toLocaleDateString()}
                </time>
              </Link>
            ))
          ) : (
            <div className="overview-empty">
              <strong>No activity yet</strong>
              <p>Saved briefs and client responses will appear here.</p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export function WorkspaceHome({
  projects,
  overview: initialOverview,
  histories,
  view = "overview",
}: {
  projects: Project[];
  overview?: WorkspaceOverview;
  histories?: Record<string, ProjectHistory>;
  view?: "overview" | "projects";
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<"updated" | "created" | "name">("updated");
  const [showArchived, setShowArchived] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/workspaces")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load workspaces.");
        if (!active) return;
        const next = (data.workspaces ?? []) as Workspace[];
        setWorkspaces(next);
        const stored = window.localStorage.getItem("nexora.workspaceId");
        const id = next.find((workspace) => workspace.id === stored)?.id ?? next[0]?.id ?? "";
        setSelectedWorkspaceId(id);
        if (id) window.localStorage.setItem("nexora.workspaceId", id);
      })
      .catch(() => { if (active) setSelectedWorkspaceId(""); });
    const onWorkspaceChange = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setSelectedWorkspaceId(id);
    };
    window.addEventListener("nexora-workspace-changed", onWorkspaceChange);
    return () => { active = false; window.removeEventListener("nexora-workspace-changed", onWorkspaceChange); };
  }, []);
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const scopedProjects = useMemo(
    () => selectedWorkspaceId ? projects.filter((project) => project.workspaceId === selectedWorkspaceId || (!project.workspaceId && selectedWorkspace?.personal)) : projects,
    [projects, selectedWorkspaceId, selectedWorkspace?.personal],
  );
  const scopedHistories = useMemo(
    () => Object.fromEntries(scopedProjects.flatMap((project) => histories?.[project.id] ? [[project.id, histories[project.id]] as const] : [])),
    [histories, scopedProjects],
  );
  const overview = buildWorkspaceOverview(scopedProjects, scopedHistories);
  const visible = useMemo(() => {
    const filtered = scopedProjects.filter(
        (p) =>
          `${p.title} ${p.client}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (status === "all" || p.status === status) &&
          (showArchived || p.archived !== true),
      );
    return filtered.toSorted((a, b) => sort === "name"
      ? a.title.localeCompare(b.title)
      : sort === "created"
        ? b.createdAt.localeCompare(a.createdAt)
        : b.updatedAt.localeCompare(a.updatedAt));
  }, [scopedProjects, search, status, showArchived, sort]);
  const library = view === "projects";
  return (
    <div className="workspace-main">
      <div className="workspace-heading">
        <div>
          <div className="section-kicker">
            Workspace / {library ? "projects" : "overview"}
          </div>
          <h1>{library ? "Project library" : "Workspace overview"}</h1>
          <p>
            {library
              ? "Browse every brief, scope, and review state saved in your private workspace."
              : "Make the next decision easier to see."}
          </p>
          {selectedWorkspace && <span className="workspace-context-badge">{selectedWorkspace.name}</span>}
        </div>
        <Link className="button-primary" href="/workspace/new">
          New brief <ArrowUpRight size={13} />
        </Link>
      </div>
      {library ? (
        <>
          <div className="project-filters">
            <div className="search-wrap">
              <Search size={14} />
              <input
                aria-label="Search projects"
                className="search-bar"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search projects"
                value={search}
              />
            </div>
            <select
              aria-label="Filter projects"
              className="search-bar"
              onChange={(e) => setStatus(e.target.value)}
              value={status}
            >
              <option value="all">All statuses</option>
              <option value="draft">Drafts</option>
              <option value="shared">Shared</option>
              <option value="changes_requested">Changes requested</option>
              <option value="approved">Approved</option>
            </select>
            <select aria-label="Sort projects" className="search-bar" onChange={(e) => setSort(e.target.value as typeof sort)} value={sort}>
              <option value="updated">Recently updated</option>
              <option value="created">Recently created</option>
              <option value="name">Name</option>
            </select>
            <label className="project-archive-toggle"><input checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} type="checkbox" /> Show archived</label>
          </div>
          {visible.length ? (
            <div className="project-grid">
              {visible.map((project) => (
                <Link
                  className="project-card"
                  href={`/workspace/projects/${project.id}`}
                  key={project.id}
                >
                  <div className="project-card-top">
                    <div>
                      <span className="mono-label">
                        {project.archived ? "Archived project" : project.status === "draft"
                          ? "Active project"
                          : "Review state"}
                      </span>
                      <h2>{project.title}</h2>
                      <span className="project-client">{project.client}</span>
                    </div>
                    <ArrowUpRight size={16} color="#8c8989" />
                  </div>
                  <p className="project-summary">{project.analysis.summary}</p>
                  <div className="project-card-footer">
                    <span className={`status status-${project.status}`}>
                      {labels[project.status]}
                    </span>
                    <span className="project-date">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="section-kicker">No matching projects</div>
              <p>
                {scopedProjects.length
                  ? "Try a different search or status."
                  : "Start with a client brief to shape your first useful scope."}
              </p>
              {!projects.length && (
                <Link className="button-primary" href="/workspace/new">
                  Create your first project
                </Link>
              )}
            </div>
          )}
        </>
      ) : (
        <Dashboard overview={overview} projects={projects} />
      )}
    </div>
  );
}
