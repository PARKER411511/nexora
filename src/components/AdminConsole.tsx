"use client";

import Link from "next/link";
import { Activity, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AdminOverview } from "@/lib/types";

type SupportStatus = "open" | "in_progress" | "resolved" | "closed";
type SupportItem = { id: string; subject: string; body: string; status: SupportStatus; createdAt: string; updatedAt: string; email: string };
type AuditItem = { id: string; action: string; targetType: string; targetId: string; createdAt: string; actorEmail?: string; actorName?: string; payload?: Record<string, unknown> };
type SectionErrors = { customers?: string; support?: string; audit?: string; health?: string };

async function readJson(response: Response) {
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not load admin data.");
  return data;
}

export function AdminConsole({ initial }: { initial: AdminOverview }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SupportStatus | "all">("all");
  const [sort, setSort] = useState<"joined" | "name" | "projects">("joined");
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState(initial.customers);
  const [total, setTotal] = useState(initial.customerCount);
  const [support, setSupport] = useState<SupportItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [health, setHealth] = useState<{ generatedAt: string; database: string; recentErrors: number; openSupport: number; pendingInvites: number } | null>(null);
  const [errors, setErrors] = useState<SectionErrors>({});
  const [loading, setLoading] = useState(true);
  const [mutationError, setMutationError] = useState("");
  const [busySupportId, setBusySupportId] = useState("");
  const requestGeneration = useRef(0);
  const pageSize = 10;

  const load = useCallback(async (signal?: AbortSignal) => {
    const generation = ++requestGeneration.current;
    const isCurrent = () => !signal?.aborted && generation === requestGeneration.current;
    setLoading(true);
    setErrors({});
    const query = new URLSearchParams({ search, page: String(page), pageSize: String(pageSize), sort });
    const requests = [
      fetch(`/api/admin/customers?${query}`, { signal }),
      fetch("/api/admin/support", { signal }),
      fetch("/api/admin/audit", { signal }),
      fetch("/api/admin/health", { signal }),
    ];
    const results = await Promise.allSettled(requests);
    if (!isCurrent()) return;
    const nextErrors: SectionErrors = {};
    for (const [index, result] of results.entries()) {
      const section = (["customers", "support", "audit", "health"] as const)[index];
      if (result.status === "rejected") nextErrors[section] = result.reason instanceof Error ? result.reason.message : "Could not load this section.";
    }
    const responseResults = results.map((result) => result.status === "fulfilled" ? result.value : null);
    const [customerResponse, supportResponse, auditResponse, healthResponse] = responseResults;
    if (customerResponse) {
      try { const data = await readJson(customerResponse); if (!isCurrent()) return; setCustomers((data.customers ?? []) as AdminOverview["customers"]); setTotal(Number(data.total ?? 0)); }
      catch (reason) { nextErrors.customers = reason instanceof Error ? reason.message : "Could not load customers."; }
    }
    if (supportResponse) {
      try { const data = await readJson(supportResponse); if (!isCurrent()) return; setSupport((data.requests ?? []) as SupportItem[]); }
      catch (reason) { nextErrors.support = reason instanceof Error ? reason.message : "Could not load support queue."; }
    }
    if (auditResponse) {
      try { const data = await readJson(auditResponse); if (!isCurrent()) return; setAudit((data.events ?? []) as AuditItem[]); }
      catch (reason) { nextErrors.audit = reason instanceof Error ? reason.message : "Could not load audit activity."; }
    }
    if (healthResponse) {
      try { const data = await readJson(healthResponse); if (!isCurrent()) return; setHealth(data as typeof health); }
      catch (reason) { nextErrors.health = reason instanceof Error ? reason.message : "Could not load service health."; }
    }
    if (!isCurrent()) return;
    setErrors(nextErrors);
    setLoading(false);
  }, [page, search, sort]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((reason) => {
      if (!controller.signal.aborted) { setErrors({ customers: reason instanceof Error ? reason.message : "Could not load admin data." }); setLoading(false); }
    });
    return () => controller.abort();
  }, [load]);

  const sorted = useMemo(() => customers, [customers]);
  const visibleSupport = support.filter((item) => status === "all" || item.status === status);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  async function setSupportStatus(id: string, next: SupportStatus) {
    setBusySupportId(id); setMutationError("");
    try {
      const response = await fetch("/api/admin/support", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status: next }) });
      await readJson(response);
      setSupport((items) => items.map((item) => item.id === id ? { ...item, status: next } : item));
    } catch (reason) { setMutationError(reason instanceof Error ? reason.message : "Could not update support request."); }
    finally { setBusySupportId(""); }
  }

  return (
    <section className="admin-console">
      <div className="admin-console-heading"><div><div className="section-kicker">Operations</div><h2>Admin controls</h2></div><button className="button-secondary" disabled={loading} onClick={() => void load()} type="button"><RefreshCw size={13} /> {loading ? "Refreshing…" : "Refresh"}</button></div>
      {(mutationError || Object.values(errors).length > 0) && <div className="form-error" role="alert"><p>{mutationError || "Some admin data could not be loaded."}</p><Link className="text-link" href="/workspace/profile">Verify fresh TOTP in Profile security, then retry.</Link></div>}
      <div className="admin-health-row"><div className="health-pill"><Activity size={14} /><span>Database</span><strong>{health?.database ?? (errors.health ? "error" : "checking")}</strong></div><span>Errors (24h): {health?.recentErrors ?? "—"}</span><span>Open support: {health?.openSupport ?? "—"}</span><span>Pending invites: {health?.pendingInvites ?? "—"}</span></div>
      <section className="overview-card"><div className="overview-card-header"><div><div className="section-kicker">Customer search</div><h2>Accounts</h2></div><span className="overview-helper">{total} matching accounts</span></div><p className="profile-muted">Customer details are read-only. Suspension and support status changes require a fresh administrator TOTP verification at AAL2.</p><div className="project-filters"><input aria-label="Search customers" className="search-bar" onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Name, email, or company" value={search} /><select aria-label="Sort customers" className="search-bar" onChange={(event) => { setPage(1); setSort(event.target.value as typeof sort); }} value={sort}><option value="joined">Recent activity</option><option value="name">Name</option><option value="projects">Projects</option></select></div>{errors.customers ? <p className="form-error">{errors.customers} <button className="button-quiet" onClick={() => void load()} type="button">Retry</button></p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Company</th><th>Projects</th><th>Detail</th></tr></thead><tbody>{sorted.map((customer) => <tr key={customer.id}><td><strong>{customer.name || "Unnamed account"}</strong><span>{customer.email}</span></td><td>{customer.company || "—"}</td><td>{customer.projectCount}</td><td><Link className="text-link" href={`/admin/customers/${customer.id}`}>Open detail</Link></td></tr>)}</tbody></table></div>}<div className="pagination"><button aria-label="Previous customer page" className="icon-button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} type="button"><ChevronLeft size={14} /></button><span>Page {page} of {pageCount}</span><button aria-label="Next customer page" className="icon-button" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)} type="button"><ChevronRight size={14} /></button></div></section>
      <div className="admin-ops-grid"><section className="overview-card"><div className="section-kicker">Support queue</div><h2>Customer requests</h2><select aria-label="Filter support requests" className="search-bar" onChange={(event) => setStatus(event.target.value as SupportStatus | "all")} value={status}><option value="all">All statuses</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>{errors.support ? <p className="form-error">{errors.support} <button className="button-quiet" onClick={() => void load()} type="button">Retry</button></p> : visibleSupport.length ? visibleSupport.map((item) => <article className="support-row" key={item.id}><div><strong>{item.subject}</strong><span>{item.email} · {new Date(item.updatedAt).toLocaleString()}</span><p>{item.body}</p></div><select aria-label={`Status for ${item.subject}`} disabled={busySupportId === item.id} onChange={(event) => void setSupportStatus(item.id, event.target.value as SupportStatus)} value={item.status}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></article>) : <p className="empty-history">No matching support requests.</p>}</section><section className="overview-card"><div className="section-kicker">Audit activity</div><h2>Recent protected actions</h2>{errors.audit ? <p className="form-error">{errors.audit} <button className="button-quiet" onClick={() => void load()} type="button">Retry</button></p> : audit.length ? audit.slice(0, 12).map((item) => <div className="audit-row" key={item.id}><strong>{item.action.replaceAll(".", " ")}</strong><span>{item.actorName || item.actorEmail || "System"} · {item.targetType} / {item.targetId} · {new Date(item.createdAt).toLocaleString()}</span><small>{item.payload ? JSON.stringify(item.payload) : ""}</small></div>) : <p className="empty-history">No audit events available.</p>}</section></div>
    </section>
  );
}
