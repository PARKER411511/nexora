"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Archive,
  Check,
  Copy,
  Download,
  ExternalLink,
  GitCompare,
  LoaderCircle,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  BriefAnalysis,
  ChangeRequest,
  Project,
  ProjectHistory,
  Scope,
  BriefTemplate,
} from "@/lib/types";
import { ReviewSharingPanel } from "./ReviewSharingPanel";
import { ProjectAttachmentsPanel, ProjectCommentsPanel } from "./ProjectCollaborationPanels";

function EditableList({
  label,
  values,
  disabled,
  onChange,
}: {
  label: string;
  values: string[];
  disabled?: boolean;
  onChange: (values: string[]) => void;
}) {
  return (
    <div>
      <h3>{label}</h3>
      {values.map((value, index) => (
        <div className="list-edit" key={`${label}-${index}`}>
          <input
            aria-label={`${label} item ${index + 1}`}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                values.map((item, itemIndex) =>
                  itemIndex === index ? event.target.value : item,
                ),
              )
            }
            value={value}
          />
          <button
            aria-label={`Remove ${label} item ${index + 1}`}
            className="remove-btn"
            disabled={disabled}
            onClick={() =>
              onChange(values.filter((_, itemIndex) => itemIndex !== index))
            }
            type="button"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        className="add-item"
        disabled={disabled}
        onClick={() => onChange([...values, "New item"])}
        type="button"
      >
        <Plus size={13} style={{ verticalAlign: "-2px" }} /> Add item
      </button>
    </div>
  );
}

export function ProjectEditor({
  project: initial,
  initialTab,
}: {
  project: Project;
  initialTab?: "scope" | "analysis" | "changes" | "versions";
}) {
  const [project, setProject] = useState(initial);
  const [tab, setTab] = useState<"scope" | "analysis" | "changes" | "versions">(
    initialTab ?? "scope",
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [scopeTemplateName, setScopeTemplateName] = useState("");
  const [scopeTemplateMessage, setScopeTemplateMessage] = useState("");
  const [scopeTemplates, setScopeTemplates] = useState<BriefTemplate[]>([]);
  const [scopeTemplatesLoading, setScopeTemplatesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState(
    initial.reviewToken ? `/review/${initial.reviewToken}` : "",
  );
  const [history, setHistory] = useState<ProjectHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [versions, setVersions] = useState<Array<{ version: number; createdAt: string; project: Project }>>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [compare, setCompare] = useState<{ left: number; right: number; changedFields: Array<{ field: string; left: unknown; right: unknown }> } | null>(null);
  const locked = project.status === "approved";
  const editingDisabled = locked || project.archived === true || saving || sharing || historyLoading || lifecycleBusy;

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!project.workspaceId) {
      setScopeTemplates([]);
      return;
    }
    const controller = new AbortController();
    setScopeTemplatesLoading(true);
    fetch(`/api/templates?workspaceId=${encodeURIComponent(project.workspaceId)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load scope templates.");
        setScopeTemplates((data.templates ?? []) as BriefTemplate[]);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setScopeTemplateMessage(reason instanceof Error ? reason.message : "Could not load scope templates.");
      })
      .finally(() => setScopeTemplatesLoading(false));
    return () => controller.abort();
  }, [project.workspaceId]);

  function setDirtyState(value: boolean) {
    dirtyRef.current = value;
    setDirty(value);
  }

  async function refreshHistory() {
    setHistoryLoading(true);
    try {
      let latestHistory: ProjectHistory;
      let latestProject: Project;
      {
        const [historyResponse, projectResponse] = await Promise.all([
          fetch(`/api/projects/${project.id}/history`),
          fetch(`/api/projects/${project.id}`),
        ]);
        const historyData = await historyResponse.json();
        const projectData = await projectResponse.json();
        if (!historyResponse.ok) throw new Error(historyData.error);
        if (!projectResponse.ok) throw new Error(projectData.error);
        latestHistory = historyData.history;
        latestProject = projectData.project;
      }
      setHistory(latestHistory);
      if (dirtyRef.current) {
        setPendingProject(latestProject);
      } else {
        setProject(latestProject);
        setShareUrl(
          latestProject.reviewToken
            ? `/review/${latestProject.reviewToken}`
            : "",
        );
        setPendingProject(null);
      }
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load project history",
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "changes") void refreshHistory();
    if (tab === "versions") void loadVersions();
  }, [project.id, tab, dirty]);

  async function loadVersions() {
    setVersionsLoading(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/versions`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setVersions(data.versions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load versions");
    } finally {
      setVersionsLoading(false);
    }
  }

  async function compareVersions(left: number, right: number) {
    try {
      const response = await fetch(`/api/projects/${project.id}/versions?left=${left}&right=${right}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setCompare(data.comparison);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not compare versions");
    }
  }

  function setScope(update: Partial<Scope>) {
    setDirtyState(true);
    setProject((current) => ({
      ...current,
      scope: { ...current.scope, ...update },
    }));
  }
  function setAnalysis(update: Partial<BriefAnalysis>) {
    setDirtyState(true);
    setProject((current) => ({
      ...current,
      analysis: { ...current.analysis, ...update },
    }));
  }
  function updateProject(update: Partial<Project>) {
    setDirtyState(true);
    setProject((current) => ({ ...current, ...update }));
  }

  async function saveScopeTemplate() {
    if (!project.workspaceId || !scopeTemplateName.trim()) return;
    setScopeTemplateMessage("");
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: project.workspaceId,
          name: scopeTemplateName.trim(),
          brief: project.brief,
          scope: project.scope,
          tags: project.tags ?? [],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save scope template.");
      if (data.template) setScopeTemplates((items) => [data.template as BriefTemplate, ...items]);
      setScopeTemplateName("");
      setScopeTemplateMessage("Scope template saved.");
    } catch (reason) {
      setScopeTemplateMessage(reason instanceof Error ? reason.message : "Could not save scope template.");
    }
  }

  function applyScopeTemplate(templateId: string) {
    const template = scopeTemplates.find((item) => item.id === templateId);
    if (!template || !template.scope) return;
    setProject((current) => ({
      ...current,
      brief: template.brief,
      scope: template.scope as Scope,
      tags: template.tags ?? [],
    }));
    setDirtyState(true);
    setScopeTemplateMessage(`Loaded “${template.name}”. Save project to apply it.`);
    setError("");
    setMessage("");
  }
  function discardLocalEdits() {
    if (!pendingProject) return;
    setProject(pendingProject);
    setShareUrl(
      pendingProject.reviewToken ? `/review/${pendingProject.reviewToken}` : "",
    );
    setPendingProject(null);
    setDirtyState(false);
    setMessage("Local edits discarded. Showing the latest saved project.");
  }

  async function save() {
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const saved = await (async () => {
            const response = await fetch(`/api/projects/${project.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(project),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data.project as Project;
          })();
      setProject(saved);
      setPendingProject(null);
      setDirtyState(false);
      setShareUrl(saved.reviewToken ? `/review/${saved.reviewToken}` : "");
      setMessage(
        saved.reviewToken
          ? "Scope saved. The existing review snapshot is still current."
          : "Scope saved locally. Share a fresh snapshot when ready.",
      );
      void loadVersions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save scope");
    } finally {
      setSaving(false);
    }
  }

  async function share() {
    setError("");
    setMessage("");
    setSharing(true);
    try {
      const saved = await (async () => {
            const saveResponse = await fetch(`/api/projects/${project.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(project),
            });
            const data = await saveResponse.json();
            if (!saveResponse.ok) throw new Error(data.error);
            return data.project as Project;
          })();
      setProject(saved);
      setPendingProject(null);
      setDirtyState(false);
      const shared = await (async () => {
            const response = await fetch(`/api/projects/${project.id}/share`, {
              method: "POST",
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            return data as { project: Project; url: string };
          })();
      setProject(shared.project);
      setShareUrl(shared.url);
      setMessage("Scope saved and snapshot ready to review.");
      void loadVersions();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not create review link",
      );
    } finally {
      setSharing(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    const usableUrl = shareUrl.startsWith("http")
      ? shareUrl
      : `${window.location.origin}${shareUrl}`;
    try {
      await navigator.clipboard.writeText(usableUrl);
      setMessage("Review link copied.");
    } catch {
      setMessage("Select the link to copy it manually.");
    }
  }

  async function lifecycle(action: "archive" | "restore" | "duplicate" | "delete") {
    if (action === "delete" && !window.confirm("Delete this project permanently? This removes its snapshots, comments, versions, and attachment metadata and cannot be undone.")) return;
    if (action === "archive" && !window.confirm("Archive this project? Active review links will be revoked until you restore it.")) return;
    setError("");
    setMessage("");
    setLifecycleBusy(true);
    try {
      const body: Record<string, unknown> = { action };
      if (action === "delete") body.confirmation = "DELETE";
      const response = await fetch(`/api/projects/${project.id}/lifecycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (action === "delete") {
        window.location.assign("/workspace/projects");
        return;
      }
      if (action === "duplicate") {
        window.location.assign(`/workspace/projects/${data.project.id}`);
        return;
      }
      setProject(data.project);
      setDirtyState(false);
      setShareUrl(data.project.reviewToken ? `/review/${data.project.reviewToken}` : "");
      setMessage(action === "archive" ? "Project archived and active review access revoked." : "Project restored. Editing is available again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update project");
    } finally {
      setLifecycleBusy(false);
    }
  }

  return (
    <div className="editor-wrap">
      <Link className="back-link" href="/workspace">
        <ArrowLeft size={13} style={{ verticalAlign: "-2px" }} /> Back to
        workspace
      </Link>
      <div className="editor-header">
        <div>
          <div className="section-kicker">Project / {project.archived ? "archived" : project.status}</div>
          <input
            aria-label="Project title"
            disabled={editingDisabled}
            onChange={(event) => updateProject({ title: event.target.value })}
            style={{
              background: "transparent",
              border: 0,
              borderBottom: "1px solid transparent",
              color: "#f7f4f2",
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: "-.06em",
              maxWidth: "100%",
              padding: 0,
              width: "100%",
            }}
            value={project.title}
          />
          <p>
            {project.client} · Updated{" "}
            {new Date(project.updatedAt).toLocaleString()}
          </p>
        </div>
        <div className="editor-actions">
          <a className="button-secondary" href={`/api/projects/${project.id}/export`}><Download size={13} style={{ verticalAlign: "-2px" }} /> Export markdown</a>
          <a className="button-secondary" href={`/api/projects/${project.id}/export?format=pdf`}><Download size={13} style={{ verticalAlign: "-2px" }} /> PDF</a>
          <a className="button-secondary" href={`/api/projects/${project.id}/export?format=json`}>JSON</a>
          {project.archived ? (
            <button className="button-secondary" disabled={lifecycleBusy} onClick={() => lifecycle("restore")} type="button"><Archive size={13} /> Restore</button>
          ) : (
            <button className="button-secondary" disabled={lifecycleBusy} onClick={() => lifecycle("archive")} type="button"><Archive size={13} /> Archive</button>
          )}
          <button className="button-secondary" disabled={lifecycleBusy} onClick={() => lifecycle("duplicate")} type="button"><Copy size={13} /> Duplicate</button>
          <button className="button-danger" disabled={lifecycleBusy} onClick={() => lifecycle("delete")} type="button">Delete</button>
          {project.reviewToken && (
            <Link
              className="button-secondary"
              href={`/review/${project.reviewToken}`}
              target="_blank"
            >
              <ExternalLink size={13} style={{ verticalAlign: "-2px" }} /> Open
              review
            </Link>
          )}
        </div>
      </div>
      {locked && (
        <div className="locked-note" style={{ marginBottom: 20 }}>
          <Check size={14} style={{ verticalAlign: "-2px" }} /> Approved on{" "}
          {project.approval
            ? new Date(project.approval.approvedAt).toLocaleString()
            : "this review"}
          . Scope fields are locked. New notes belong in a separate change
          request.
        </div>
      )}
      {project.archived && (
        <div className="locked-note" style={{ marginBottom: 20 }}>
          <Archive size={14} style={{ verticalAlign: "-2px" }} /> This project is archived. Restore it to edit or create a new review snapshot.
        </div>
      )}
      {pendingProject && dirty && (
        <div className="sync-warning" role="status">
          <div>
            <strong>New saved state available</strong>
            <p>
              This project changed in another tab. Keep your local edits, or
              discard them to show the latest status and scope.
            </p>
          </div>
          <div className="sync-warning-actions">
            <button
              className="button-secondary"
              onClick={() => setPendingProject(null)}
              type="button"
            >
              Keep local edits
            </button>
            <button
              className="button-primary"
              onClick={discardLocalEdits}
              type="button"
            >
              Discard and sync
            </button>
          </div>
        </div>
      )}
      <div className="editor-tabs">
        <button
          className={`editor-tab ${tab === "scope" ? "active" : ""}`}
          onClick={() => setTab("scope")}
          type="button"
        >
          Scope builder
        </button>
        <button
          className={`editor-tab ${tab === "analysis" ? "active" : ""}`}
          onClick={() => setTab("analysis")}
          type="button"
        >
          Brief analysis
        </button>
        <button
          className={`editor-tab ${tab === "changes" ? "active" : ""}`}
          onClick={() => setTab("changes")}
          type="button"
        >
          Responses & changes
        </button>
        <button
          className={`editor-tab ${tab === "versions" ? "active" : ""}`}
          onClick={() => setTab("versions")}
          type="button"
        >
          <GitCompare size={13} /> Versions
        </button>
      </div>
      {tab === "scope" ? (
        <div className="editor-columns">
          <section className="card">
            <h2>Scope inputs</h2>
            <div className="field">
              <label htmlFor="client-name">Client or team</label>
              <input
                disabled={editingDisabled}
                id="client-name"
                onChange={(e) => updateProject({ client: e.target.value })}
                value={project.client}
              />
            </div>
            <div className="field">
              <label htmlFor="project-tags">Tags</label>
              <input
                disabled={editingDisabled}
                id="project-tags"
                onChange={(e) => updateProject({ tags: e.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })}
                placeholder="e.g. website, Q4, priority"
                value={(project.tags ?? []).join(", ")}
              />
              <small className="field-help">Separate tags with commas. Up to 20 tags.</small>
            </div>
            <div className="field">
              <label htmlFor="project-deadline">Deadline</label>
              <input
                disabled={editingDisabled}
                id="project-deadline"
                onChange={(e) => updateProject({ deadline: e.target.value || null })}
                type="date"
                value={project.deadline ?? ""}
              />
            </div>
            <div className="field">
              <label htmlFor="original-brief">Original brief</label>
              <textarea
                disabled={editingDisabled}
                id="original-brief"
                onChange={(e) => updateProject({ brief: e.target.value })}
                value={project.brief}
              />
            </div>
            <EditableList
              disabled={editingDisabled}
              label="Deliverables"
              onChange={(deliverables) => setScope({ deliverables })}
              values={project.scope.deliverables}
            />
            <EditableList
              disabled={editingDisabled}
              label="Included"
              onChange={(included) => setScope({ included })}
              values={project.scope.included}
            />
            <EditableList
              disabled={editingDisabled}
              label="Excluded"
              onChange={(excluded) => setScope({ excluded })}
              values={project.scope.excluded}
            />
            <div className="field">
              <label htmlFor="revisions">Included revision rounds</label>
              <input
                disabled={editingDisabled}
                id="revisions"
                max={20}
                min={0}
                onChange={(e) =>
                  setScope({ revisions: Number(e.target.value) })
                }
                type="number"
                value={project.scope.revisions}
              />
            </div>
            {project.workspaceId && (
              <div className="field">
                <label htmlFor="scope-template-name">Reusable scope template</label>
                <select
                  aria-label="Apply saved scope template"
                  disabled={editingDisabled || scopeTemplatesLoading || scopeTemplates.length === 0}
                  defaultValue=""
                  onChange={(event) => applyScopeTemplate(event.target.value)}
                >
                  <option value="">{scopeTemplatesLoading ? "Loading templates…" : scopeTemplates.length ? "Apply a saved scope" : "No saved scope templates"}</option>
                  {scopeTemplates.filter((template) => template.scope).map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
                <div className="template-save-row">
                  <input
                    aria-label="Scope template name"
                    disabled={editingDisabled}
                    id="scope-template-name"
                    onChange={(event) => setScopeTemplateName(event.target.value)}
                    placeholder="e.g. Marketing site scope"
                    value={scopeTemplateName}
                  />
                  <button
                    className="button-quiet"
                    disabled={editingDisabled || !scopeTemplateName.trim() || project.brief.length < 24}
                    onClick={() => void saveScopeTemplate()}
                    type="button"
                  >
                    Save template
                  </button>
                </div>
                <small className="field-help">Workspace editors can save templates. Applying one updates this draft; save the project to persist the scope.</small>
                <small className={scopeTemplateMessage.includes("saved") ? "form-success" : "form-error"} role="status">
                  {scopeTemplateMessage}
                </small>
              </div>
            )}
          </section>
          <section className="card">
            <h2>Milestones</h2>
            <p style={{ color: "#777", fontSize: 11, marginTop: -8 }}>
              Keep each review focused on a decision.
            </p>
            {project.scope.milestones.map((milestone, index) => (
              <div
                className="milestone"
                key={`${project.id}-milestone-${index}`}
              >
                <div className="milestone-heading">
                  <input
                    aria-label={`Milestone ${index + 1} name`}
                    disabled={editingDisabled}
                    onChange={(e) =>
                      setScope({
                        milestones: project.scope.milestones.map(
                          (item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, name: e.target.value }
                              : item,
                        ),
                      })
                    }
                    style={{
                      background: "transparent",
                      border: 0,
                      color: "#f7f4f2",
                      fontSize: 14,
                      fontWeight: 700,
                      padding: 0,
                      width: "100%",
                    }}
                    value={milestone.name}
                  />
                  {!editingDisabled && (
                    <button
                      aria-label={`Remove milestone ${index + 1}`}
                      className="remove-btn"
                      onClick={() =>
                        setScope({
                          milestones: project.scope.milestones.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        })
                      }
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <input
                  aria-label={`Milestone ${index + 1} timing`}
                  disabled={editingDisabled}
                  onChange={(e) =>
                    setScope({
                      milestones: project.scope.milestones.map(
                        (item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, timing: e.target.value }
                            : item,
                      ),
                    })
                  }
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "#e3aaa4",
                    fontFamily: "DM Mono, monospace",
                    fontSize: 12,
                    padding: 0,
                    width: "100%",
                  }}
                  value={milestone.timing}
                />
                <textarea
                  aria-label={`Milestone ${index + 1} detail`}
                  disabled={editingDisabled}
                  onChange={(e) =>
                    setScope({
                      milestones: project.scope.milestones.map(
                        (item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, detail: e.target.value }
                            : item,
                      ),
                    })
                  }
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "#8b8989",
                    fontSize: 14,
                    minHeight: 40,
                    padding: 0,
                    resize: "vertical",
                    width: "100%",
                  }}
                  value={milestone.detail}
                />
              </div>
            ))}
            {!editingDisabled && (
              <button
                className="add-item"
                onClick={() =>
                  setScope({
                    milestones: [
                      ...project.scope.milestones,
                      {
                        name: "New milestone",
                        timing: "Next",
                        detail: "What should be true after this review?",
                      },
                    ],
                  })
                }
                type="button"
              >
                <Plus size={13} style={{ verticalAlign: "-2px" }} /> Add
                milestone
              </button>
            )}
            <div
              style={{
                borderTop: "1px solid var(--line)",
                marginTop: 28,
                paddingTop: 22,
              }}
            >
              <h3>Current status</h3>
              <span className={`status status-${project.status}`}>
                {project.status.replace("_", " ")}
              </span>
              <p style={{ color: "#777", fontSize: 13 }}>
                {project.status === "changes_requested"
                  ? "The client has left a change request. Update the working scope, then share a fresh snapshot."
                  : project.status === "shared"
                    ? "A client can review this snapshot. Any new edits require a fresh link."
                    : "Save when the scope is ready, then share a review snapshot."}
              </p>
            </div>
          </section>
        </div>
      ) : tab === "analysis" ? (
        <AnalysisPanel
          analysis={project.analysis}
          disabled={editingDisabled}
          onChange={setAnalysis}
        />
      ) : tab === "versions" ? (
        <VersionPanel compare={compare} loading={versionsLoading} onCompare={compareVersions} onRefresh={loadVersions} versions={versions} />
      ) : (
        <ChangeManagementPanel
          history={history}
          loading={historyLoading}
          onHistory={setHistory}
          onRefresh={refreshHistory}
          project={project}
        />
      )}
      {tab !== "changes" && tab !== "versions" && (
        <>
          <div className="editor-bottom">
            <span style={{ color: "#777", fontSize: 13 }}>
              {locked
                ? "Approved scopes stay unchanged."
                : "Changes stay local until you save."}
            </span>
            <div className="editor-bottom-right">
              {!locked && (
                <button
                  className="button-secondary"
                  disabled={saving || sharing}
                  onClick={save}
                >
                  {saving ? (
                    <LoaderCircle size={14} />
                  ) : (
                    <>
                      <Check size={14} style={{ verticalAlign: "-2px" }} /> Save
                      scope
                    </>
                  )}
                </button>
              )}
              {!locked && (
                <button
                  className="button-primary"
                  disabled={sharing || saving}
                  onClick={share}
                >
                  {sharing ? (
                    <LoaderCircle size={14} />
                  ) : (
                    <>
                      <Send size={14} style={{ verticalAlign: "-2px" }} /> Share
                      for review
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
          {shareUrl && (
            <div className="share-callout">
              <h3>Review snapshot ready</h3>
              <p>
                This link points to an immutable snapshot. Share it with your
                client; approval will lock this scope.
              </p>
              <button className="share-url" onClick={copyLink} type="button">
                {shareUrl}
              </button>
            </div>
          )}
          <ReviewSharingPanel projectId={project.id} reviewToken={project.reviewToken} />
          <ProjectAttachmentsPanel projectId={project.id} />
          <ProjectCommentsPanel reviewToken={project.reviewToken} />
        </>
      )}
      {error && (
        <p className="form-error" style={{ marginTop: 18 }}>
          {error}
        </p>
      )}
      {message && (
        <p className="form-success" style={{ marginTop: 18 }}>
          {message}
        </p>
      )}
    </div>
  );
}

function VersionPanel({
  versions,
  compare,
  onCompare,
  onRefresh,
  loading,
}: {
  versions: Array<{ version: number; createdAt: string; project: Project }>;
  compare: { left: number; right: number; changedFields: Array<{ field: string; left: unknown; right: unknown }> } | null;
  onCompare: (left: number, right: number) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [left, setLeft] = useState(versions[1]?.version ?? versions[0]?.version ?? 1);
  const [right, setRight] = useState(versions[0]?.version ?? 1);
  useEffect(() => {
    if (versions.length > 1) {
      setLeft(versions[1].version);
      setRight(versions[0].version);
    }
  }, [versions]);
  return (
    <section className="card version-panel">
      <div className="section-kicker">Immutable project history</div>
      <h2>Compare saved versions</h2>
      <div className="version-panel-toolbar"><p className="muted-copy">Every meaningful save is retained. Select two stored versions to see changed fields, deliverables, and milestones side by side.</p><button aria-label="Refresh saved versions" className="icon-button" disabled={loading} onClick={() => void onRefresh()} type="button"><RefreshCw size={14} /></button></div>
      {loading && !versions.length ? <p className="empty-history">Loading saved versions…</p> : versions.length < 2 ? <p className="empty-history">Save a change to create a second version.</p> : (
        <>
          <div className="version-selectors">
            <label>Earlier version<select value={left} onChange={(e) => setLeft(Number(e.target.value))}>{versions.map((version) => <option key={version.version} value={version.version}>v{version.version} · {new Date(version.createdAt).toLocaleString()}</option>)}</select></label>
            <label>Later version<select value={right} onChange={(e) => setRight(Number(e.target.value))}>{versions.map((version) => <option key={version.version} value={version.version}>v{version.version} · {new Date(version.createdAt).toLocaleString()}</option>)}</select></label>
            <button className="button-primary" disabled={left === right} onClick={() => onCompare(left, right)} type="button"><GitCompare size={14} /> Compare</button>
          </div>
          {compare && <div className="version-diff" role="status"><strong>v{compare.left} → v{compare.right}</strong>{compare.changedFields.length ? <div>{compare.changedFields.map((item) => <div className="version-diff-row" key={item.field}><span>{item.field}</span><code>{formatDiffValue(item.left)}</code><code>{formatDiffValue(item.right)}</code></div>)}</div> : <p>No changed fields.</p>}</div>}
        </>
      )}
      {versions.length > 0 && <div className="version-list">{versions.map((version) => <div key={version.version}><strong>v{version.version}</strong><span>{new Date(version.createdAt).toLocaleString()}</span><small>{version.project.title} · {version.project.scope.deliverables.length} deliverables</small></div>)}</div>}
    </section>
  );
}

function formatDiffValue(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text && text.length > 180 ? `${text.slice(0, 180)}…` : text ?? "—";
}

function AnalysisPanel({
  analysis,
  disabled,
  onChange,
}: {
  analysis: BriefAnalysis;
  disabled: boolean;
  onChange: (update: Partial<BriefAnalysis>) => void;
}) {
  return (
    <div className="editor-columns">
      <section className="card">
        <div className="analysis-banner">
          <Check size={16} color="#8be0ad" />
          <div>
            <strong>
              {analysis.mode === "openai"
                ? "Optional server analysis"
                : "Built-in analysis / local"}
            </strong>
            <span>These are planning inputs, ready for your judgment.</span>
          </div>
        </div>
        <h2>Summary</h2>
        <div className="field">
          <textarea
            disabled={disabled}
            onChange={(e) => onChange({ summary: e.target.value })}
            value={analysis.summary}
          />
        </div>
        <div className="field">
          <label>Audience</label>
          <input
            disabled={disabled}
            onChange={(e) => onChange({ audience: e.target.value })}
            value={analysis.audience}
          />
        </div>
        <EditableList
          disabled={disabled}
          label="Goals"
          onChange={(goals) => onChange({ goals })}
          values={analysis.goals}
        />
        <EditableList
          disabled={disabled}
          label="Questions"
          onChange={(questions) => onChange({ questions })}
          values={analysis.questions}
        />
      </section>
      <section className="card">
        <h2>Signals to carry into scope</h2>
        <EditableList
          disabled={disabled}
          label="Pages"
          onChange={(pages) => onChange({ pages })}
          values={analysis.pages}
        />
        <EditableList
          disabled={disabled}
          label="Needs"
          onChange={(needs) => onChange({ needs })}
          values={analysis.needs}
        />
        <EditableList
          disabled={disabled}
          label="Risks"
          onChange={(risks) => onChange({ risks })}
          values={analysis.risks}
        />
      </section>
    </div>
  );
}

function ChangeManagementPanel({
  history,
  loading,
  onHistory,
  onRefresh,
  project,
}: {
  history: ProjectHistory | null;
  loading: boolean;
  onHistory: (history: ProjectHistory) => void;
  onRefresh: () => void;
  project: Project;
}) {
  const [requestId, setRequestId] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [affected, setAffected] = useState("");
  const [price, setPrice] = useState("0");
  const [currency, setCurrency] = useState("USD");
  const [timeline, setTimeline] = useState("");
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [sending, setSending] = useState(false);
  function beginProposal(request: ChangeRequest) {
    setRequestId(request.id);
    setTitle(`Follow-up: ${request.title}`);
    setDetails(request.details);
    setAffected("");
    setPrice("0");
    setCurrency("USD");
    setTimeline("");
    setRationale("");
    setError("");
    setSaved("");
  }
  async function submitProposal() {
    setError("");
    setSaved("");
    setSending(true);
    try {
      const input = {
        requestId,
        title,
        details,
        affectedDeliverables: affected
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        priceAdjustment: Number(price),
        currency,
        timelineImpact: timeline,
        rationale,
      };
      {
        const response = await fetch(`/api/projects/${project.id}/changes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        onHistory(data.history);
      }
      setRequestId("");
      setSaved("Proposal sent for client decision.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not send proposal",
      );
    } finally {
      setSending(false);
    }
  }
  if (loading && !history)
    return (
      <div className="card">
        <p style={{ color: "#999", fontSize: 13 }}>
          Loading responses and change requests…
        </p>
      </div>
    );
  if (!history)
    return (
      <div className="card">
        <p className="form-error">
          Could not load project history. Open this tab again to retry.
        </p>
      </div>
    );
  return (
    <div className="change-layout">
      <section className="card">
        <div className="change-panel-heading">
          <div>
            <div className="section-kicker">Owner view / response history</div>
            <h2>Client responses</h2>
          </div>
          <button
            className="button-secondary"
            disabled={loading}
            onClick={onRefresh}
            type="button"
          >
            <RefreshCw size={13} style={{ verticalAlign: "-2px" }} /> Refresh
          </button>
        </div>
        {history.responses.length ? (
          history.responses.map((response) => (
            <div className="history-item" key={response.id}>
              <div>
                <strong>{response.name}</strong>
                <span
                  className={`status status-${response.action === "approval" ? "approved" : "changes_requested"}`}
                >
                  {response.action === "approval" ? "Approved" : "Feedback"}
                </span>
              </div>
              <p>{response.comment}</p>
              <small>
                {new Date(response.createdAt).toLocaleString()} ·{" "}
                {response.snapshotStatus} snapshot
              </small>
            </div>
          ))
        ) : (
          <div className="empty-history">
            <p>No client responses yet.</p>
            <span>
              Feedback, approval, and change requests will stay here after a
              review link is replaced.
            </span>
          </div>
        )}
      </section>
      <section className="card">
        <div className="change-panel-heading">
          <div>
            <div className="section-kicker">Post-approval work</div>
            <h2>Change requests</h2>
          </div>
          <span className={`status status-${project.status}`}>
            {project.status.replace("_", " ")}
          </span>
        </div>
        {history.changeRequests.length ? (
          history.changeRequests.map((request) => (
            <div className="change-request" key={request.id}>
              <div className="change-request-title">
                <div>
                  <strong>{request.title}</strong>
                  <span>
                    Requested by {request.requesterName} ·{" "}
                    {new Date(request.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <span
                  className={`status status-${request.status === "accepted" ? "approved" : request.status === "declined" ? "changes_requested" : "shared"}`}
                >
                  {request.status}
                </span>
              </div>
              <p>{request.details}</p>
              {request.proposals.map((proposal) => (
                <div className="proposal-row" key={proposal.id}>
                  <div>
                    <strong>
                      v{proposal.version} · {proposal.title}
                    </strong>
                    <span>
                      {proposal.currency} {proposal.priceAdjustment.toFixed(2)}{" "}
                      · {proposal.timelineImpact}
                    </span>
                  </div>
                  <span
                    className={`status status-${proposal.status === "accepted" ? "approved" : proposal.status === "declined" ? "changes_requested" : "shared"}`}
                  >
                    {proposal.status}
                  </span>
                  {proposal.decidedBy && (
                    <small>
                      Decision by {proposal.decidedBy}:{" "}
                      {proposal.decisionComment || "No comment"}
                    </small>
                  )}
                </div>
              ))}
              {project.status === "approved" &&
                (request.status === "open" ||
                  request.status === "declined") && (
                  <button
                    className="button-secondary"
                    onClick={() => beginProposal(request)}
                    type="button"
                  >
                    Write proposal
                  </button>
                )}
            </div>
          ))
        ) : (
          <div className="empty-history">
            <p>No post-approval requests yet.</p>
            <span>
              A client can request a change from the approved review page.
            </span>
          </div>
        )}
      </section>
      {requestId && (
        <section className="card proposal-form">
          <div className="section-kicker">Proposal draft</div>
          <h2>Price the requested change clearly.</h2>
          <p className="muted-copy">
            The approved scope stays unchanged. Enter any price and timeline
            impact yourself.
          </p>
          <div className="field">
            <label htmlFor="proposal-title">Proposal title</label>
            <input
              id="proposal-title"
              onChange={(e) => setTitle(e.target.value)}
              value={title}
            />
          </div>
          <div className="field">
            <label htmlFor="proposal-details">What will change</label>
            <textarea
              id="proposal-details"
              onChange={(e) => setDetails(e.target.value)}
              value={details}
            />
          </div>
          <div className="field">
            <label htmlFor="proposal-deliverables">
              Affected deliverables, one per line
            </label>
            <textarea
              id="proposal-deliverables"
              onChange={(e) => setAffected(e.target.value)}
              placeholder="Classes page\nBooking flow"
              value={affected}
            />
          </div>
          <div className="proposal-fields">
            <div className="field">
              <label htmlFor="proposal-price">Price adjustment</label>
              <input
                id="proposal-price"
                onChange={(e) => setPrice(e.target.value)}
                step="0.01"
                type="number"
                value={price}
              />
            </div>
            <div className="field">
              <label htmlFor="proposal-currency">Currency</label>
              <input
                id="proposal-currency"
                maxLength={3}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                value={currency}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="proposal-timeline">Timeline impact</label>
            <input
              id="proposal-timeline"
              onChange={(e) => setTimeline(e.target.value)}
              placeholder="e.g. Adds 3 working days"
              value={timeline}
            />
          </div>
          <div className="field">
            <label htmlFor="proposal-rationale">Owner rationale</label>
            <textarea
              id="proposal-rationale"
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Explain the trade-off or reason for the adjustment"
              value={rationale}
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          {saved && <p className="form-success">{saved}</p>}
          <div className="editor-bottom">
            <span className="muted-copy">
              Sent proposals become immutable until accepted or declined.
            </span>
            <button
              className="button-primary"
              disabled={sending}
              onClick={submitProposal}
              type="button"
            >
              {sending ? (
                <LoaderCircle size={14} />
              ) : (
                <>
                  <Send size={14} style={{ verticalAlign: "-2px" }} /> Send
                  proposal
                </>
              )}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
