"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { BriefAnalysis, BriefTemplate, Scope, Workspace } from "@/lib/types";
import { validateScope } from "@/lib/validation";

const example =
  "A warm, editorial website for a neighborhood strength studio. It should explain the coaching approach, show class formats, help new members book an intro session, and feel confident without looking like a generic fitness template. The studio has a new identity, a few photography selects, and wants to launch before the autumn intake.";

export function NewProjectForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [brief, setBrief] = useState("");
  const [tags, setTags] = useState("");
  const [deadline, setDeadline] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const [templates, setTemplates] = useState<BriefTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [templateMessage, setTemplateMessage] = useState("");
  const [scopeTemplate, setScopeTemplate] = useState<Scope | null>(null);
  const [analysis, setAnalysis] = useState<BriefAnalysis | null>(null);
  const [preferOpenAI, setPreferOpenAI] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/api/workspaces").then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load workspaces.");
      if (!active) return;
      const next = (data.workspaces ?? []) as Workspace[];
      setWorkspaces(next);
      setWorkspaceId(next.find((item) => !item.personal)?.id ?? next[0]?.id ?? "");
    }).catch(() => { if (active) setWorkspaces([]); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!workspaceId) { setTemplates([]); return; }
    fetch(`/api/templates?workspaceId=${encodeURIComponent(workspaceId)}`).then(async (response) => {
      const data = await response.json();
      if (response.ok) setTemplates((data.templates ?? []) as BriefTemplate[]);
    }).catch(() => setTemplates([]));
  }, [workspaceId]);
  async function analyze() {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, preferOpenAI }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAnalysis(data.analysis);
      if (data.notice) setNotice(data.notice);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not analyze brief",
      );
    } finally {
      setLoading(false);
    }
  }
  async function create() {
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          client,
          brief,
          analysis,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          deadline: deadline || null,
          workspaceId: workspaceId || undefined,
          scope: scopeTemplate ?? undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.push(`/workspace/projects/${data.project.id}`);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not create project",
      );
      setSaving(false);
    }
  }
  const busy = loading || saving;
  return (
    <div className="editor-wrap">
      <Link className="back-link" href="/workspace">
        <ArrowLeft size={13} style={{ verticalAlign: "-2px" }} /> Back to
        workspace
      </Link>
      <div className="editor-header">
        <div>
          <div className="section-kicker">New project / 01</div>
          <h1>Start with the brief.</h1>
          <p>
            Keep the context intact. Nexora will help you find the shape inside
            it.
          </p>
        </div>
      </div>
      <div className="editor-tabs">
        <span className="editor-tab active">Capture</span>
        <span className="editor-tab">Analyze</span>
        <span className="editor-tab">Shape scope</span>
      </div>
      <div className="editor-columns">
        <section className="card">
          <h2>Project context</h2>
          <div className="field">
            <label htmlFor="project-title">Project name</label>
            <input
              disabled={busy}
              id="project-title"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Northline Studio website"
              value={title}
            />
          </div>
          <div className="field">
            <label htmlFor="project-workspace">Workspace</label>
            <select id="project-workspace" onChange={(e) => setWorkspaceId(e.target.value)} value={workspaceId}>
              {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}{workspace.personal ? " (personal)" : ""}</option>)}
            </select>
            <small className="field-help">Team projects inherit the workspace member roles.</small>
          </div>
          <div className="field">
            <label htmlFor="project-template">Start from a saved template</label>
            <select id="project-template" defaultValue="" onChange={(e) => {
              const selected = templates.find((template) => template.id === e.target.value);
              if (selected) {
                setBrief(selected.brief);
                setTags(selected.tags.join(", "));
                setScopeTemplate(selected.scope && validateScope(selected.scope) ? selected.scope : null);
                setAnalysis(null);
                setTemplateMessage(selected.scope && validateScope(selected.scope) ? "Brief and scope loaded." : "Brief loaded. You can shape the scope after creation.");
              }
            }}>
              <option value="">Blank brief</option>
              {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
            {workspaceId && <div className="template-save-row"><input aria-label="New template name" onChange={(e) => setTemplateName(e.target.value)} placeholder="Save current brief as…" value={templateName} /><button className="button-quiet" disabled={!templateName.trim() || brief.length < 24} onClick={async () => {
              setTemplateMessage("");
              try {
                const response = await fetch("/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId, name: templateName, brief, scope: scopeTemplate, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) }) });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || "Could not save template.");
                setTemplates((items) => [data.template, ...items]); setTemplateName(""); setTemplateMessage("Template saved.");
              } catch (reason) { setTemplateMessage(reason instanceof Error ? reason.message : "Could not save template."); }
            }} type="button">Save template</button></div>}
            {templateMessage && <small className={templateMessage === "Template saved." ? "form-success" : "form-error"}>{templateMessage}</small>}
          </div>
          <div className="field">
            <label htmlFor="project-client">Client or team</label>
            <input
              disabled={busy}
              id="project-client"
              onChange={(e) => setClient(e.target.value)}
              placeholder="e.g. Amina / Northline Studio"
              value={client}
            />
          </div>
          <div className="field">
            <label htmlFor="project-tags-new">Tags</label>
            <input
              disabled={busy}
              id="project-tags-new"
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. website, priority"
              value={tags}
            />
            <small className="field-help">Optional, comma-separated labels.</small>
          </div>
          <div className="field">
            <label htmlFor="project-deadline-new">Deadline</label>
            <input
              disabled={busy}
              id="project-deadline-new"
              onChange={(e) => setDeadline(e.target.value)}
              type="date"
              value={deadline}
            />
          </div>
          <div className="field">
            <label htmlFor="project-brief">The brief</label>
            <textarea
              disabled={busy}
              id="project-brief"
              onChange={(e) => {
                setBrief(e.target.value);
                setAnalysis(null);
                setNotice("");
                setError("");
              }}
              placeholder="Paste the client’s words, notes, and context here…"
              value={brief}
            />
          </div>
          <button
            className="button-quiet"
            disabled={busy}
            onClick={() => {
              setBrief(example);
              setAnalysis(null);
              setNotice("");
              setError("");
            }}
            type="button"
          >
            Use the sample gym brief
          </button>
          <div style={{ marginTop: 18 }}>
            <label
              style={{
                color: "#c7c3c3",
                display: "flex",
                fontSize: 11,
                gap: 8,
              }}
            >
              <input
                checked={preferOpenAI}
                disabled={busy}
                onChange={(e) => {
                  setPreferOpenAI(e.target.checked);
                  setAnalysis(null);
                  setNotice("");
                  setError("");
                }}
                type="checkbox"
              />{" "}
              Use optional AI analysis if connected
            </label>
            <small
              style={{
                color: "#777",
                display: "block",
                fontSize: 10,
                margin: "7px 0 0 24px",
              }}
            >
              Uses Built-in analysis / local if AI isn&apos;t connected.
            </small>
          </div>
        </section>
        <section className="card">
          <div className="analysis-banner">
            <Sparkles size={17} color="#ff645a" />
            <div>
              <strong>
                {analysis ? "Brief shape found" : "Ready when you are"}
              </strong>
              <span>
                {analysis
                  ? `${analysis.mode === "openai" ? "Optional server analysis" : "Built-in analysis / local"}`
                  : "Analyze to surface useful questions and first scope inputs."}
              </span>
            </div>
          </div>
          {analysis ? (
            <>
              <h2>First read</h2>
              <p style={{ color: "#c7c3c3", fontSize: 13 }}>
                {analysis.summary}
              </p>
              <h3>Likely audience</h3>
              <p style={{ color: "#8b8989", fontSize: 12 }}>
                {analysis.audience}
              </p>
              <h3>Likely pages</h3>
              <div className="tag-list">
                {analysis.pages.map((page) => (
                  <span className="tag" key={page}>
                    {page}
                  </span>
                ))}
              </div>
              <h3>Questions to resolve</h3>
              {analysis.questions.map((question) => (
                <div className="line-item" key={question}>
                  <span>{question}</span>
                </div>
              ))}
            </>
          ) : (
            <div style={{ color: "#777", fontSize: 12, lineHeight: 1.8 }}>
              <p>We&apos;ll look for:</p>
              <ul>
                <li>what the site needs to help people do</li>
                <li>which pages and content are implied</li>
                <li>risks and questions worth asking early</li>
              </ul>
            </div>
          )}
        </section>
      </div>
      {error && (
        <p className="form-error" style={{ marginTop: 18 }}>
          {error}
        </p>
      )}
      {notice && (
        <p className="form-success" style={{ marginTop: 18 }}>
          {notice}
        </p>
      )}
      <div className="editor-bottom">
        <span style={{ color: "#777", fontSize: 11 }}>
          {analysis
            ? "Your first scope will be ready after creation."
            : "A detailed brief makes the first read more useful."}
        </span>
        <div className="editor-bottom-right">
          {analysis ? (
            <button className="button-primary" disabled={busy} onClick={create}>
              {saving ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <>
                  Create project{" "}
                  <ArrowRight size={14} style={{ verticalAlign: "-2px" }} />
                </>
              )}
            </button>
          ) : (
            <button
              className="button-primary"
              disabled={busy}
              onClick={analyze}
            >
              {loading ? (
                <LoaderCircle className="spin" size={14} />
              ) : (
                <>
                  Analyze brief{" "}
                  <ArrowRight size={14} style={{ verticalAlign: "-2px" }} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
