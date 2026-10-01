"use client";

import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { demoListProjects, DemoStorageError } from "@/lib/demo-store";
import type { Project } from "@/lib/types";

const labels: Record<Project["status"], string> = {
  draft: "Draft",
  shared: "Shared",
  changes_requested: "Changes requested",
  approved: "Approved",
};

export function WorkspaceHome({
  projects: initialProjects,
  demoMode = false,
}: {
  projects: Project[];
  demoMode?: boolean;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    if (!demoMode) return;
    try {
      setProjects(demoListProjects());
    } catch (reason) {
      setLoadError(
        reason instanceof DemoStorageError
          ? reason.message
          : "Demo data could not be loaded.",
      );
    }
  }, [demoMode]);

  const visible = useMemo(
    () =>
      projects.filter(
        (project) =>
          `${project.title} ${project.client}`
            .toLowerCase()
            .includes(search.toLowerCase()) &&
          (status === "all" || project.status === status),
      ),
    [projects, search, status],
  );

  return (
    <div className="workspace-main">
      <div className="workspace-heading">
        <div>
          <div className="section-kicker">Workspace / overview</div>
          <h1>Your projects</h1>
          <p>
            {demoMode
              ? "Demo data stays in this browser so you can try the full workflow."
              : "Make the next decision easier to see."}
          </p>
        </div>
        <Link className="button-primary" href="/workspace/new">
          New brief <ArrowUpRight size={13} style={{ verticalAlign: "-2px" }} />
        </Link>
      </div>
      {demoMode && (
        <div className="demo-banner" role="status">
          <strong>Browser demo</strong>
          <span>
            Projects, review links, and decisions persist in this browser only.
          </span>
        </div>
      )}
      {loadError && <p className="form-error">{loadError}</p>}
      <div className="project-filters">
        <div className="search-wrap">
          <Search size={14} />
          <input
            aria-label="Search projects"
            className="search-bar"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects"
            value={search}
          />
        </div>
        <select
          aria-label="Filter projects"
          className="search-bar"
          onChange={(event) => setStatus(event.target.value)}
          value={status}
        >
          <option value="all">All statuses</option>
          <option value="draft">Drafts</option>
          <option value="shared">Shared</option>
          <option value="changes_requested">Changes requested</option>
          <option value="approved">Approved</option>
        </select>
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
                    {project.status === "draft"
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
            {projects.length
              ? "Try a different search or status."
              : "Start with a client brief and Nexora will help you shape the first useful scope."}
          </p>
          {!projects.length && (
            <Link className="button-primary" href="/workspace/new">
              Create your first project
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
