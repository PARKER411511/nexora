"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function AdminProjectDetail({ id }: { id: string }) {
  const [project, setProject] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { fetch(`/api/admin/projects/${id}`).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load project."); setProject(data.project); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load project.")); }, [id]);
  if (error) return <div className="workspace-main"><p className="form-error" role="alert">{error}</p><Link className="button-secondary" href="/admin">Back to admin</Link></div>;
  if (!project) return <div className="workspace-main"><p className="muted-copy">Loading project detail…</p></div>;
  const scope = (project.scope ?? {}) as { deliverables?: string[]; included?: string[]; excluded?: string[]; milestones?: Array<{ name: string; detail: string; timing: string }> };
  return <div className="workspace-main"><Link className="back-link" href="/admin">← Back to admin</Link><div className="workspace-heading"><div><div className="section-kicker">Admin / project detail</div><h1>{String(project.title ?? "Untitled project")}</h1><p>{String(project.client ?? "")} · Owner {String(project.ownerName ?? project.ownerEmail ?? "unknown")}</p></div><span className={`status status-${String(project.status ?? "draft")}`}>{String(project.status ?? "draft").replaceAll("_", " ")}</span></div><div className="admin-detail-grid"><section className="overview-card"><div className="section-kicker">Brief</div><h2>Original context</h2><p className="preserve-copy">{String(project.brief ?? "")}</p></section><section className="overview-card"><div className="section-kicker">Scope</div><h2>Deliverables</h2><ul className="review-list">{(scope.deliverables ?? []).map((item) => <li key={item}>{item}</li>)}</ul><h3>Included</h3><ul className="review-list">{(scope.included ?? []).map((item) => <li key={item}>{item}</li>)}</ul><h3>Excluded</h3><ul className="review-list">{(scope.excluded ?? []).map((item) => <li key={item}>{item}</li>)}</ul></section></div><section className="overview-card"><div className="section-kicker">Milestones</div>{(scope.milestones ?? []).map((milestone) => <div className="review-milestone" key={milestone.name}><strong>{milestone.name}</strong><span>{milestone.timing}</span><p>{milestone.detail}</p></div>)}</section></div>;
}
