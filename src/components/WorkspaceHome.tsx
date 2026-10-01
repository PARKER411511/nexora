"use client";

import Link from "next/link";
import { ArrowUpRight, BookOpen, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  demoInitializeWorkspace,
  demoLoadSampleProjects,
  demoResetSampleProjects,
  DemoStorageError,
} from "@/lib/demo-store";
import type { Project } from "@/lib/types";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { WorkspaceWalkthrough } from "./WorkspaceWalkthrough";

const WALKTHROUGH_KEY = "nexora-demo-walkthrough-v1";

const labels: Record<Project["status"], string> = {
  draft: "Draft",
  shared: "Shared",
  changes_requested: "Changes requested",
  approved: "Approved",
};

const sampleLabels = [
  "Fictional sample · draft case",
  "Fictional sample · approved case",
  "Fictional sample · pending change",
];

export function WorkspaceHome({
  projects: initialProjects,
  demoMode = false,
  view = "overview",
}: {
  projects: Project[];
  demoMode?: boolean;
  view?: "overview" | "projects";
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [loadError, setLoadError] = useState("");
  const [hasSamples, setHasSamples] = useState(false);
  const [sampleProjectIds, setSampleProjectIds] = useState<string[]>([]);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [walkthroughSeen, setWalkthroughSeen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetError, setResetError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const isProjectsView = view === "projects";

  useEffect(() => {
    if (!demoMode) return;
    try {
      const result = demoInitializeWorkspace();
      setProjects(result.projects);
      setHasSamples(result.hasSamples);
      setSampleProjectIds(result.sampleProjectIds);
      const seen = window.localStorage.getItem(WALKTHROUGH_KEY) === "1";
      setWalkthroughSeen(seen);
      if (!seen && !isProjectsView) setWalkthroughOpen(true);
    } catch (reason) {
      setLoadError(
        reason instanceof DemoStorageError
          ? reason.message
          : "Demo data could not be loaded.",
      );
    }
  }, [demoMode, isProjectsView]);

  function dismissWalkthrough() {
    setWalkthroughOpen(false);
    setWalkthroughSeen(true);
    try {
      window.localStorage.setItem(WALKTHROUGH_KEY, "1");
    } catch {
      setActionMessage(
        "This browser could not remember the walkthrough choice.",
      );
    }
  }

  function loadSamples() {
    try {
      const result = demoLoadSampleProjects();
      setProjects(result.projects);
      setHasSamples(result.hasSamples);
      setSampleProjectIds(result.sampleProjectIds);
      setActionMessage("Three fictional sample projects are ready to explore.");
      setLoadError("");
    } catch (reason) {
      setLoadError(
        reason instanceof DemoStorageError
          ? reason.message
          : "Sample projects could not be saved.",
      );
    }
  }

  function resetSamples() {
    try {
      const result = demoResetSampleProjects();
      setProjects(result.projects);
      setHasSamples(result.hasSamples);
      setSampleProjectIds(result.sampleProjectIds);
      setSearch("");
      setStatus("all");
      setResetOpen(false);
      setResetError("");
      setLoadError("");
      setActionMessage(
        "Demo reset. Fresh fictional projects and review links are ready.",
      );
    } catch (reason) {
      setResetError(
        reason instanceof DemoStorageError
          ? reason.message
          : "The demo could not be reset. Existing data was kept.",
      );
    }
  }

  const sampleById = (index: number) =>
    projects.find((project) => project.id === sampleProjectIds[index]);
  const draftSample = sampleById(0);
  const approvedSample = sampleById(1);
  const pendingSample = sampleById(2);

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
          <div className="section-kicker">
            Workspace / {isProjectsView ? "projects" : "overview"}
          </div>
          <h1>{isProjectsView ? "Project library" : "Your projects"}</h1>
          <p>
            {isProjectsView
              ? "Browse every brief, scope, and review state saved in this workspace."
              : demoMode
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
          <div>
            <strong>Browser demo</strong>
            <span>
              Projects, review links, and decisions persist in this browser
              only.
            </span>
          </div>
          <div className="demo-banner-actions">
            <button
              className="button-secondary"
              onClick={() => setWalkthroughOpen(true)}
              type="button"
            >
              <BookOpen size={14} />
              {walkthroughSeen ? "Replay walkthrough" : "Workspace walkthrough"}
            </button>
            <button
              className="button-secondary"
              onClick={() => {
                setResetError("");
                setResetOpen(true);
              }}
              type="button"
            >
              <RotateCcw size={14} /> Reset demo
            </button>
          </div>
        </div>
      )}
      {loadError && <p className="form-error">{loadError}</p>}
      {actionMessage && (
        <p className="form-success" role="status">
          {actionMessage}
        </p>
      )}
      {demoMode && !hasSamples && (
        <div className="sample-callout">
          <div>
            <strong>Explore three fictional examples</strong>
            <p>
              Add a draft, an approved scope, and a pending change proposal to
              this existing browser workspace. Your projects stay untouched.
            </p>
          </div>
          <button
            className="button-primary"
            onClick={loadSamples}
            type="button"
          >
            Load sample projects <ArrowUpRight size={13} />
          </button>
        </div>
      )}
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
                    {sampleLabels[sampleProjectIds.indexOf(project.id)] ||
                      (project.status === "draft"
                        ? "Active project"
                        : "Review state")}
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
      {demoMode && walkthroughOpen && (
        <WorkspaceWalkthrough
          approvedLink={{
            href: approvedSample?.reviewToken
              ? `/review/${approvedSample.reviewToken}`
              : approvedSample
                ? `/workspace/projects/${approvedSample.id}`
                : "/workspace",
            label: "Open approved review",
          }}
          draftLink={{
            href: draftSample
              ? `/workspace/projects/${draftSample.id}`
              : "/workspace/new",
            label: "Open draft editor",
          }}
          onDismiss={dismissWalkthrough}
          pendingLink={{
            href: pendingSample?.reviewToken
              ? `/review/${pendingSample.reviewToken}`
              : pendingSample
                ? `/workspace/projects/${pendingSample.id}`
                : "/workspace",
            label: "Open pending change review",
            secondary: pendingSample
              ? {
                  href: `/workspace/projects/${pendingSample.id}?tab=changes`,
                  label: "Open owner Responses & changes",
                }
              : undefined,
          }}
          ready={Boolean(draftSample && approvedSample && pendingSample)}
          loadError={loadError}
          onLoadSamples={loadSamples}
        />
      )}
      {demoMode && resetOpen && (
        <WorkspaceDialog
          ariaLabelledBy="reset-demo-title"
          className="workspace-dialog reset-dialog"
          onDismiss={() => {
            setResetOpen(false);
            setResetError("");
          }}
        >
          <button
            aria-label="Close reset confirmation"
            className="icon-button reset-dialog-close"
            data-dialog-initial-focus
            onClick={() => setResetOpen(false)}
            type="button"
          >
            <X size={16} />
          </button>
          <div className="section-kicker">Reset browser demo</div>
          <h2 id="reset-demo-title">Start the examples over?</h2>
          <p>
            This replaces every Nexora project, review link, approval, and
            change decision saved in this browser with three fresh fictional
            examples. Other site data is left alone.
          </p>
          {resetError && (
            <p className="form-error" role="alert">
              {resetError}
            </p>
          )}
          <div className="reset-dialog-actions">
            <button
              className="button-secondary"
              onClick={() => setResetOpen(false)}
              type="button"
            >
              Keep current data
            </button>
            <button
              className="button-primary"
              onClick={resetSamples}
              type="button"
            >
              Reset demo <RotateCcw size={14} />
            </button>
          </div>
        </WorkspaceDialog>
      )}
    </div>
  );
}
